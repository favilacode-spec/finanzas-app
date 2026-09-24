import { useEffect, useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, moneyShort } from '../lib/format'
import { shortDate, MONTHS_SHORT, parseLocal, todayLocal } from '../lib/dates'
import Modal from '../components/Modal'
import Tile from '../components/Tile'
import { guessIcon } from '../components/Icon'
import { monthlyEq } from './Bills'

const tipStyle = { background: '#1f2327', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f4f6f7', fontSize: 13 }
const norm = (s) => String(s || '').trim().toLowerCase()

export function ExtraReports({ tab, txns, cats, accounts, months, setMonths }) {
  const { household } = useAuth()
  const [all, setAll] = useState(null) // historial completo (patrimonio / costo total)
  const [recs, setRecs] = useState([])
  const [budgets, setBudgets] = useState([])
  const [debts, setDebts] = useState([])
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (!household) return
    Promise.all([
      supabase.from('transactions').select('amount,type,account_id,transfer_account_id,occurred_on,payee').order('occurred_on'),
      supabase.from('recurring_transactions').select('*').eq('active', true),
      supabase.from('budgets').select('*'),
      supabase.from('debts').select('current_balance,min_payment').eq('paid_off', false),
    ]).then(([t, r, b, d]) => { setAll(t.data || []); setRecs(r.data || []); setBudgets(b.data || []); setDebts(d.data || []) })
  }, [household])

  const periodPicker = (
    <div className="segmented no-print" style={{ maxWidth: 360, marginBottom: 14 }}>
      {[3, 6, 12].map((m) => <button key={m} className={months === m ? 'active' : ''} onClick={() => setMonths(m)}>{m} meses</button>)}
    </div>
  )

  // ---- Patrimonio a lo largo del tiempo ----
  const netSeries = useMemo(() => {
    if (!all) return []
    const inc = accounts.filter((a) => !a.exclude_from_total)
    const ids = new Set(inc.map((a) => a.id))
    const opening = inc.reduce((s, a) => s + Number(a.opening_balance || 0), 0)
    const out = []
    const now = new Date()
    const n = Math.max(months, 6)
    for (let i = n - 1; i >= 0; i--) {
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
      const endIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
      let v = opening
      all.forEach((t) => {
        if (t.occurred_on > endIso) return
        const a = ids.has(t.account_id), b = ids.has(t.transfer_account_id)
        if (t.type === 'income' && a) v += Number(t.amount)
        else if (t.type === 'expense' && a) v -= Number(t.amount)
        else if (t.type === 'transfer') { if (a && !b) v -= Number(t.amount); if (b && !a) v += Number(t.amount) }
      })
      out.push({ month: `${MONTHS_SHORT[end.getMonth()]} ${String(end.getFullYear()).slice(2)}`, saldo: v })
    }
    return out
  }, [all, accounts, months])

  // ---- Comercios / personas ----
  const payees = useMemo(() => {
    const m = {}
    txns.filter((t) => t.type !== 'transfer' && t.payee).forEach((t) => {
      const k = norm(t.payee)
      m[k] ||= { name: t.payee.trim(), out: 0, in: 0, n: 0, last: t.occurred_on, list: [], cat: t.category_id }
      const x = m[k]
      if (t.type === 'expense') x.out += Number(t.amount); else x.in += Number(t.amount)
      x.n++; x.list.push(t); if (t.occurred_on > x.last) x.last = t.occurred_on
    })
    return Object.values(m).sort((a, b) => (b.out + b.in) - (a.out + a.in))
  }, [txns])

  // ---- Etiquetas ----
  const tags = useMemo(() => {
    const m = {}
    txns.forEach((t) => (t.tags || []).forEach((tag) => {
      m[tag] ||= { name: tag, out: 0, in: 0, n: 0, list: [] }
      if (t.type === 'expense') m[tag].out += Number(t.amount); else if (t.type === 'income') m[tag].in += Number(t.amount)
      m[tag].n++; m[tag].list.push(t)
    }))
    return Object.values(m).sort((a, b) => b.out - a.out)
  }, [txns])

  // ---- Suscripciones: costo real ----
  const subs = useMemo(() => {
    const y = String(new Date().getFullYear())
    const ly = String(new Date().getFullYear() - 1)
    return recs.filter((r) => r.type === 'expense').map((r) => {
      const k = norm(r.payee)
      const matches = (all || []).filter((t) => t.type === 'expense' && k && norm(t.payee) === k)
      return {
        r,
        monthly: monthlyEq(r), yearly: monthlyEq(r) * 12,
        thisYear: matches.filter((t) => t.occurred_on.startsWith(y)).reduce((s, t) => s + Number(t.amount), 0),
        lastYear: matches.filter((t) => t.occurred_on.startsWith(ly)).reduce((s, t) => s + Number(t.amount), 0),
        lifetime: matches.reduce((s, t) => s + Number(t.amount), 0), count: matches.length,
      }
    }).sort((a, b) => b.yearly - a.yearly)
  }, [recs, all])

  // ---- Proyección anual ----
  const proj = useMemo(() => {
    const recIn = recs.filter((r) => r.type === 'income').reduce((s, r) => s + monthlyEq(r), 0)
    const recOut = recs.filter((r) => r.type === 'expense').reduce((s, r) => s + monthlyEq(r), 0)
    const recCats = new Set(recs.map((r) => r.category_id).filter(Boolean))
    const bud = budgets.filter((b) => b.category_id && !recCats.has(b.category_id)).reduce((s, b) => s + Number(b.amount), 0)
    const debt = debts.reduce((s, d) => s + Number(d.min_payment || 0), 0)
    const realIn = txns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0) / months
    const realOut = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0) / months
    return { recIn, recOut, bud, debt, realIn, realOut }
  }, [recs, budgets, debts, txns, months])

  if (!all) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  if (tab === 'patrimonio') {
    const last = netSeries[netSeries.length - 1]?.saldo || 0
    const first = netSeries[0]?.saldo || 0
    return (
      <div className="stack">
        {periodPicker}
        <div className="card card-hero">
          <div className="stat-label">Saldo de tus cuentas hoy</div>
          <div className="amount-big" style={{ fontSize: 30, color: last < 0 ? 'var(--red)' : 'var(--accent)' }}>{money(last)}</div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>{last - first >= 0 ? 'Subió' : 'Bajó'} {money(Math.abs(last - first))} en {netSeries.length} meses{debts.length ? ` · deudas aparte: ${money(debts.reduce((s, d) => s + Number(d.current_balance || 0), 0))}` : ''}</div>
        </div>
        <div className="card">
          <div className="card-title">Evolución (fin de cada mes)</div>
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <AreaChart data={netSeries}>
                <defs><linearGradient id="gNw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5eead4" stopOpacity={0.45} /><stop offset="100%" stopColor="#5eead4" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: '#6b737b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={moneyShort} tick={{ fill: '#6b737b', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v) => money(v)} contentStyle={tipStyle} />
                <Area type="monotone" dataKey="saldo" name="Saldo" stroke="#5eead4" fill="url(#gNw)" strokeWidth={2.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'comercios' || tab === 'etiquetas') {
    const list = tab === 'comercios' ? payees : tags
    return (
      <div className="stack">
        {periodPicker}
        {list.length === 0 ? <div className="card empty-state">{tab === 'comercios' ? 'Sin comercios en este período.' : 'Todavía no usaste etiquetas. Agregalas al cargar un movimiento (ej: #viaje, #trabajo).'}</div> : (
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <div className="list">
              {list.slice(0, 60).map((x) => (
                <div className="list-row clickable" key={x.name} onClick={() => setOpen(x)}>
                  <Tile icon={tab === 'etiquetas' ? 'tag' : (cats[x.cat]?.icon || guessIcon(x.name))} color={tab === 'etiquetas' ? '#a78bfa' : (cats[x.cat]?.color || '#94a3b8')} />
                  <div className="list-main">
                    <div className="list-title">{tab === 'etiquetas' ? '#' : ''}{x.name}</div>
                    <div className="list-sub">{x.n} movimiento{x.n > 1 ? 's' : ''}{x.last ? ` · último ${shortDate(x.last)}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {x.out > 0 && <div className="list-amount amount-neg">−{money(x.out)}</div>}
                    {x.in > 0 && <div className="list-amount amount-pos">+{money(x.in)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {open && (
          <Modal title={(tab === 'etiquetas' ? '#' : '') + open.name} onClose={() => setOpen(null)}>
            <div className="row" style={{ gap: 10, marginBottom: 12 }}>
              {open.out > 0 && <span className="badge badge-red">Gastado {money(open.out)}</span>}
              {open.in > 0 && <span className="badge badge-green">Recibido {money(open.in)}</span>}
              <span className="badge">Promedio {money((open.out + open.in) / open.n)}</span>
            </div>
            <div className="list">
              {open.list.slice().sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).map((t) => (
                <div className="list-row" key={t.id} style={{ minHeight: 44 }}>
                  <div className="list-main"><div className="list-title" style={{ fontSize: 14 }}>{t.payee || cats[t.category_id]?.name || 'Movimiento'}</div><div className="list-sub">{shortDate(t.occurred_on)} {parseLocal(t.occurred_on).getFullYear()}{cats[t.category_id] ? ' · ' + cats[t.category_id].name : ''}</div></div>
                  <span className={`list-amount ${t.type === 'income' ? 'amount-pos' : 'amount-neg'}`}>{t.type === 'income' ? '+' : '−'}{money(t.amount)}</span>
                </div>
              ))}
            </div>
          </Modal>
        )}
      </div>
    )
  }

  if (tab === 'suscripciones') {
    const tot = subs.reduce((s, x) => s + x.yearly, 0)
    const onlySubs = subs.filter((x) => x.r.kind === 'subscription')
    return (
      <div className="stack">
        <div className="card card-hero">
          <div className="stat-label">Tus pagos fijos cuestan al año</div>
          <div className="amount-big" style={{ fontSize: 30 }}>{money(tot)}</div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>{money(tot / 12)} por mes · suscripciones: {money(onlySubs.reduce((s, x) => s + x.yearly, 0))}/año</div>
        </div>
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          <div className="list">
            {subs.map((x) => (
              <div className="list-row" key={x.r.id} style={{ alignItems: 'flex-start', paddingTop: 12 }}>
                <Tile icon={x.r.icon || guessIcon(x.r.payee)} color={x.r.color || '#5eead4'} />
                <div className="list-main">
                  <div className="row between"><span className="list-title">{x.r.payee || 'Pago'}</span><span className="list-amount">{money(x.yearly)}<span className="text-muted" style={{ fontSize: 11 }}>/año</span></span></div>
                  <div className="list-sub" style={{ whiteSpace: 'normal' }}>Este año {money(x.thisYear)} · año pasado {money(x.lastYear)} · total histórico {money(x.lifetime)} ({x.count} pagos)</div>
                </div>
              </div>
            ))}
            {!subs.length && <div className="empty-state" style={{ padding: 20 }}>Cargá tus pagos fijos en Pagos.</div>}
          </div>
        </div>
        <p className="text-muted" style={{ fontSize: 12 }}>El historial se calcula con los movimientos que tienen el mismo nombre que el pago (ej: “Netflix”).</p>
      </div>
    )
  }

  // proyección
  const yIn = proj.recIn * 12
  const yOut = (proj.recOut + proj.bud + proj.debt) * 12
  const m = new Date().getMonth()
  return (
    <div className="stack">
      {periodPicker}
      <div className="card card-hero">
        <div className="stat-label">Si todo sigue igual, en 12 meses ahorrás</div>
        <div className="amount-big" style={{ fontSize: 30, color: yIn - yOut >= 0 ? 'var(--accent)' : 'var(--red)' }}>{money(yIn - yOut)}</div>
        <div className="text-muted" style={{ fontSize: 12.5 }}>según ingresos fijos, pagos fijos, presupuestos y cuotas de deudas</div>
      </div>
      <div className="card">
        <div className="card-title">Plan (por año)</div>
        <div className="list">
          <div className="list-row"><div className="list-main"><div className="list-title">Ingresos fijos</div></div><span className="list-amount amount-pos">+{money(yIn)}</span></div>
          <div className="list-row"><div className="list-main"><div className="list-title">Pagos fijos y suscripciones</div></div><span className="list-amount amount-neg">−{money(proj.recOut * 12)}</span></div>
          <div className="list-row"><div className="list-main"><div className="list-title">Presupuestos variables</div></div><span className="list-amount amount-neg">−{money(proj.bud * 12)}</span></div>
          <div className="list-row"><div className="list-main"><div className="list-title">Cuotas de deudas</div></div><span className="list-amount amount-neg">−{money(proj.debt * 12)}</span></div>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Según lo que realmente pasó ({months} meses)</div>
        <div className="list">
          <div className="list-row"><div className="list-main"><div className="list-title">Ingresos promedio</div><div className="list-sub">{money(proj.realIn)}/mes</div></div><span className="list-amount amount-pos">+{money(proj.realIn * 12)}</span></div>
          <div className="list-row"><div className="list-main"><div className="list-title">Gastos promedio</div><div className="list-sub">{money(proj.realOut)}/mes</div></div><span className="list-amount amount-neg">−{money(proj.realOut * 12)}</span></div>
          <div className="list-row"><div className="list-main"><div className="list-title">Ahorro proyectado</div><div className="list-sub">hasta {MONTHS_SHORT[m]} {new Date().getFullYear() + 1}</div></div><span className="list-amount" style={{ color: proj.realIn - proj.realOut >= 0 ? 'var(--accent)' : 'var(--red)' }}>{money((proj.realIn - proj.realOut) * 12)}</span></div>
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 12 }}>Tus ingresos como freelance varían: la segunda tarjeta usa tu promedio real, que suele ser más confiable. Actualizado al {shortDate(todayLocal())}.</p>
    </div>
  )
}
