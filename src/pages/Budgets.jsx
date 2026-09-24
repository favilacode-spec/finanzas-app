import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, ArrowRightLeft, Scale, Pencil, Trash2 } from 'lucide-react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, moneyShort } from '../lib/format'
import { monthStart, monthEnd, shiftMonth, monthName, todayLocal, shortDate, MONTHS_SHORT, parseLocal, daysBetween } from '../lib/dates'
import { useOnChange } from '../lib/events'
import Modal from '../components/Modal'
import Tile from '../components/Tile'
import MoneyInput from '../components/MoneyInput'

export default function Budgets() {
  const { household } = useAuth()
  const [month, setMonth] = useState(monthStart())
  const [cats, setCats] = useState([])
  const [budgets, setBudgets] = useState([])
  const [adj, setAdj] = useState([])
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [setting, setSetting] = useState(null)
  const [rebalance, setRebalance] = useState(false)

  const load = async () => {
    const from = shiftMonth(month, -11)
    const [c, b, a, tx] = await Promise.all([
      supabase.from('categories').select('*').eq('kind', 'expense').order('name'),
      supabase.from('budgets').select('*'),
      supabase.from('budget_adjustments').select('*').gte('month', shiftMonth(month, -12)).lte('month', month),
      supabase.from('transactions').select('id,amount,category_id,occurred_on,payee,type').eq('type', 'expense').gte('occurred_on', from).lte('occurred_on', monthEnd(month)),
    ])
    setCats(c.data || []); setBudgets(b.data || []); setAdj(a.data || []); setTxns(tx.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household, month]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnChange(load)

  // gasto por categoría (las subcategorías suman en la categoría padre)
  const rootOf = useMemo(() => { const m = {}; cats.forEach((c) => { m[c.id] = c.parent_id || c.id }); return m }, [cats])
  const spentIn = (catId, m) => txns.filter((t) => t.category_id && rootOf[t.category_id] === catId && t.occurred_on.startsWith(m.slice(0, 7))).reduce((s, t) => s + Number(t.amount), 0)
  const adjIn = (catId, m) => adj.filter((a) => a.category_id === catId && a.month === m).reduce((s, a) => s + Number(a.amount), 0)

  const info = (b, m = month) => {
    const base = Number(b.amount)
    const extra = adjIn(b.category_id, m)
    let carry = 0
    if (b.rollover) {
      const pm = shiftMonth(m, -1)
      carry = base + adjIn(b.category_id, pm) - spentIn(b.category_id, pm)
    }
    const limit = base + extra + carry
    const spent = spentIn(b.category_id, m)
    return { base, extra, carry, limit, spent, left: limit - spent }
  }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  const parents = cats.filter((c) => !c.parent_id)
  const withB = parents.map((c) => ({ c, b: budgets.find((b) => b.category_id === c.id) })).filter((x) => x.b)
  const without = parents.filter((c) => !budgets.some((b) => b.category_id === c.id))
  const rows = withB.map((x) => ({ ...x, ...info(x.b) }))
  const totLimit = rows.reduce((s, r) => s + r.limit, 0)
  const totSpent = rows.reduce((s, r) => s + r.spent, 0)
  const unbudgeted = txns.filter((t) => t.occurred_on.startsWith(month.slice(0, 7)) && (!t.category_id || !budgets.some((b) => b.category_id === rootOf[t.category_id]))).reduce((s, t) => s + Number(t.amount), 0)
  const isCurrent = month === monthStart()
  const daysLeft = isCurrent ? Math.max(1, daysBetween(todayLocal(), monthEnd(month)) + 1) : 0

  const openRow = detail && rows.find((r) => r.b.id === detail)

  return (
    <div className="stack">
      <div className="card card-hero">
        <div className="row between" style={{ marginBottom: 10 }}>
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={17} /></button>
          <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{monthName(month)} <span className="badge" style={{ marginLeft: 6 }}>{isCurrent ? 'Activo' : month < monthStart() ? 'Cerrado' : 'Futuro'}</span></div>
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={17} /></button>
        </div>
        <div className="stat-label">{totSpent > totLimit ? 'Te pasaste' : 'Te queda para gastar'}</div>
        <div className="amount-big" style={{ fontSize: 30, color: totSpent > totLimit ? 'var(--red)' : 'var(--accent)' }}>{money(Math.abs(totLimit - totSpent))}</div>
        <div className="progress" style={{ margin: '10px 0 6px' }}><span style={{ width: Math.min(100, totLimit ? (totSpent / totLimit) * 100 : 0) + '%', background: totSpent > totLimit ? 'var(--red)' : 'var(--accent)' }} /></div>
        <div className="text-muted" style={{ fontSize: 12.5 }}>Gastado {money(totSpent)} de {money(totLimit)}{isCurrent && totLimit > totSpent ? ` · ${money((totLimit - totSpent) / daysLeft)}/día por ${daysLeft} días` : ''}{unbudgeted ? ` · sin presupuesto: ${money(unbudgeted)}` : ''}</div>
      </div>

      {rows.length > 1 && <div className="row"><button className="btn btn-secondary btn-sm" onClick={() => setRebalance(true)}><Scale size={15} /> Rebalancear</button></div>}

      {rows.length > 0 && (
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          <div className="list">
            {rows.map((r) => {
              const pct = r.limit > 0 ? Math.min(100, (r.spent / r.limit) * 100) : (r.spent > 0 ? 100 : 0)
              const over = r.left < 0
              return (
                <div className="list-row clickable" key={r.b.id} onClick={() => setDetail(r.b.id)} style={{ alignItems: 'center' }}>
                  <Tile icon={r.c.icon} color={r.c.color || '#5eead4'} />
                  <div className="list-main">
                    <div className="row between"><span className="list-title">{r.c.name}</span><span className="list-amount" style={{ color: over ? 'var(--red)' : undefined }}>{money(Math.abs(r.left))} <span className="text-muted" style={{ fontSize: 11.5, fontWeight: 600 }}>{over ? 'excedido' : 'libre'}</span></span></div>
                    <div className="progress" style={{ margin: '7px 0 4px', height: 6 }}><span style={{ width: pct + '%', background: over ? 'var(--red)' : r.c.color || 'var(--accent)' }} /></div>
                    <div className="list-sub">{money(r.spent)} de {money(r.limit)}{r.carry ? ` · arrastre ${r.carry > 0 ? '+' : ''}${money(r.carry)}` : ''}{r.extra ? ` · ajustes ${r.extra > 0 ? '+' : ''}${money(r.extra)}` : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {without.length > 0 && (
        <div>
          <div className="section-label">Sin presupuesto</div>
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <div className="list">
              {without.map((c) => (
                <div className="list-row" key={c.id}>
                  <Tile icon={c.icon} color={c.color || '#94a3b8'} size="sm" />
                  <div className="list-main"><div className="list-title">{c.name}</div><div className="list-sub">Gastado {money(spentIn(c.id, month))}</div></div>
                  <button className="btn btn-soft btn-sm" onClick={() => setSetting({ c })}><Plus size={14} /> Definir</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {openRow && <BudgetDetail r={openRow} month={month} rows={rows} txns={txns} rootOf={rootOf} info={info} household={household}
        onClose={() => setDetail(null)} onChanged={load} onEdit={() => { setSetting({ c: openRow.c, b: openRow.b }); setDetail(null) }} />}
      {setting && <SetBudget c={setting.c} b={setting.b} household={household} onClose={() => setSetting(null)} onSaved={load} />}
      {rebalance && <Rebalance rows={rows} month={month} household={household} onClose={() => setRebalance(false)} onDone={() => { setRebalance(false); load() }} />}
    </div>
  )
}

function BudgetDetail({ r, month, rows, txns, rootOf, info, household, onClose, onChanged, onEdit }) {
  const [action, setAction] = useState(null)
  const hist = []
  for (let i = 11; i >= 0; i--) {
    const m = shiftMonth(month, -i)
    const x = info(r.b, m)
    hist.push({ name: MONTHS_SHORT[parseLocal(m).getMonth()], gastado: x.spent, limite: x.limit })
  }
  const yearSpent = hist.reduce((s, h) => s + h.gastado, 0)
  const monthTx = txns.filter((t) => t.category_id && rootOf[t.category_id] === r.c.id && t.occurred_on.startsWith(month.slice(0, 7))).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))

  const toggleRollover = async () => { await supabase.from('budgets').update({ rollover: !r.b.rollover }).eq('id', r.b.id); onChanged() }
  const remove = async () => { if (!confirm(`¿Quitar el presupuesto de ${r.c.name}?`)) return; await supabase.from('budgets').delete().eq('id', r.b.id); onChanged(); onClose() }

  return (
    <Modal title={r.c.name} onClose={onClose} wide>
      <div className="row" style={{ gap: 14, marginBottom: 12 }}>
        <Tile icon={r.c.icon} color={r.c.color || '#5eead4'} size="lg" />
        <div>
          <div className="amount-big" style={{ fontSize: 26, color: r.left < 0 ? 'var(--red)' : 'var(--accent)' }}>{money(Math.abs(r.left))}</div>
          <div className="text-muted" style={{ fontSize: 13 }}>{r.left < 0 ? 'excedido' : 'disponible'} · gastado {money(r.spent)} de {money(r.limit)}</div>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setAction('topup')}><Plus size={14} /> Recargar</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setAction('transfer')}><ArrowRightLeft size={14} /> Pasar a otro</button>
        <button className="btn btn-secondary btn-sm" onClick={onEdit}><Pencil size={14} /> Monto base</button>
      </div>
      <label className="check"><input type="checkbox" checked={!!r.b.rollover} onChange={toggleRollover} /> Arrastrar lo que sobra (o falta) al mes siguiente</label>

      <div className="section-label">Últimos 12 meses · promedio {money(yearSpent / 12)}/mes</div>
      <div style={{ height: 190, marginBottom: 12 }}>
        <ResponsiveContainer>
          <ComposedChart data={hist}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#6b737b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={moneyShort} tick={{ fill: '#6b737b', fontSize: 10 }} axisLine={false} tickLine={false} width={54} />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ background: '#1f2327', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, fontSize: 13 }} />
            <Bar dataKey="gastado" name="Gastado" fill={r.c.color || '#34d399'} radius={[5, 5, 0, 0]} />
            <Line dataKey="limite" name="Límite" stroke="#f4f6f7" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="section-label">Movimientos del mes</div>
      <div className="list" style={{ marginBottom: 14 }}>
        {monthTx.map((t) => (
          <div className="list-row" key={t.id} style={{ minHeight: 44 }}>
            <div className="list-main"><div className="list-title" style={{ fontSize: 14 }}>{t.payee || 'Gasto'}</div><div className="list-sub">{shortDate(t.occurred_on)}</div></div>
            <span className="list-amount amount-neg">−{money(t.amount)}</span>
          </div>
        ))}
        {!monthTx.length && <div className="text-muted" style={{ fontSize: 13 }}>Sin gastos este mes.</div>}
      </div>
      <button className="btn btn-danger btn-sm" onClick={remove}><Trash2 size={14} /> Quitar presupuesto</button>

      {action && <AdjustModal kind={action} r={r} rows={rows} month={month} household={household} onClose={() => setAction(null)} onDone={() => { setAction(null); onChanged() }} />}
    </Modal>
  )
}

function AdjustModal({ kind, r, rows, month, household, onClose, onDone }) {
  const [amount, setAmount] = useState(0)
  const others = rows.filter((x) => x.b.id !== r.b.id)
  const [target, setTarget] = useState(others[0]?.c.id || '')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    const amt = Math.round(Number(amount) || 0); if (!amt) return
    setBusy(true)
    if (kind === 'topup') {
      await supabase.from('budget_adjustments').insert({ household_id: household.id, category_id: r.c.id, month, amount: amt, note: 'Recarga' })
    } else {
      await supabase.from('budget_adjustments').insert([
        { household_id: household.id, category_id: r.c.id, month, amount: -amt, note: 'Traspaso enviado' },
        { household_id: household.id, category_id: target, month, amount: amt, note: 'Traspaso recibido' },
      ])
    }
    setBusy(false); onDone()
  }
  return (
    <Modal title={kind === 'topup' ? `Recargar ${r.c.name}` : `Pasar de ${r.c.name} a…`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Monto (solo para este mes)</label><MoneyInput value={amount} onChange={setAmount} big autoFocus /></div>
        {kind === 'transfer' && (
          <div className="field"><label>Hacia</label>
            <select className="form-select" value={target} onChange={(e) => setTarget(e.target.value)}>{others.map((x) => <option key={x.c.id} value={x.c.id}>{x.c.name} (libre {money(x.left)})</option>)}</select>
          </div>
        )}
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Esto ajusta el límite del presupuesto dentro de la app; no mueve plata de tus cuentas.</p>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</button>
      </form>
    </Modal>
  )
}

function SetBudget({ c, b, household, onClose, onSaved }) {
  const [amount, setAmount] = useState(Number(b?.amount) || 0)
  const [rollover, setRollover] = useState(!!b?.rollover)
  const save = async (e) => {
    e.preventDefault()
    const amt = Math.round(Number(amount) || 0)
    if (b) await supabase.from('budgets').update({ amount: amt, rollover }).eq('id', b.id)
    else if (amt > 0) await supabase.from('budgets').insert({ household_id: household.id, category_id: c.id, amount: amt, rollover })
    onSaved(); onClose()
  }
  return (
    <Modal title={`Presupuesto mensual · ${c.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Monto por mes</label><MoneyInput value={amount} onChange={setAmount} big autoFocus /></div>
        <label className="check"><input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} /> Arrastrar lo que sobra al mes siguiente</label>
        <button className="btn btn-primary btn-block">Guardar</button>
      </form>
    </Modal>
  )
}

function Rebalance({ rows, month, household, onClose, onDone }) {
  // mueve lo que sobra de los que tienen margen hacia los excedidos
  const plan = useMemo(() => {
    const over = rows.filter((r) => r.left < 0).map((r) => ({ id: r.c.id, name: r.c.name, need: -r.left }))
    const donors = rows.filter((r) => r.left > 0).map((r) => ({ id: r.c.id, name: r.c.name, room: r.left })).sort((a, b) => b.room - a.room)
    const moves = []
    over.forEach((o) => {
      let need = o.need
      donors.forEach((dn) => {
        if (need <= 0 || dn.room <= 0) return
        const amt = Math.min(need, dn.room)
        moves.push({ from: dn, to: o, amount: Math.round(amt) })
        dn.room -= amt; need -= amt
      })
    })
    return moves
  }, [rows])
  const apply = async () => {
    const ins = []
    plan.forEach((m) => {
      ins.push({ household_id: household.id, category_id: m.from.id, month, amount: -m.amount, note: `Rebalanceo → ${m.to.name}` })
      ins.push({ household_id: household.id, category_id: m.to.id, month, amount: m.amount, note: `Rebalanceo ← ${m.from.name}` })
    })
    if (ins.length) await supabase.from('budget_adjustments').insert(ins)
    onDone()
  }
  return (
    <Modal title="Rebalancear presupuestos" onClose={onClose}>
      {plan.length === 0 ? <p className="text-2">Ningún presupuesto está excedido. ¡Todo en orden! 👌</p> : (
        <>
          <p className="text-2" style={{ fontSize: 13.5, marginBottom: 10 }}>Así cubriría lo que te pasaste, usando lo que sobra en otras categorías (solo este mes):</p>
          <div className="list" style={{ marginBottom: 14 }}>
            {plan.map((m, i) => <div className="list-row" key={i} style={{ minHeight: 44 }}><div className="list-main"><div className="list-title" style={{ fontSize: 14 }}>{m.from.name} → {m.to.name}</div></div><span className="list-amount">{money(m.amount)}</span></div>)}
          </div>
          <button className="btn btn-primary btn-block" onClick={apply}>Aplicar</button>
        </>
      )}
    </Modal>
  )
}
