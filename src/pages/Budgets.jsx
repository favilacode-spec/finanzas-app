import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, monthRange, monthLabel } from '../lib/format'
import Icon from '../components/Icon'

export default function Budgets() {
  const { household } = useAuth()
  const [cats, setCats] = useState([])
  const [budgets, setBudgets] = useState([])
  const [spent, setSpent] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [value, setValue] = useState('')

  const load = async () => {
    setLoading(true)
    const { start, end } = monthRange()
    const [c, b, tx] = await Promise.all([
      supabase.from('categories').select('*').eq('kind', 'expense').order('name'),
      supabase.from('budgets').select('*'),
      supabase.from('transactions').select('amount,category_id').eq('type', 'expense').gte('occurred_on', start).lte('occurred_on', end),
    ])
    setCats(c.data || [])
    setBudgets(b.data || [])
    const s = {}; (tx.data || []).forEach((t) => { if (t.category_id) s[t.category_id] = (s[t.category_id] || 0) + Number(t.amount) })
    setSpent(s)
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household])

  const budgetOf = (catId) => budgets.find((b) => b.category_id === catId)

  const saveBudget = async (catId) => {
    const amt = parseInt(String(value).replace(/[^0-9]/g, ''), 10) || 0
    const existing = budgetOf(catId)
    if (existing) {
      if (amt === 0) await supabase.from('budgets').delete().eq('id', existing.id)
      else await supabase.from('budgets').update({ amount: amt }).eq('id', existing.id)
    } else if (amt > 0) {
      await supabase.from('budgets').insert({ household_id: household.id, category_id: catId, amount: amt })
    }
    setEditing(null); setValue(''); load()
  }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  const withBudget = cats.filter((c) => budgetOf(c.id))
  const totalBudget = withBudget.reduce((s, c) => s + Number(budgetOf(c.id).amount), 0)
  const totalSpent = withBudget.reduce((s, c) => s + (spent[c.id] || 0), 0)

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between wrap">
          <div>
            <div className="card-title" style={{ margin: 0 }}>Presupuesto de {monthLabel()}</div>
            <div className="stat-value" style={{ fontSize: 26 }}>{money(totalSpent)} <span className="text-muted" style={{ fontSize: 16, fontWeight: 500 }}>de {money(totalBudget)}</span></div>
          </div>
          {totalBudget > 0 && (
            <div style={{ minWidth: 200, flex: 1, maxWidth: 360 }}>
              <div className="progress"><span style={{ width: Math.min(100, (totalSpent / totalBudget) * 100) + '%', background: totalSpent > totalBudget ? 'var(--red)' : 'var(--blue)' }} /></div>
              <div className="text-muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                {totalSpent > totalBudget ? `Excedido por ${money(totalSpent - totalBudget)}` : `Disponible: ${money(totalBudget - totalSpent)}`}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>Tocá un monto para definir el presupuesto mensual de cada categoría.</p>

      <div className="grid grid-2">
        {cats.map((c) => {
          const b = budgetOf(c.id)
          const sp = spent[c.id] || 0
          const pct = b ? Math.min(100, (sp / Number(b.amount)) * 100) : 0
          const over = b && sp > Number(b.amount)
          return (
            <div className="card" key={c.id}>
              <div className="row between" style={{ marginBottom: 10 }}>
                <span className="row" style={{ gap: 10 }}>
                  <span className="icon-chip" style={{ width: 34, height: 34, background: (c.color || '#d4202a') + '22', color: c.color || '#ef3e48' }}><Icon name={c.icon} size={17} /></span>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                </span>
                {editing === c.id ? (
                  <div className="row" style={{ gap: 6 }}>
                    <input className="form-input" style={{ width: 120, padding: '7px 10px' }} inputMode="numeric" autoFocus
                      value={value} onChange={(e) => setValue(e.target.value)} placeholder="0"
                      onKeyDown={(e) => e.key === 'Enter' && saveBudget(c.id)} />
                    <button className="btn btn-primary btn-sm" onClick={() => saveBudget(c.id)}>OK</button>
                  </div>
                ) : (
                  <button className="btn-ghost btn-sm" style={{ color: b ? 'var(--text)' : 'var(--text-muted)', fontWeight: 600 }}
                    onClick={() => { setEditing(c.id); setValue(b ? String(b.amount) : '') }}>
                    {b ? money(b.amount) : 'Definir +'}
                  </button>
                )}
              </div>
              {b && (
                <>
                  <div className="progress"><span style={{ width: pct + '%', background: over ? 'var(--red)' : 'var(--blue)' }} /></div>
                  <div className="row between" style={{ marginTop: 7, fontSize: 12.5 }}>
                    <span className="text-2">Gastado: {money(sp)}</span>
                    <span style={{ color: over ? '#ff8a8f' : 'var(--text-muted)' }}>{over ? `−${money(sp - b.amount)}` : `${money(b.amount - sp)} libre`}</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
