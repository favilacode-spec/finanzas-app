import { useEffect, useState } from 'react'
import { Inbox as InboxIcon, Check, X, Apple, Mail, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import DistributionModal from '../components/DistributionModal'

export default function Inbox() {
  const { household } = useAuth()
  const [items, setItems] = useState([])
  const [accounts, setAccounts] = useState([])
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState({})
  const [rules, setRules] = useState([])
  const [dist, setDist] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [p, a, c, r] = await Promise.all([
        supabase.from('pending_transactions').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('accounts').select('id,name').eq('archived', false),
        supabase.from('categories').select('id,name,kind'),
        supabase.from('distribution_rules').select('*').order('sort'),
      ])
      setItems(p.data || []); setAccounts(a.data || []); setCats(c.data || []); setRules(r.data || [])
      const d = {}
      ;(p.data || []).forEach((it) => {
        d[it.id] = {
          account: a.data?.[0]?.id || '',
          toAccount: a.data?.[1]?.id || a.data?.[0]?.id || '',
          category: it.suggested_category_id || '',
          amount: it.amount ?? '',
          type: it.suggested_type || 'expense',
        }
      })
      setDraft(d)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (household) load() }, [household])

  const setField = (id, key, val) => setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: val } }))

  const approve = async (it) => {
    const d = draft[it.id]
    if (!d?.account) return alert('Elegí una cuenta')
    if (d.type === 'transfer') {
      if (!d.toAccount || d.toAccount === d.account) return alert('Elegí una cuenta destino distinta')
    }
    if (d.amount != null && d.amount !== '' && Number(d.amount) !== Number(it.amount)) {
      await supabase.from('pending_transactions').update({ amount: parseInt(String(d.amount).replace(/[^0-9]/g, ''), 10) || 0 }).eq('id', it.id)
    }
    const finalAmount = (d.amount != null && d.amount !== '')
      ? (parseInt(String(d.amount).replace(/[^0-9]/g, ''), 10) || 0)
      : Number(it.amount || 0)
    const { error } = await supabase.rpc('approve_pending', {
      p_id: it.id,
      p_account: d.account,
      p_category: d.type === 'transfer' ? null : (d.category || null),
      p_type: d.type || 'expense',
      p_to_account: d.type === 'transfer' ? d.toAccount : null,
    })
    if (error) return alert(error.message)
    // Si fue un ingreso y hay reglas de distribución, mostrar el reparto
    if ((d.type || 'expense') === 'income' && rules.length > 0 && finalAmount > 0) {
      setDist({ amount: finalAmount })
    }
    load()
  }
  const reject = async (id) => { await supabase.from('pending_transactions').update({ status: 'rejected' }).eq('id', id); load() }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  return (
    <div>
      <p className="text-2" style={{ marginBottom: 16 }}>
        Acá llegan los movimientos detectados automáticamente: gastos de Apple Pay, pagos de servicios,
        transferencias recibidas (ingresos) y transferencias entre tus cuentas. Revisalos y aprobalos con un toque.
      </p>

      {items.length === 0 ? (
        <div className="card empty-state">
          <InboxIcon size={42} />
          <p>No hay movimientos por revisar.</p>
          <p style={{ fontSize: 12.5, marginTop: 4 }}>Configurá Apple Pay y los emails en Ajustes para que aparezcan acá automáticamente.</p>
        </div>
      ) : (
        <div className="grid grid-2">
          {items.map((it) => {
            const d = draft[it.id] || {}
            const type = d.type || 'expense'
            const isIncome = type === 'income'
            const isTransfer = type === 'transfer'
            const catList = cats.filter((c) => c.kind === (isIncome ? 'income' : 'expense'))
            const amtClass = isIncome ? 'amount-pos' : isTransfer ? 'text-2' : 'amount-neg'
            const sign = isIncome ? '+' : isTransfer ? '' : '−'
            return (
              <div className="card" key={it.id}>
                <div className="row between" style={{ marginBottom: 12 }}>
                  <span className="row" style={{ gap: 9 }}>
                    <span className="icon-chip" style={{ background: isIncome ? 'var(--blue-soft)' : 'var(--bg-elevated)', color: isIncome ? '#e7e7ea' : 'var(--text)' }}>
                      {it.source === 'apple_pay' ? <Apple size={18} /> : <Mail size={18} />}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{it.merchant || (isIncome ? 'Transferencia recibida' : 'Gasto detectado')}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {it.source === 'apple_pay' ? 'Apple Pay' : 'Email banco'} · {fmtDate(it.occurred_on)}
                      </div>
                    </div>
                  </span>
                  <span className={amtClass} style={{ fontSize: 18 }}>{sign}{money(it.amount || 0)}</span>
                </div>

                {it.raw_text && <div className="text-muted" style={{ fontSize: 12, marginBottom: 12, padding: 8, background: 'var(--bg-base)', borderRadius: 8 }}>{it.raw_text}</div>}

                {/* Tipo */}
                <div className="segmented" style={{ marginBottom: 12 }}>
                  <button type="button" className={isIncome ? 'active-blue' : ''} onClick={() => { setField(it.id, 'type', 'income'); setField(it.id, 'category', '') }}>
                    <ArrowDownLeft size={13} style={{ verticalAlign: -2, marginRight: 3 }} />Ingreso
                  </button>
                  <button type="button" className={type === 'expense' ? 'active-red' : ''} onClick={() => { setField(it.id, 'type', 'expense'); setField(it.id, 'category', '') }}>
                    <ArrowUpRight size={13} style={{ verticalAlign: -2, marginRight: 3 }} />Gasto
                  </button>
                  <button type="button" className={isTransfer ? 'active-gray' : ''} onClick={() => setField(it.id, 'type', 'transfer')}>
                    <ArrowLeftRight size={13} style={{ verticalAlign: -2, marginRight: 3 }} />Transfer.
                  </button>
                </div>

                {isTransfer ? (
                  <div className="grid grid-2" style={{ gap: 10 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Salió de</label>
                      <select className="form-select" value={d.account || ''} onChange={(e) => setField(it.id, 'account', e.target.value)}>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Entró a</label>
                      <select className="form-select" value={d.toAccount || ''} onChange={(e) => setField(it.id, 'toAccount', e.target.value)}>
                        {accounts.filter((a) => a.id !== d.account).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-2" style={{ gap: 10 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Cuenta</label>
                      <select className="form-select" value={d.account || ''} onChange={(e) => setField(it.id, 'account', e.target.value)}>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Categoría</label>
                      <select className="form-select" value={d.category || ''} onChange={(e) => setField(it.id, 'category', e.target.value)}>
                        <option value="">Sin categoría</option>
                        {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {(it.amount == null) && (
                  <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                    <label>Monto (₲)</label>
                    <input className="form-input" inputMode="numeric" value={d.amount || ''} onChange={(e) => setField(it.id, 'amount', e.target.value)} placeholder="0" />
                  </div>
                )}

                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => approve(it)}><Check size={15} /> Aprobar</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => reject(it.id)}><X size={15} /> Descartar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dist && <DistributionModal amount={dist.amount} rules={rules} accounts={accounts} onClose={() => setDist(null)} />}
    </div>
  )
}
