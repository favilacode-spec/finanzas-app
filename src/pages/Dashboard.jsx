import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, SlidersHorizontal, ArrowUp, ArrowDown, Plus, Trash2, Zap } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, moneyShort } from '../lib/format'
import {
  todayLocal, monthStart, monthEnd, daysBetween, nextPayday, occurrences, cardDueDate, dueLabel, dueTone, shortDate, addDays, monthName, MONTHS_SHORT,
} from '../lib/dates'
import { useOnChange } from '../lib/events'
import TransactionModal from '../components/TransactionModal'
import Modal from '../components/Modal'
import Tile from '../components/Tile'
import Ring from '../components/Ring'
import Icon, { guessIcon, COLORS } from '../components/Icon'
import LabelChip from '../components/LabelChip'

const CARDS = [
  { id: 'accounts', label: 'Cuentas' },
  { id: 'upcoming', label: 'Próximos pagos' },
  { id: 'daily', label: 'Límite diario' },
  { id: 'networth', label: 'Patrimonio neto' },
  { id: 'shortcuts', label: 'Atajos de carga rápida' },
  { id: 'budgets', label: 'Presupuestos' },
  { id: 'goals', label: 'Metas' },
  { id: 'month', label: 'Ingresos y gastos del mes' },
  { id: 'trend', label: 'Últimos 6 meses' },
  { id: 'recent', label: 'Movimientos recientes' },
]
const LAYOUT_KEY = 'mb-overview-v2'
const SHORTCUTS_KEY = 'mb-shortcuts'
const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d } catch { return d } }
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* noop */ } }
const LIQUID = ['cash', 'checking', 'savings', 'other']

export default function Dashboard() {
  const { household, profile } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [d, setD] = useState(null)
  const [add, setAdd] = useState(null)
  const [layout, setLayout] = useState(() => {
    const saved = readJSON(LAYOUT_KEY, null)
    const base = CARDS.map((c) => ({ id: c.id, on: true }))
    if (!saved) return base
    const known = saved.filter((s) => CARDS.some((c) => c.id === s.id))
    return [...known, ...base.filter((b) => !known.some((k) => k.id === b.id))]
  })
  const [editLayout, setEditLayout] = useState(false)
  const [shortcuts, setShortcuts] = useState(() => readJSON(SHORTCUTS_KEY, []))
  const [scForm, setScForm] = useState(false)

  const load = async () => {
    if (!household) { setLoading(false); return }
    const today = todayLocal()
    const start = monthStart(today)
    const sixAgo = monthStart(addDays(start, -155))
    const [acc, bal, tx, cat, allTx, lab, rec, debts, budgets, adj, goals] = await Promise.all([
      supabase.from('accounts').select('*').eq('archived', false).order('sort').order('created_at'),
      supabase.from('account_balances').select('*'),
      supabase.from('transactions').select('*').gte('occurred_on', start).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('categories').select('id,name,color,icon,kind'),
      supabase.from('transactions').select('amount,type,occurred_on').gte('occurred_on', sixAgo),
      supabase.from('account_labels').select('*'),
      supabase.from('recurring_transactions').select('*').eq('active', true),
      supabase.from('debts').select('current_balance').eq('paid_off', false),
      supabase.from('budgets').select('*'),
      supabase.from('budget_adjustments').select('*').eq('month', start),
      supabase.from('goals').select('*').eq('archived', false).order('created_at'),
    ])
    const cmap = {}; (cat.data || []).forEach((c) => { cmap[c.id] = c })
    const lmap = {}; (lab.data || []).forEach((l) => { lmap[l.id] = l })
    setD({
      accounts: acc.data || [], balances: bal.data || [], txns: tx.data || [], cats: cmap, labels: lmap,
      trendRows: allTx.data || [], recs: rec.data || [], debts: debts.data || [], budgets: budgets.data || [],
      adj: adj.data || [], goals: goals.data || [],
    })
    setLoading(false)
  }
  useEffect(() => { load() }, [household]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnChange(load)

  const saveLayout = (l) => { setLayout(l); writeJSON(LAYOUT_KEY, l) }
  const saveShortcuts = (s) => { setShortcuts(s); writeJSON(SHORTCUTS_KEY, s) }

  const calc = useMemo(() => {
    if (!d) return null
    const today = todayLocal()
    const bal = (id) => Number(d.balances.find((b) => b.account_id === id)?.balance || 0)
    const included = d.accounts.filter((a) => !a.exclude_from_total)
    const liquid = included.filter((a) => LIQUID.includes(a.type)).reduce((s, a) => s + bal(a.id), 0)
    const assets = included.reduce((s, a) => s + Math.max(0, bal(a.id)), 0)
    const cardDebt = included.reduce((s, a) => s + Math.min(0, bal(a.id)), 0)
    const otherDebt = d.debts.reduce((s, x) => s + Number(x.current_balance || 0), 0)
    const netWorth = assets + cardDebt - otherDebt

    // próximos pagos (incluye vencidos sin marcar y tarjetas)
    const upcoming = []
    d.recs.filter((r) => r.type === 'expense').forEach((r) => {
      if (r.end_date && r.end_date < today) return
      upcoming.push({ key: r.id, name: r.payee || d.cats[r.category_id]?.name || 'Pago', amount: Number(r.amount), date: r.next_date, icon: r.icon || guessIcon(r.payee), color: r.color || '#5eead4', variable: r.amount_variable })
    })
    d.accounts.filter((a) => a.type === 'credit_card' && a.due_day && bal(a.id) < 0).forEach((a) => {
      upcoming.push({ key: 'card-' + a.id, name: `Tarjeta ${a.name}`, amount: -bal(a.id), date: cardDueDate(a.due_day), icon: 'credit-card', color: a.color || '#f472b6' })
    })
    upcoming.sort((x, y) => x.date.localeCompare(y.date))

    // límite diario hasta el próximo cobro
    const incomes = d.recs.filter((r) => r.type === 'income')
    const payday = nextPayday(household?.payday, incomes)
    const daysLeft = Math.max(1, daysBetween(today, payday))
    let pendingBills = 0
    d.recs.filter((r) => r.type === 'expense').forEach((r) => {
      if (r.next_date < today) pendingBills += Number(r.amount) // vencidos sin marcar
      pendingBills += occurrences(r, today, addDays(payday, -1)).length * Number(r.amount)
    })
    upcoming.filter((u) => u.key.startsWith('card-') && u.date < payday).forEach((u) => { pendingBills += u.amount })
    const spentToday = d.txns.filter((t) => t.type === 'expense' && t.occurred_on === today).reduce((s, t) => s + Number(t.amount), 0)
    const autoLimit = Math.max(0, Math.floor((liquid - pendingBills + spentToday) / daysLeft))
    const limit = household?.daily_limit ? Number(household.daily_limit) : autoLimit
    const remainingToday = limit - spentToday
    const freeToSpend = liquid - pendingBills

    const income = d.txns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const expense = d.txns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

    // presupuestos
    const spentByCat = {}
    d.txns.filter((t) => t.type === 'expense' && t.category_id).forEach((t) => { spentByCat[t.category_id] = (spentByCat[t.category_id] || 0) + Number(t.amount) })
    const budgetCards = d.budgets.filter((b) => b.category_id && d.cats[b.category_id]).map((b) => {
      const extra = d.adj.filter((a) => a.category_id === b.category_id).reduce((s, a) => s + Number(a.amount), 0)
      const lim = Number(b.amount) + extra
      const sp = spentByCat[b.category_id] || 0
      return { id: b.id, cat: d.cats[b.category_id], limit: lim, spent: sp, left: lim - sp }
    }).sort((x, y) => x.left / (x.limit || 1) - y.left / (y.limit || 1))

    // gastos por categoría
    const byCat = {}
    d.txns.filter((t) => t.type === 'expense').forEach((t) => { const k = t.category_id || 'none'; byCat[k] = (byCat[k] || 0) + Number(t.amount) })
    const pieData = Object.entries(byCat).map(([k, v]) => ({ name: k === 'none' ? 'Sin categoría' : (d.cats[k]?.name || '—'), value: v, color: k === 'none' ? '#6b737b' : (d.cats[k]?.color || '#6b737b') })).sort((a, b) => b.value - a.value).slice(0, 8)

    // tendencia
    const tmap = {}
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - i)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      tmap[key] = { month: MONTHS_SHORT[dt.getMonth()], ingreso: 0, gasto: 0 }
    }
    d.trendRows.forEach((t) => { const k = String(t.occurred_on).slice(0, 7); if (!tmap[k]) return; if (t.type === 'income') tmap[k].ingreso += Number(t.amount); if (t.type === 'expense') tmap[k].gasto += Number(t.amount) })

    const goalCards = d.goals.map((g) => {
      const cur = g.account_id ? Math.max(0, bal(g.account_id)) : Number(g.current_amount || 0)
      return { ...g, cur, pct: g.target_amount > 0 ? Math.min(100, (cur / g.target_amount) * 100) : 0 }
    })

    return { bal, netWorth, assets, cardDebt, otherDebt, upcoming, payday, daysLeft, limit, autoLimit, spentToday, remainingToday, freeToSpend, pendingBills, income, expense, budgetCards, pieData, trend: Object.values(tmap), goalCards, liquid }
  }, [d, household])

  if (loading || !calc) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  const today = todayLocal()
  const blocks = {
    accounts: (
      <div className="card" key="accounts">
        <div className="row between" style={{ marginBottom: 2 }}>
          <div className="card-title" style={{ margin: 0 }}>Cuentas <span className="text-muted" style={{ fontSize: 12.5, fontWeight: 600 }}>{d.accounts.filter((a) => !a.exclude_from_total).length}/{d.accounts.length}</span></div>
          <Link to="/cuentas" className="link">Ver <ChevronRight size={15} /></Link>
        </div>
        {d.accounts.length === 0 ? <div className="empty-state" style={{ padding: 20 }}>Aún no tenés cuentas. <Link to="/cuentas" className="text-accent">Creá la primera</Link>.</div> : (
          <div className="list">
            {d.accounts.slice(0, 8).map((a) => {
              const b = calc.bal(a.id)
              return (
                <div className="list-row clickable" key={a.id} onClick={() => nav('/cuentas')}>
                  <Tile icon={a.icon || 'wallet'} color={a.color || '#5eead4'} />
                  <div className="list-main">
                    <div className="list-title row" style={{ gap: 7 }}>{a.name}{d.labels[a.label_id] && <LabelChip label={d.labels[a.label_id]} size="sm" />}</div>
                    {a.type === 'credit_card' && a.credit_limit ? <div className="list-sub">Disponible {money(Number(a.credit_limit) + b)}</div> : a.bank ? <div className="list-sub">{a.bank}</div> : null}
                  </div>
                  <span className={`list-amount ${b < 0 ? 'amount-neg' : ''}`}>{money(b)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    ),
    upcoming: (
      <div className="card" key="upcoming">
        <div className="row between" style={{ marginBottom: 10 }}>
          <div className="card-title" style={{ margin: 0 }}>Próximos pagos</div>
          <Link to="/pagos" className="link">Todos <ChevronRight size={15} /></Link>
        </div>
        {calc.upcoming.length === 0 ? <div className="text-muted" style={{ fontSize: 13.5 }}>Cargá tus pagos fijos en <Link to="/pagos" className="text-accent">Pagos</Link> y te muestro el más cercano acá.</div> : (
          <div className="hscroll">
            {calc.upcoming.slice(0, 10).map((u) => {
              const tone = dueTone(u.date)
              return (
                <button className="mini-card" key={u.key} onClick={() => nav('/pagos')} style={tone === 'red' ? { borderColor: 'var(--red-border)' } : undefined}>
                  <Tile icon={u.icon} color={u.color} size="sm" />
                  <span className="mc-label">{u.name}</span>
                  <span className="mc-value" style={{ color: tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : undefined }}>{dueLabel(u.date)}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>{u.variable ? '≈ ' : ''}{money(u.amount)}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    ),
    daily: (
      <div className="card" key="daily">
        <div className="card-title">Límite diario</div>
        <div className="card-sub">Hasta tu próximo cobro: {shortDate(calc.payday)} ({calc.daysLeft} {calc.daysLeft === 1 ? 'día' : 'días'}){household?.daily_limit ? ' · monto fijo' : ''}</div>
        <div className="row" style={{ gap: 18, alignItems: 'center' }}>
          <Ring pct={calc.limit > 0 ? (Math.max(0, calc.remainingToday) / calc.limit) * 100 : 0} size={84} stroke={9} color={calc.remainingToday < 0 ? 'var(--red)' : 'var(--accent)'}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{calc.limit > 0 ? Math.max(0, Math.round((calc.remainingToday / calc.limit) * 100)) : 0}%</span>
          </Ring>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><div className="stat-label" style={{ fontSize: 10.5, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent)' }}>Te queda hoy</div><div className="amount-big" style={{ fontSize: 18, color: calc.remainingToday < 0 ? 'var(--red)' : 'var(--accent)' }}>{money(calc.remainingToday)}</div></div>
            <div><div className="stat-label" style={{ fontSize: 10.5, letterSpacing: '.05em', textTransform: 'uppercase' }}>Gastado hoy</div><div className="amount-big" style={{ fontSize: 18 }}>{money(calc.spentToday)}</div></div>
          </div>
        </div>
        <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>Límite {money(calc.limit)}/día · libre para gastar {money(calc.freeToSpend)} después de {money(calc.pendingBills)} en pagos pendientes.</div>
      </div>
    ),
    networth: (
      <div className="card card-hero" key="networth">
        <div className="card-title" style={{ marginBottom: 2 }}>Patrimonio neto</div>
        <div className="text-muted" style={{ fontSize: 12 }}>Lo que tenés menos lo que debés</div>
        <div className="amount-big" style={{ fontSize: 34, color: calc.netWorth < 0 ? 'var(--red)' : 'var(--accent)', margin: '8px 0 6px' }}>{money(calc.netWorth)}</div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="badge badge-green">Activos {money(calc.assets)}</span>
          {calc.cardDebt < 0 && <span className="badge badge-red">Tarjetas {money(calc.cardDebt)}</span>}
          {calc.otherDebt > 0 && <Link to="/deudas" className="badge badge-red">Deudas −{money(calc.otherDebt)}</Link>}
        </div>
      </div>
    ),
    shortcuts: (
      <div className="card" key="shortcuts">
        <div className="row between" style={{ marginBottom: 10 }}>
          <div className="card-title" style={{ margin: 0 }}><Zap size={16} color="var(--accent)" /> Atajos</div>
          <button className="link" onClick={() => setScForm(true)}><Plus size={15} /> Nuevo</button>
        </div>
        {shortcuts.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13.5 }}>Creá botones para lo que cargás seguido (café con Ueno, nafta con la tarjeta…). Solo ponés el monto.</div>
        ) : (
          <div className="row wrap" style={{ gap: 8 }}>
            {shortcuts.map((s, i) => (
              <button key={i} className="btn btn-secondary btn-sm" onClick={() => setAdd({ type: s.type, accountId: s.accountId, categoryId: s.categoryId, payee: s.payee || '' })}>
                <span style={{ color: s.color }}><Icon name={s.icon} size={15} /></span> {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    ),
    budgets: (
      <div className="card" key="budgets">
        <div className="row between" style={{ marginBottom: 10 }}>
          <div className="card-title" style={{ margin: 0 }}>Presupuestos</div>
          <Link to="/presupuestos" className="link">Ver <ChevronRight size={15} /></Link>
        </div>
        {calc.budgetCards.length === 0 ? <div className="text-muted" style={{ fontSize: 13.5 }}>Sin presupuestos este mes.</div> : (
          <div className="hscroll">
            {calc.budgetCards.map((b) => (
              <button className="mini-card" key={b.id} onClick={() => nav('/presupuestos')}>
                <Tile icon={b.cat.icon} color={b.cat.color || '#5eead4'} size="sm" />
                <span className="mc-label">{b.cat.name}</span>
                <span className="mc-value" style={{ color: b.left < 0 ? 'var(--red)' : undefined }}>{money(Math.abs(b.left))}</span>
                <span className="text-muted" style={{ fontSize: 11.5 }}>{b.left < 0 ? 'excedido' : 'disponible'}</span>
                <div className="progress" style={{ height: 5 }}><span style={{ width: Math.min(100, (b.spent / (b.limit || 1)) * 100) + '%', background: b.left < 0 ? 'var(--red)' : b.cat.color || 'var(--accent)' }} /></div>
              </button>
            ))}
          </div>
        )}
      </div>
    ),
    goals: (
      <div className="card" key="goals">
        <div className="row between" style={{ marginBottom: 6 }}>
          <div className="card-title" style={{ margin: 0 }}>Metas</div>
          <Link to="/metas" className="link">Ver <ChevronRight size={15} /></Link>
        </div>
        {calc.goalCards.length === 0 ? <div className="text-muted" style={{ fontSize: 13.5 }}>Creá una meta con foto y te ayudo a llegar. <Link to="/metas" className="text-accent">Crear meta</Link></div> : (
          <div className="list">
            {calc.goalCards.slice(0, 3).map((g) => (
              <div className="list-row clickable" key={g.id} onClick={() => nav('/metas')}>
                <Tile image={g.image} icon={g.icon || 'target'} color={g.color || '#34d399'} size="lg" />
                <div className="list-main">
                  <div className="row between"><span className="list-title">{g.name}</span><span style={{ fontWeight: 700, fontSize: 13 }}>{g.pct.toFixed(0)}%</span></div>
                  <div className="progress" style={{ margin: '6px 0 4px' }}><span style={{ width: g.pct + '%', background: g.color || 'var(--accent)' }} /></div>
                  <div className="list-sub">{money(g.cur)} de {money(g.target_amount)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
    month: (
      <div className="card" key="month">
        <div className="card-title" style={{ textTransform: 'capitalize' }}>{monthName(today)}</div>
        <div className="grid grid-2" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div className="card" style={{ background: 'var(--bg-elevated)', padding: 12 }}><div className="stat-label">Ingresos</div><div className="stat-value amount-pos" style={{ fontSize: 19 }}>{money(calc.income)}</div></div>
          <div className="card" style={{ background: 'var(--bg-elevated)', padding: 12 }}><div className="stat-label">Gastos</div><div className="stat-value amount-neg" style={{ fontSize: 19 }}>{money(calc.expense)}</div></div>
        </div>
        {calc.pieData.length === 0 ? <div className="text-muted" style={{ fontSize: 13.5 }}>Sin gastos este mes todavía.</div> : (
          <div className="row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 150, height: 150 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={calc.pieData} dataKey="value" nameKey="name" innerRadius={44} outerRadius={72} paddingAngle={2} stroke="none">
                    {calc.pieData.map((x, i) => <Cell key={i} fill={x.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} contentStyle={tipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              {calc.pieData.slice(0, 6).map((x, i) => (
                <div className="row between" key={i} style={{ padding: '4px 0', fontSize: 13.5 }}>
                  <span className="row" style={{ gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: x.color }} /> {x.name}</span>
                  <span style={{ fontWeight: 650 }}>{money(x.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    ),
    trend: (
      <div className="card" key="trend">
        <div className="card-title">Ingresos vs gastos</div>
        <div style={{ height: 190 }}>
          <ResponsiveContainer>
            <BarChart data={calc.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#6b737b', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={moneyShort} tick={{ fill: '#6b737b', fontSize: 11 }} axisLine={false} tickLine={false} width={58} />
              <Tooltip formatter={(v) => money(v)} contentStyle={tipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="ingreso" name="Ingresos" fill="#34d399" radius={[5, 5, 0, 0]} />
              <Bar dataKey="gasto" name="Gastos" fill="#ff6b6b" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    ),
    recent: (
      <div className="card" key="recent">
        <div className="row between" style={{ marginBottom: 2 }}>
          <div className="card-title" style={{ margin: 0 }}>Movimientos recientes</div>
          <Link to="/movimientos" className="link">Todos <ChevronRight size={15} /></Link>
        </div>
        {d.txns.length === 0 ? <div className="empty-state" style={{ padding: 20 }}>Sin movimientos este mes.</div> : (
          <div className="list">
            {d.txns.slice(0, 6).map((t) => {
              const c = d.cats[t.category_id]
              return (
                <div className="list-row clickable" key={t.id} onClick={() => setAdd({ edit: t })}>
                  <Tile icon={c?.icon || (t.type === 'transfer' ? 'repeat' : 'receipt')} color={c?.color || '#94a3b8'} />
                  <div className="list-main">
                    <div className="list-title">{t.payee || c?.name || (t.type === 'transfer' ? 'Transferencia' : 'Movimiento')}</div>
                    <div className="list-sub">{shortDate(t.occurred_on)}{c ? ' · ' + c.name : ''}</div>
                  </div>
                  <span className={`list-amount ${t.type === 'income' ? 'amount-pos' : t.type === 'expense' ? 'amount-neg' : ''}`}>{t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    ),
  }

  const visible = layout.filter((l) => l.on).map((l) => blocks[l.id]).filter(Boolean)
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Buen día' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 750, fontSize: 18 }}>{hello}, {profile?.name?.split(' ')[0] || ''} 👋</div>
          <div className="text-muted" style={{ fontSize: 13, textTransform: 'capitalize' }}>{monthName(today)}</div>
        </div>
        <button className="icon-btn" onClick={() => setEditLayout(true)} title="Personalizar"><SlidersHorizontal size={17} /></button>
      </div>

      <div className="dash-cols">
        {visible}
      </div>

      {editLayout && <LayoutModal layout={layout} onChange={saveLayout} onClose={() => setEditLayout(false)} />}
      {scForm && <ShortcutModal shortcuts={shortcuts} accounts={d.accounts} cats={Object.values(d.cats)} onChange={saveShortcuts} onClose={() => setScForm(false)} />}
      {add && (add.edit
        ? <TransactionModal edit={add.edit} onClose={() => setAdd(null)} onSaved={load} />
        : <TransactionModal prefill={add} onClose={() => setAdd(null)} onSaved={load} />)}
    </div>
  )
}

function LayoutModal({ layout, onChange, onClose }) {
  const move = (i, dir) => {
    const l = [...layout]; const j = i + dir
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]; onChange(l)
  }
  return (
    <Modal title="Personalizar resumen" onClose={onClose}>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>Elegí qué tarjetas ver y en qué orden (se guarda en este dispositivo).</p>
      <div className="list">
        {layout.map((l, i) => (
          <div className="list-row" key={l.id}>
            <label className="check" style={{ margin: 0, flex: 1 }}>
              <input type="checkbox" checked={l.on} onChange={(e) => onChange(layout.map((x) => x.id === l.id ? { ...x, on: e.target.checked } : x))} />
              <span style={{ color: 'var(--text)' }}>{CARDS.find((c) => c.id === l.id)?.label}</span>
            </label>
            <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={15} /></button>
            <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === layout.length - 1}><ArrowDown size={15} /></button>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => onChange(layout.map((x) => ({ ...x, on: true })))}>Mostrar todas</button>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={onClose}>Listo</button>
      </div>
    </Modal>
  )
}

function ShortcutModal({ shortcuts, accounts, cats, onChange, onClose }) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState('expense')
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [categoryId, setCategoryId] = useState('')
  const list = cats.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))
  const addOne = (e) => {
    e.preventDefault()
    const c = cats.find((x) => x.id === categoryId)
    const name = label.trim() || c?.name || 'Atajo'
    onChange([...shortcuts, { label: name, type, accountId, categoryId, payee: label.trim(), icon: c?.icon || guessIcon(name), color: c?.color || COLORS[shortcuts.length % COLORS.length] }])
    setLabel(''); setCategoryId('')
  }
  return (
    <Modal title="Atajos de carga rápida" onClose={onClose}>
      {shortcuts.length > 0 && (
        <div className="list" style={{ marginBottom: 14 }}>
          {shortcuts.map((s, i) => (
            <div className="list-row" key={i}>
              <Tile icon={s.icon} color={s.color} size="sm" />
              <div className="list-main"><div className="list-title">{s.label}</div><div className="list-sub">{accounts.find((a) => a.id === s.accountId)?.name || ''}{cats.find((c) => c.id === s.categoryId) ? ' · ' + cats.find((c) => c.id === s.categoryId).name : ''}</div></div>
              <button className="icon-btn" onClick={() => onChange(shortcuts.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={addOne}>
        <div className="segmented" style={{ marginBottom: 12 }}>
          <button type="button" className={type === 'expense' ? 'active-red' : ''} onClick={() => setType('expense')}>Gasto</button>
          <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => setType('income')}>Ingreso</button>
        </div>
        <div className="field"><label>Nombre del botón</label><input className="form-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej: Café, Nafta, Super" /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Cuenta</label><select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="field"><label>Categoría</label><select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Sin categoría</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        <button className="btn btn-primary btn-block">Agregar atajo</button>
      </form>
    </Modal>
  )
}

const tipStyle = { background: '#1f2327', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f4f6f7', fontSize: 13 }
