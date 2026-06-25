import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, TrendingUp, TrendingDown, Wallet, ArrowRight } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, moneyShort, fmtDateShort, monthRange, monthLabel } from '../lib/format'
import TransactionModal from '../components/TransactionModal'

const PIE = ['#2f6fed', '#ef3e48', '#5b8def', '#ff7a82', '#0b3b8f', '#f0a500', '#7c5cff', '#22b8a6', '#e06bd0', '#9aa0a6']

export default function Dashboard() {
  const { household, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [balances, setBalances] = useState([])
  const [accounts, setAccounts] = useState([])
  const [txns, setTxns] = useState([])
  const [cats, setCats] = useState({})
  const [showAdd, setShowAdd] = useState(false)
  const [trend, setTrend] = useState([])

  const load = async () => {
    if (!household) { setLoading(false); return }
    setLoading(true)
    try {
      const { start } = monthRange()
      const [acc, bal, tx, cat, allTx] = await Promise.all([
        supabase.from('accounts').select('*').eq('archived', false),
        supabase.from('account_balances').select('*'),
        supabase.from('transactions').select('*').gte('occurred_on', start).order('occurred_on', { ascending: false }),
        supabase.from('categories').select('id,name,color,icon'),
        supabase.from('transactions').select('amount,type,occurred_on').gte('occurred_on', sixMonthsAgo()),
      ])
      setAccounts(acc.data || [])
      setBalances(bal.data || [])
      setTxns(tx.data || [])
      const cmap = {}; (cat.data || []).forEach((c) => { cmap[c.id] = c })
      setCats(cmap)
      setTrend(buildTrend(allTx.data || []))
    } catch (e) {
      console.error('Error cargando el resumen:', e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [household])

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  const totalBalance = accounts
    .filter((a) => !a.exclude_from_total)
    .reduce((s, a) => s + (balances.find((b) => b.account_id === a.id)?.balance || 0), 0)

  const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const expense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  const net = income - expense

  // spending by category (this month)
  const byCat = {}
  txns.filter((t) => t.type === 'expense').forEach((t) => {
    const key = t.category_id || 'none'
    byCat[key] = (byCat[key] || 0) + Number(t.amount)
  })
  const pieData = Object.entries(byCat)
    .map(([k, v]) => ({ name: k === 'none' ? 'Sin categoría' : (cats[k]?.name || '—'), value: v }))
    .sort((a, b) => b.value - a.value).slice(0, 10)

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 20 }}>
        <div>
          <p className="text-2">Hola, {profile?.name || 'bienvenido'} 👋</p>
          <p className="text-muted" style={{ fontSize: 13, textTransform: 'capitalize' }}>{monthLabel()}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={18} /> Nuevo movimiento</button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="row between"><span className="stat-label">Saldo total</span><Wallet size={18} className="text-muted" /></div>
          <div className="stat-value">{money(totalBalance)}</div>
        </div>
        <div className="card">
          <div className="row between"><span className="stat-label">Ingresos del mes</span><TrendingUp size={18} style={{ color: '#7fb0ff' }} /></div>
          <div className="stat-value amount-pos">{money(income)}</div>
        </div>
        <div className="card">
          <div className="row between"><span className="stat-label">Gastos del mes</span><TrendingDown size={18} style={{ color: '#ff8a8f' }} /></div>
          <div className="stat-value amount-neg">{money(expense)}</div>
        </div>
        <div className="card">
          <div className="row between"><span className="stat-label">Balance del mes</span></div>
          <div className="stat-value" style={{ color: net >= 0 ? '#7fb0ff' : '#ff8a8f' }}>{money(net)}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        {/* Spending by category */}
        <div className="card">
          <div className="card-title">Gastos por categoría · {monthLabel()}</div>
          {pieData.length === 0 ? (
            <div className="empty-state">Sin gastos este mes todavía.</div>
          ) : (
            <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 170, height: 170 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => money(v)} contentStyle={tipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                {pieData.slice(0, 6).map((d, i) => (
                  <div className="row between" key={i} style={{ padding: '5px 0', fontSize: 13.5 }}>
                    <span className="row" style={{ gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: PIE[i % PIE.length] }} /> {d.name}</span>
                    <span style={{ fontWeight: 600 }}>{money(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Trend */}
        <div className="card">
          <div className="card-title">Ingresos vs Gastos · últimos 6 meses</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#5d6c8c', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={moneyShort} tick={{ fill: '#5d6c8c', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
                <Tooltip formatter={(v) => money(v)} contentStyle={tipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="ingreso" fill="#2f6fed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gasto" fill="#ef3e48" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Accounts + recent */}
      <div className="grid grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="row between" style={{ marginBottom: 4 }}>
            <div className="card-title" style={{ margin: 0 }}>Mis cuentas</div>
            <Link to="/cuentas" className="btn-ghost" style={{ fontSize: 13, color: 'var(--blue)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Ver todas <ArrowRight size={14} /></Link>
          </div>
          {accounts.length === 0 ? (
            <div className="empty-state">Aún no tenés cuentas. <Link to="/cuentas" style={{ color: 'var(--blue)' }}>Creá la primera</Link>.</div>
          ) : accounts.slice(0, 5).map((a) => (
            <div className="row between" key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="row" style={{ gap: 10 }}>
                <span className="icon-chip" style={{ width: 32, height: 32, background: (a.color || '#0b3b8f') + '22' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: a.color || '#0b3b8f' }} />
                </span>
                {a.name}
              </span>
              <span style={{ fontWeight: 700 }}>{money(balances.find((b) => b.account_id === a.id)?.balance || 0)}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="row between" style={{ marginBottom: 4 }}>
            <div className="card-title" style={{ margin: 0 }}>Movimientos recientes</div>
            <Link to="/movimientos" className="btn-ghost" style={{ fontSize: 13, color: 'var(--blue)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Ver todos <ArrowRight size={14} /></Link>
          </div>
          {txns.length === 0 ? (
            <div className="empty-state">Sin movimientos este mes.</div>
          ) : txns.slice(0, 6).map((t) => (
            <div className="row between" key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.payee || cats[t.category_id]?.name || (t.type === 'transfer' ? 'Transferencia' : 'Movimiento')}
                </div>
                <div className="text-muted" style={{ fontSize: 12 }}>{fmtDateShort(t.occurred_on)}</div>
              </div>
              <span className={t.type === 'income' ? 'amount-pos' : t.type === 'expense' ? 'amount-neg' : ''}>
                {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {showAdd && <TransactionModal onClose={() => setShowAdd(false)} onSaved={load} />}
    </div>
  )
}

const tipStyle = { background: '#18223a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#eef2fb', fontSize: 13 }

function sixMonthsAgo() {
  const d = new Date(); d.setMonth(d.getMonth() - 5); d.setDate(1)
  return d.toISOString().slice(0, 10)
}
function buildTrend(rows) {
  const map = {}
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7)
    map[key] = { month: d.toLocaleDateString('es', { month: 'short' }), ingreso: 0, gasto: 0 }
  }
  rows.forEach((t) => {
    const key = String(t.occurred_on).slice(0, 7)
    if (!map[key]) return
    if (t.type === 'income') map[key].ingreso += Number(t.amount)
    if (t.type === 'expense') map[key].gasto += Number(t.amount)
  })
  return Object.values(map)
}
