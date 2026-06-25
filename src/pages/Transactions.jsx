import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDateShort } from '../lib/format'
import TransactionModal from '../components/TransactionModal'

export default function Transactions() {
  const { household } = useAuth()
  const [txns, setTxns] = useState([])
  const [accounts, setAccounts] = useState([])
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [fType, setFType] = useState('')
  const [fAccount, setFAccount] = useState('')
  const [fCat, setFCat] = useState('')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [showAdd, setShowAdd] = useState(false)
  const [edit, setEdit] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  const load = async () => {
    setLoading(true)
    const start = month + '-01'
    const endD = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
    const end = endD.toISOString().slice(0, 10)
    const [tx, acc, cat] = await Promise.all([
      supabase.from('transactions').select('*').gte('occurred_on', start).lte('occurred_on', end).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('accounts').select('id,name,color'),
      supabase.from('categories').select('id,name,kind'),
    ])
    setTxns(tx.data || [])
    setAccounts(acc.data || [])
    setCats(cat.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household, month])

  const accName = (id) => accounts.find((a) => a.id === id)?.name || '—'
  const catName = (id) => cats.find((c) => c.id === id)?.name || ''

  const filtered = useMemo(() => txns.filter((t) => {
    if (fType && t.type !== fType) return false
    if (fAccount && t.account_id !== fAccount && t.transfer_account_id !== fAccount) return false
    if (fCat && t.category_id !== fCat) return false
    if (q) {
      const hay = `${t.payee || ''} ${t.note || ''} ${catName(t.category_id)}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  }), [txns, fType, fAccount, fCat, q, cats])

  const totIncome = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const totExpense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  const del = async (id) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('transactions').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 16, gap: 10 }}>
        <div className="row" style={{ gap: 10, flex: 1, minWidth: 220 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowFilters((s) => !s)}><Filter size={15} /> Filtros</button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={18} /> Nuevo</button>
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="grid grid-4" style={{ gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Mes</label>
              <input className="form-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Tipo</label>
              <select className="form-select" value={fType} onChange={(e) => setFType(e.target.value)}>
                <option value="">Todos</option>
                <option value="income">Ingresos</option>
                <option value="expense">Gastos</option>
                <option value="transfer">Transferencias</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Cuenta</label>
              <select className="form-select" value={fAccount} onChange={(e) => setFAccount(e.target.value)}>
                <option value="">Todas</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Categoría</label>
              <select className="form-select" value={fCat} onChange={(e) => setFCat(e.target.value)}>
                <option value="">Todas</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="badge badge-blue">Ingresos: {money(totIncome)}</span>
        <span className="badge badge-red">Gastos: {money(totExpense)}</span>
        <span className="badge">{filtered.length} movimientos</span>
      </div>

      <div className="card card-pad-0">
        {loading ? <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>
          : filtered.length === 0 ? <div className="empty-state" style={{ padding: 50 }}>No hay movimientos con estos filtros.</div>
          : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Detalle</th><th className="hide-mobile">Categoría</th><th className="hide-mobile">Cuenta</th><th style={{ textAlign: 'right' }}>Monto</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateShort(t.occurred_on)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.payee || catName(t.category_id) || (t.type === 'transfer' ? 'Transferencia' : 'Movimiento')}</div>
                      {t.note && <div className="text-muted" style={{ fontSize: 12 }}>{t.note}</div>}
                      {t.source !== 'manual' && <span className="badge" style={{ fontSize: 10, padding: '1px 7px', marginTop: 2 }}>{t.source === 'apple_pay' ? 'Apple Pay' : t.source === 'email' ? 'Email' : 'Import'}</span>}
                    </td>
                    <td className="hide-mobile text-2">{t.type === 'transfer' ? '↔ ' + accName(t.transfer_account_id) : catName(t.category_id) || '—'}</td>
                    <td className="hide-mobile text-2">{accName(t.account_id)}</td>
                    <td style={{ textAlign: 'right' }} className={t.type === 'income' ? 'amount-pos' : t.type === 'expense' ? 'amount-neg' : ''}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        <button className="icon-btn" onClick={() => setEdit(t)}><Pencil size={14} /></button>
                        <button className="icon-btn" onClick={() => del(t.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {showAdd && <TransactionModal onClose={() => setShowAdd(false)} onSaved={load} />}
      {edit && <TransactionModal edit={edit} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  )
}
