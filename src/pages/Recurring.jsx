import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, Repeat, CheckCircle2, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate, todayISO } from '../lib/format'
import Modal from '../components/Modal'

const FREQ = { daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual', yearly: 'Anual' }
const monthlyEq = (r) => {
  const a = Number(r.amount || 0)
  if (r.frequency === 'daily') return a * 30
  if (r.frequency === 'weekly') return a * 4.33
  if (r.frequency === 'biweekly') return a * 2
  if (r.frequency === 'yearly') return a / 12
  return a
}

function advance(dateStr, freq) {
  const d = new Date(dateStr)
  if (freq === 'daily') d.setDate(d.getDate() + 1)
  else if (freq === 'weekly') d.setDate(d.getDate() + 7)
  else if (freq === 'biweekly') d.setDate(d.getDate() + 15)
  else if (freq === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export default function Recurring() {
  const { household, user } = useAuth()
  const [items, setItems] = useState([])
  const [accounts, setAccounts] = useState([])
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [fundMonths, setFundMonths] = useState(3)

  const load = async () => {
    setLoading(true)
    const [r, a, c] = await Promise.all([
      supabase.from('recurring_transactions').select('*').order('next_date'),
      supabase.from('accounts').select('id,name').eq('archived', false),
      supabase.from('categories').select('id,name,kind'),
    ])
    setItems(r.data || []); setAccounts(a.data || []); setCats(c.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household])

  const accName = (id) => accounts.find((a) => a.id === id)?.name || '—'
  const catName = (id) => cats.find((c) => c.id === id)?.name || ''

  const post = async (r) => {
    await supabase.from('transactions').insert({
      household_id: household.id, account_id: r.account_id, type: r.type, amount: r.amount,
      currency: 'PYG', category_id: r.category_id, occurred_on: r.next_date, payee: r.payee, note: r.note,
      source: 'manual', created_by: user.id,
    })
    await supabase.from('recurring_transactions').update({ next_date: advance(r.next_date, r.frequency) }).eq('id', r.id)
    load()
  }
  const del = async (id) => { if (confirm('¿Eliminar este recurrente?')) { await supabase.from('recurring_transactions').delete().eq('id', id); load() } }
  const toggleFund = async (r) => { await supabase.from('recurring_transactions').update({ include_in_fund: !r.include_in_fund }).eq('id', r.id); load() }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  const fundItems = items.filter((r) => r.include_in_fund && r.type === 'expense')
  const monthlyFund = fundItems.reduce((s, r) => s + monthlyEq(r), 0)
  const fundTarget = monthlyFund * fundMonths

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16 }}>
        <p className="text-2">Movimientos que se repiten. Registralos con un toque cuando toca.</p>
        <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={18} /> Nuevo</button>
      </div>

      {/* Fondo de emergencia */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 12 }}>
            <span className="icon-chip" style={{ background: 'rgba(255,255,255,0.06)' }}><ShieldCheck size={20} /></span>
            <div>
              <div className="card-title" style={{ margin: 0 }}>Fondo de emergencia</div>
              <div className="text-muted" style={{ fontSize: 12.5 }}>
                {fundItems.length === 0 ? 'Marcá abajo "Fondo" en los gastos esenciales para incluirlos.' : `${fundItems.length} gastos esenciales · ${money(monthlyFund)}/mes`}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="stat-value" style={{ fontSize: 24 }}>{money(fundTarget)}</div>
            <div className="row" style={{ gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
              <span className="text-muted" style={{ fontSize: 12 }}>cubre</span>
              {[3, 6, 12].map((m) => (
                <button key={m} type="button" onClick={() => setFundMonths(m)}
                  className="badge" style={{ cursor: 'pointer', borderColor: fundMonths === m ? 'var(--blue)' : 'var(--border)', color: fundMonths === m ? '#fff' : 'var(--text-2)' }}>{m}m</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card empty-state"><Repeat size={40} /><p>Agregá tus pagos recurrentes (alquiler, suscripciones, salario…).</p></div>
      ) : (
        <div className="grid grid-2">
          {items.map((r) => {
            const due = r.next_date <= todayISO()
            return (
              <div className="card" key={r.id}>
                <div className="row between" style={{ marginBottom: 8 }}>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="icon-chip" style={{ color: r.type === 'income' ? '#e7e7ea' : '#86868c', background: r.type === 'income' ? 'var(--blue-soft)' : 'var(--red-soft)' }}><Repeat size={18} /></span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{r.payee || catName(r.category_id) || 'Recurrente'}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{FREQ[r.frequency]} · {accName(r.account_id)}</div>
                    </div>
                  </span>
                  <div className="row" style={{ gap: 4 }}>
                    {r.type === 'expense' && (
                      <button className="icon-btn" onClick={() => toggleFund(r)} title="Incluir en fondo de emergencia"
                        style={{ color: r.include_in_fund ? '#e7e7ea' : 'var(--text-muted)', background: r.include_in_fund ? 'var(--blue-soft)' : undefined }}>
                        <ShieldCheck size={14} />
                      </button>
                    )}
                    <button className="icon-btn" onClick={() => setForm(r)}><Pencil size={14} /></button>
                    <button className="icon-btn" onClick={() => del(r.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="row between">
                  <span className={r.type === 'income' ? 'amount-pos' : 'amount-neg'} style={{ fontSize: 18 }}>{r.type === 'income' ? '+' : '−'}{money(r.amount)}</span>
                  <span className="badge" style={due ? { background: 'var(--red-soft)', color: '#c9c9cf', borderColor: 'var(--red-border)' } : undefined}>Próx: {fmtDate(r.next_date)}</span>
                </div>
                <button className="btn btn-secondary btn-sm btn-block" style={{ marginTop: 12 }} onClick={() => post(r)}><CheckCircle2 size={15} /> Registrar ahora</button>
              </div>
            )
          })}
        </div>
      )}

      {form && <RecForm rec={form} household={household} accounts={accounts} cats={cats} onClose={() => setForm(null)} onSaved={load} />}
    </div>
  )
}

function RecForm({ rec, household, accounts, cats, onClose, onSaved }) {
  const isNew = !rec.id
  const [type, setType] = useState(rec.type || 'expense')
  const [amount, setAmount] = useState(rec.amount ? String(rec.amount) : '')
  const [accountId, setAccountId] = useState(rec.account_id || accounts[0]?.id || '')
  const [categoryId, setCategoryId] = useState(rec.category_id || '')
  const [freq, setFreq] = useState(rec.frequency || 'monthly')
  const [nextDate, setNextDate] = useState(rec.next_date || todayISO())
  const [payee, setPayee] = useState(rec.payee || '')
  const [busy, setBusy] = useState(false)

  const list = cats.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))

  const save = async (e) => {
    e.preventDefault()
    const amt = parseInt(String(amount).replace(/[^0-9]/g, ''), 10) || 0
    if (!amt || !accountId) return
    setBusy(true)
    const payload = { household_id: household.id, account_id: accountId, type, amount: amt, category_id: categoryId || null, frequency: freq, next_date: nextDate, payee: payee || null }
    if (isNew) await supabase.from('recurring_transactions').insert(payload)
    else await supabase.from('recurring_transactions').update(payload).eq('id', rec.id)
    setBusy(false); onSaved(); onClose()
  }

  return (
    <Modal title={isNew ? 'Nuevo recurrente' : 'Editar recurrente'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="segmented" style={{ marginBottom: 16 }}>
          <button type="button" className={type === 'income' ? 'active-blue' : ''} onClick={() => setType('income')}>Ingreso</button>
          <button type="button" className={type === 'expense' ? 'active-red' : ''} onClick={() => setType('expense')}>Gasto</button>
        </div>
        <div className="field"><label>Monto (₲)</label><input className="form-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus /></div>
        <div className="field"><label>Descripción</label><input className="form-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Ej: Netflix, Alquiler, Salario" /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Cuenta</label><select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="field"><label>Categoría</label><select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Sin categoría</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Frecuencia</label><select className="form-select" value={freq} onChange={(e) => setFreq(e.target.value)}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label>Próxima fecha</label><input className="form-input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}
