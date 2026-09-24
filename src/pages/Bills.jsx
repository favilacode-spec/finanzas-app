import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, CheckCircle2, SkipForward, CalendarPlus, Download, Copy, Check, ExternalLink,
  ShieldCheck, Repeat, PieChart, CreditCard, CalendarDays, BellRing, RotateCcw,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, moneyCompact } from '../lib/format'
import {
  FREQ, todayLocal, advance, daysUntil, dueLabel, dueTone, catchUp, overdueCount, parseLocal,
  cardDueDate, shortDate, monthEnd, addDays,
} from '../lib/dates'
import { feedUrls, googleEventUrl, downloadIcs } from '../lib/ics'
import { useOnChange, notifyChange } from '../lib/events'
import Modal from '../components/Modal'
import Tile from '../components/Tile'
import MoneyInput from '../components/MoneyInput'
import IconPicker from '../components/IconPicker'
import TransactionModal from '../components/TransactionModal'
import { BILL_ICONS, guessIcon } from '../components/Icon'

export const monthlyEq = (r) => {
  const a = Number(r.amount || 0)
  if (r.frequency === 'daily') return a * 30
  if (r.frequency === 'weekly') return a * 4.33
  if (r.frequency === 'biweekly') return a * 2
  if (r.frequency === 'yearly') return a / 12
  return a
}
const toneStyle = (t) => t === 'red' ? 'badge badge-red' : t === 'amber' ? 'badge badge-amber' : 'badge'

export default function Bills() {
  const { household, user } = useAuth()
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState([])
  const [cats, setCats] = useState([])
  const [budgets, setBudgets] = useState([])
  const [debts, setDebts] = useState([])
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('pagar')
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)
  const [paying, setPaying] = useState(null)
  const [cardPay, setCardPay] = useState(null)
  const [fundMonths, setFundMonths] = useState(3)
  const [showSync, setShowSync] = useState(false)

  const load = async () => {
    const since = `${new Date().getFullYear() - 1}-01-01`
    const [r, a, bal, c, b, dbt, tx] = await Promise.all([
      supabase.from('recurring_transactions').select('*').order('next_date'),
      supabase.from('accounts').select('*').eq('archived', false).order('sort').order('name'),
      supabase.from('account_balances').select('*'),
      supabase.from('categories').select('id,name,kind,color,icon'),
      supabase.from('budgets').select('*'),
      supabase.from('debts').select('current_balance,min_payment').eq('paid_off', false),
      supabase.from('transactions').select('payee,amount,occurred_on,category_id,type').gte('occurred_on', since),
    ])
    setItems(r.data || []); setAccounts(a.data || []); setBalances(bal.data || []); setCats(c.data || [])
    setBudgets(b.data || []); setDebts(dbt.data || []); setTxns(tx.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnChange(load)

  const accName = (id) => accounts.find((a) => a.id === id)?.name || '—'
  const catName = (id) => cats.find((c) => c.id === id)?.name || ''
  const balOf = (id) => Number(balances.find((b) => b.account_id === id)?.balance || 0)
  const today = todayLocal()

  // Pagos (gastos recurrentes activos) + tarjetas de crédito con deuda
  const bills = useMemo(() => {
    const list = items.filter((r) => r.type === 'expense' && r.active !== false && !(r.end_date && r.end_date < today))
      .map((r) => ({ ...r, _kind: 'rec' }))
    accounts.filter((a) => a.type === 'credit_card' && a.due_day && balOf(a.id) < 0).forEach((a) => {
      list.push({ id: 'card-' + a.id, _kind: 'card', account: a, payee: `Tarjeta ${a.name}`, amount: -balOf(a.id), next_date: cardDueDate(a.due_day), frequency: 'monthly', icon: 'credit-card', color: a.color || '#f472b6' })
    })
    return list.sort((x, y) => x.next_date.localeCompare(y.next_date))
  }, [items, accounts, balances, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const incomes = items.filter((r) => r.type === 'income' && r.active !== false).sort((x, y) => x.next_date.localeCompare(y.next_date))
  const overdue = bills.filter((b) => b.next_date < today)
  const next = bills.find((b) => b.next_date >= today) || bills[0]
  const endMonth = monthEnd(today)
  const thisMonth = bills.filter((b) => b.next_date <= endMonth)
  const next30 = bills.filter((b) => b.next_date >= today && b.next_date <= addDays(today, 30))
  const subs = items.filter((r) => r.kind === 'subscription' && r.active !== false)

  const groups = [
    { key: 'overdue', label: 'Vencidos', list: overdue },
    { key: 'week', label: 'Esta semana', list: bills.filter((b) => b.next_date >= today && daysUntil(b.next_date) <= 7) },
    { key: 'month', label: 'Este mes', list: bills.filter((b) => daysUntil(b.next_date) > 7 && b.next_date <= endMonth) },
    { key: 'later', label: 'Más adelante', list: bills.filter((b) => b.next_date > endMonth && daysUntil(b.next_date) > 7) },
  ]

  const skip = async (r) => {
    await supabase.from('recurring_transactions').update({ next_date: advance(r.next_date, r.frequency, parseLocal(r.next_date).getDate()) }).eq('id', r.id)
    setDetail(null); load()
  }
  const catchUpAll = async () => {
    const recs = overdue.filter((b) => b._kind === 'rec')
    if (!recs.length) return
    if (!confirm(`Vas a mover ${recs.length} pago(s) vencido(s) a su próxima fecha SIN registrar gastos (útil si ya los pagaste y no los marcaste). ¿Seguimos?`)) return
    await Promise.all(recs.map((r) => supabase.from('recurring_transactions').update({ next_date: catchUp(r.next_date, r.frequency, today) }).eq('id', r.id)))
    load()
  }
  const del = async (r) => {
    if (!confirm(`¿Eliminar "${r.payee || 'este pago'}"? Los movimientos ya registrados no se borran.`)) return
    await supabase.from('recurring_transactions').delete().eq('id', r.id); setDetail(null); load()
  }
  const toggleFund = async (r) => { await supabase.from('recurring_transactions').update({ include_in_fund: !r.include_in_fund }).eq('id', r.id); load() }

  const onRowClick = (b) => b._kind === 'card' ? setCardPay(b) : setDetail(b)

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  // ----- resumen mensual (lo que ya tenías) -----
  const recExp = items.filter((r) => r.type === 'expense' && r.active !== false)
  const recRows = recExp.map((r) => ({ id: r.id, name: r.payee || catName(r.category_id) || 'Recurrente', sub: `${FREQ[r.frequency] || ''}${catName(r.category_id) ? ' · ' + catName(r.category_id) : ''}`, amount: monthlyEq(r), icon: r.icon || guessIcon(r.payee), color: r.color || '#5eead4' }))
  const recCatIds = new Set(recExp.map((r) => r.category_id).filter(Boolean))
  const budgetRows = budgets.filter((b) => b.category_id && !recCatIds.has(b.category_id)).map((b) => ({ id: b.id, name: catName(b.category_id) || 'Presupuesto', amount: Number(b.amount) }))
  const debtTotalBal = debts.reduce((s, d) => s + Number(d.current_balance), 0)
  const debtMin = debts.reduce((s, d) => s + Number(d.min_payment || 0), 0)
  const debtMonthly = debts.length ? Math.max(debtMin, Math.ceil(debtTotalBal / 17)) : 0
  const recSum = recRows.reduce((s, x) => s + x.amount, 0)
  const budgetSum = budgetRows.reduce((s, x) => s + x.amount, 0)
  const grandTotal = recSum + budgetSum + debtMonthly
  const fundItems = items.filter((r) => r.include_in_fund && r.type === 'expense')
  const monthlyFund = fundItems.reduce((s, r) => s + monthlyEq(r), 0)

  const Row = ({ b }) => {
    const t = dueTone(b.next_date)
    const late = b._kind === 'rec' && b.next_date < today ? overdueCount(b.next_date, b.frequency, today) : 0
    return (
      <div className="list-row clickable" onClick={() => onRowClick(b)}>
        <Tile icon={b.icon || guessIcon(b.payee)} color={b.color || '#5eead4'} />
        <div className="list-main">
          <div className="list-title">{b.payee || catName(b.category_id) || 'Pago'}</div>
          <div className="list-sub">
            {b._kind === 'card' ? 'Resumen de tarjeta' : `${FREQ[b.frequency] || ''}${b.kind === 'subscription' ? ' · Suscripción' : ''} · ${accName(b.account_id)}`}
            {late > 1 ? ` · ${late} sin marcar` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="list-amount">{b.amount_variable ? '≈ ' : ''}{money(b.amount)}</div>
          <span className={toneStyle(t)} style={{ fontSize: 11, padding: '2px 8px', marginTop: 3 }}>{dueLabel(b.next_date)}</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="segmented" style={{ maxWidth: 460, marginBottom: 14 }}>
        <button className={view === 'pagar' ? 'active' : ''} onClick={() => setView('pagar')}>Por pagar</button>
        <button className={view === 'cobrar' ? 'active' : ''} onClick={() => setView('cobrar')}>Por cobrar</button>
        <button className={view === 'mensual' ? 'active' : ''} onClick={() => setView('mensual')}>Mensual</button>
      </div>

      {view === 'pagar' && (
        <div className="stack">
          {/* Próximo pago */}
          {next ? (
            <div className="card card-hero">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="row" style={{ gap: 12, minWidth: 0 }}>
                  <Tile icon={next.icon || guessIcon(next.payee)} color={next.color || '#5eead4'} size="lg" />
                  <div style={{ minWidth: 0 }}>
                    <div className="stat-label">{next.next_date < today ? 'Pago vencido' : 'Próximo pago'}</div>
                    <div style={{ fontWeight: 750, fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{next.payee || 'Pago'}</div>
                    <div className="text-muted" style={{ fontSize: 12.5 }}>{shortDate(next.next_date)} · {dueLabel(next.next_date)}</div>
                  </div>
                </div>
                <div className="amount-big" style={{ fontSize: 24 }}>{money(next.amount)}</div>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => next._kind === 'card' ? setCardPay(next) : setPaying(next)}><CheckCircle2 size={17} /> {next._kind === 'card' ? 'Pagar tarjeta' : 'Marcar pagado'}</button>
                {next._kind === 'rec' && <button className="btn btn-secondary" onClick={() => setDetail(next)}>Detalles</button>}
              </div>
            </div>
          ) : null}

          <div className="stats-3">
            <div className="card"><div className="stat-label">Falta este mes</div><div className="stat-value" >{moneyCompact(thisMonth.reduce((s, b) => s + Number(b.amount), 0))}</div><div className="text-muted" style={{ fontSize: 11.5 }}>{thisMonth.length} pagos</div></div>
            <div className="card"><div className="stat-label">Próx. 30 días</div><div className="stat-value" >{moneyCompact(next30.reduce((s, b) => s + Number(b.amount), 0))}</div><div className="text-muted" style={{ fontSize: 11.5 }}>{next30.length} pagos</div></div>
            <div className="card"><div className="stat-label">Suscripciones</div><div className="stat-value" >{moneyCompact(subs.reduce((s, r) => s + monthlyEq(r), 0))}</div><div className="text-muted" style={{ fontSize: 11.5 }}>por mes · {subs.length}</div></div>
          </div>

          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => setForm({ type: 'expense' })}><Plus size={17} /> Nuevo pago</button>
            <button className="btn btn-secondary" onClick={() => setShowSync(true)}><CalendarPlus size={16} /> Sincronizar calendario</button>
            <button className="btn btn-secondary" onClick={() => nav('/calendario')}><CalendarDays size={16} /> Calendario</button>
          </div>

          {overdue.filter((b) => b._kind === 'rec').length > 1 && (
            <div className="card" style={{ borderColor: 'var(--red-border)', background: 'var(--red-soft)' }}>
              <div className="row between wrap" style={{ gap: 10 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700 }}>Tenés {overdue.length} pagos vencidos</div>
                  <div className="text-2" style={{ fontSize: 13 }}>Si ya los pagaste y no los marcaste, ponelos al día de un toque (no registra gastos).</div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={catchUpAll}><RotateCcw size={15} /> Ponerse al día</button>
              </div>
            </div>
          )}

          {bills.length === 0 ? (
            <div className="card empty-state"><Repeat size={40} /><p>Agregá lo que pagás todos los meses: alquiler, internet, ANDE, Netflix…</p></div>
          ) : groups.filter((g) => g.list.length).map((g) => (
            <div key={g.key}>
              <div className="section-label">{g.label} · {money(g.list.reduce((s, b) => s + Number(b.amount), 0))}</div>
              <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
                <div className="list">{g.list.map((b) => <Row key={b.id} b={b} />)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'cobrar' && (
        <div className="stack">
          <div className="row between">
            <p className="text-2" style={{ fontSize: 14 }}>Ingresos que esperás (sueldo, clientes fijos).</p>
            <button className="btn btn-primary" onClick={() => setForm({ type: 'income' })}><Plus size={17} /> Nuevo</button>
          </div>
          {incomes.length === 0 ? <div className="card empty-state">Sin ingresos recurrentes.</div> : (
            <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <div className="list">
                {incomes.map((r) => (
                  <div className="list-row clickable" key={r.id} onClick={() => setDetail(r)}>
                    <Tile icon={r.icon || 'briefcase'} color={r.color || '#34d399'} />
                    <div className="list-main">
                      <div className="list-title">{r.payee || catName(r.category_id) || 'Ingreso'}</div>
                      <div className="list-sub">{FREQ[r.frequency]} · {accName(r.account_id)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="list-amount amount-pos">+{money(r.amount)}</div>
                      <span className={toneStyle(dueTone(r.next_date))} style={{ fontSize: 11, padding: '2px 8px', marginTop: 3 }}>{dueLabel(r.next_date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'mensual' && (
        <div className="stack">
          <div className="card card-hero">
            <div className="stat-label">Gasto mensual general</div>
            <div className="amount-big" style={{ fontSize: 32 }}>{money(grandTotal)}</div>
            <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>pagos {money(recSum)} + presupuestos {money(budgetSum)} + deudas {money(debtMonthly)}</div>
          </div>

          <div className="card">
            <div className="row between wrap" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 12 }}>
                <Tile icon="shield" color="#60a5fa" />
                <div>
                  <div style={{ fontWeight: 700 }}>Fondo de emergencia</div>
                  <div className="text-muted" style={{ fontSize: 12.5 }}>{fundItems.length === 0 ? 'Tocá el escudo en los pagos esenciales.' : `${fundItems.length} esenciales · ${money(monthlyFund)}/mes`}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="stat-value" style={{ fontSize: 22 }}>{money(monthlyFund * fundMonths)}</div>
                <div className="row" style={{ gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                  {[3, 6, 12].map((m) => <button key={m} type="button" onClick={() => setFundMonths(m)} className={`badge chip-btn ${fundMonths === m ? 'on' : ''}`}>{m} meses</button>)}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title"><Repeat size={16} /> Pagos fijos <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>{money(recSum)}/mes</span></div>
            <div className="list">
              {recRows.map((x) => {
                const r = items.find((i) => i.id === x.id)
                return (
                  <div className="list-row" key={x.id}>
                    <Tile icon={x.icon} color={x.color} size="sm" />
                    <div className="list-main"><div className="list-title">{x.name}</div><div className="list-sub">{x.sub}</div></div>
                    <button className="icon-btn" onClick={() => toggleFund(r)} title="Incluir en fondo de emergencia"
                      style={{ color: r.include_in_fund ? '#60a5fa' : 'var(--text-muted)', background: r.include_in_fund ? 'rgba(96,165,250,.14)' : undefined }}><ShieldCheck size={14} /></button>
                    <span className="list-amount">{money(x.amount)}</span>
                  </div>
                )
              })}
              {!recRows.length && <div className="empty-state" style={{ padding: 20 }}>Sin pagos fijos.</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-title"><PieChart size={16} /> Presupuestos (no repetidos) <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>{money(budgetSum)}/mes</span></div>
            <div className="list">
              {budgetRows.map((x) => <div className="list-row" key={x.id}><div className="list-main"><div className="list-title">{x.name}</div></div><span className="list-amount">{money(x.amount)}</span></div>)}
              {!budgetRows.length && <div className="empty-state" style={{ padding: 20 }}>Definilos en Presupuestos.</div>}
            </div>
          </div>

          {debts.length > 0 && (
            <div className="card">
              <div className="card-title"><CreditCard size={16} /> Pago de deudas (plan) <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600 }}>{money(debtMonthly)}/mes</span></div>
            </div>
          )}
        </div>
      )}

      {form && <BillForm rec={form} household={household} accounts={accounts} cats={cats} onClose={() => setForm(null)} onSaved={() => { load(); notifyChange() }} />}
      {detail && (
        <BillDetail r={detail} txns={txns} accName={accName} catName={catName}
          onClose={() => setDetail(null)} onPay={() => { setPaying(detail); setDetail(null) }} onSkip={() => skip(detail)}
          onEdit={() => { setForm(detail); setDetail(null) }} onDelete={() => del(detail)} />
      )}
      {paying && <PayModal r={paying} accounts={accounts} household={household} user={user} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); notifyChange() }} />}
      {cardPay && <TransactionModal prefill={{ type: 'transfer', amount: cardPay.amount, toAccount: cardPay.account.id, accountId: accounts.find((a) => a.type !== 'credit_card')?.id, payee: `Pago ${cardPay.payee}` }} onClose={() => setCardPay(null)} onSaved={load} />}
      {showSync && <SyncModal household={household} onClose={() => setShowSync(false)} />}
    </div>
  )
}

/* ---------------- Detalle de un pago ---------------- */
function BillDetail({ r, txns, accName, catName, onClose, onPay, onSkip, onEdit, onDelete }) {
  const name = (r.payee || '').trim().toLowerCase()
  const matches = txns.filter((t) => t.type === r.type && ((name && (t.payee || '').trim().toLowerCase() === name) || (!name && r.category_id && t.category_id === r.category_id)))
  const y = new Date().getFullYear()
  const thisYear = matches.filter((t) => t.occurred_on.startsWith(String(y))).reduce((s, t) => s + Number(t.amount), 0)
  const lastYear = matches.filter((t) => t.occurred_on.startsWith(String(y - 1))).reduce((s, t) => s + Number(t.amount), 0)
  const late = r.next_date < todayLocal() ? overdueCount(r.next_date, r.frequency) : 0
  const isInc = r.type === 'income'

  return (
    <Modal title={r.payee || 'Pago'} onClose={onClose}>
      <div className="row" style={{ gap: 14, marginBottom: 16 }}>
        <Tile icon={r.icon || guessIcon(r.payee)} color={r.color || '#5eead4'} size="lg" />
        <div style={{ flex: 1 }}>
          <div className="amount-big" style={{ fontSize: 26 }}>{r.amount_variable ? '≈ ' : ''}{money(r.amount)}</div>
          <div className="text-muted" style={{ fontSize: 13 }}>{FREQ[r.frequency]} · {accName(r.account_id)}{catName(r.category_id) ? ' · ' + catName(r.category_id) : ''}</div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--bg-elevated)', padding: 14, marginBottom: 14 }}>
        <div className="row between"><span className="text-2">Próxima fecha</span><strong>{shortDate(r.next_date)} · {dueLabel(r.next_date)}</strong></div>
        {late > 1 && <div className="text-red" style={{ fontSize: 12.5, marginTop: 6 }}>{late} vencimientos sin marcar desde {shortDate(r.next_date)}</div>}
        {!isInc && <div className="row between" style={{ marginTop: 8 }}><span className="text-2">Aviso</span><span>{r.remind_days === 0 ? 'El mismo día' : `${r.remind_days ?? 1} día(s) antes`}</span></div>}
        {r.last_paid_on && <div className="row between" style={{ marginTop: 8 }}><span className="text-2">Último {isInc ? 'cobro' : 'pago'}</span><span>{shortDate(r.last_paid_on)}</span></div>}
        {r.note && <div className="text-2" style={{ marginTop: 8, fontSize: 13 }}>{r.note}</div>}
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onPay}><CheckCircle2 size={17} /> {isInc ? 'Marcar cobrado' : 'Marcar pagado'}</button>
        <button className="btn btn-secondary" onClick={onSkip} title="Pasar al siguiente sin registrar"><SkipForward size={16} /> Saltar</button>
      </div>
      {r.pay_url && <a className="btn btn-soft btn-block" style={{ marginBottom: 10 }} href={r.pay_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Ir a pagar</a>}

      <div className="section-label" style={{ marginTop: 6 }}>Agregar a tu calendario</div>
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <a className="btn btn-secondary btn-sm" style={{ flex: 1 }} href={googleEventUrl(r)} target="_blank" rel="noreferrer"><CalendarPlus size={15} /> Google</a>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => downloadIcs(r)}><Download size={15} /> Apple / iPhone</button>
      </div>

      {!isInc && (
        <>
          <div className="section-label">Costo real</div>
          <div className="stats-3" style={{ marginBottom: 14 }}>
            <div className="card" style={{ background: 'var(--bg-elevated)' }}><div className="stat-label">Este año</div><div className="stat-value">{moneyCompact(thisYear)}</div></div>
            <div className="card" style={{ background: 'var(--bg-elevated)' }}><div className="stat-label">Año pasado</div><div className="stat-value">{moneyCompact(lastYear)}</div></div>
            <div className="card" style={{ background: 'var(--bg-elevated)' }}><div className="stat-label">Cuesta al año</div><div className="stat-value">{moneyCompact(monthlyEq(r) * 12)}</div></div>
          </div>
        </>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onEdit}><Pencil size={14} /> Editar</button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}><Trash2 size={14} /> Eliminar</button>
      </div>
    </Modal>
  )
}

/* ---------------- Marcar pagado / cobrado ---------------- */
function PayModal({ r, accounts, household, user, onClose, onDone }) {
  const [amount, setAmount] = useState(Number(r.amount) || 0)
  const [accountId, setAccountId] = useState(r.account_id || accounts[0]?.id)
  const [date, setDate] = useState(r.next_date > todayLocal() ? todayLocal() : (r.next_date < todayLocal() ? todayLocal() : r.next_date))
  const [updateAmount, setUpdateAmount] = useState(false)
  const [busy, setBusy] = useState(false)
  const isInc = r.type === 'income'

  const save = async (e) => {
    e.preventDefault()
    if (!amount) return
    setBusy(true)
    await supabase.from('transactions').insert({
      household_id: household.id, account_id: accountId, type: r.type, amount: Math.round(amount), currency: 'PYG',
      category_id: r.category_id, occurred_on: date, payee: r.payee, note: r.note, source: 'manual', created_by: user.id,
    })
    const upd = { next_date: advance(r.next_date, r.frequency, parseLocal(r.next_date).getDate()), last_paid_on: date }
    if (updateAmount) upd.amount = Math.round(amount)
    await supabase.from('recurring_transactions').update(upd).eq('id', r.id)
    setBusy(false); onDone()
  }

  return (
    <Modal title={isInc ? `Cobrado: ${r.payee || ''}` : `Pagado: ${r.payee || ''}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Monto</label><MoneyInput value={amount} onChange={setAmount} big autoFocus={!!r.amount_variable} /></div>
        {Number(amount) !== Number(r.amount) && (
          <label className="check"><input type="checkbox" checked={updateAmount} onChange={(e) => setUpdateAmount(e.target.checked)} /> Usar este monto para los próximos</label>
        )}
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>{isInc ? 'Entró a' : 'Salió de'}</label>
            <select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </div>
          <div className="field"><label>Fecha</label><input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Se registra el movimiento y el pago pasa a {shortDate(advance(r.next_date, r.frequency, parseLocal(r.next_date).getDate()))}.</p>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</button>
      </form>
    </Modal>
  )
}

/* ---------------- Crear / editar pago ---------------- */
function BillForm({ rec, household, accounts, cats, onClose, onSaved }) {
  const isNew = !rec.id
  const [type, setType] = useState(rec.type || 'expense')
  const [payee, setPayee] = useState(rec.payee || '')
  const [amount, setAmount] = useState(Number(rec.amount) || 0)
  const [variable, setVariable] = useState(!!rec.amount_variable)
  const [kind, setKind] = useState(rec.kind || 'bill')
  const [accountId, setAccountId] = useState(rec.account_id || household.default_account_id || accounts[0]?.id || '')
  const [categoryId, setCategoryId] = useState(rec.category_id || '')
  const [freq, setFreq] = useState(rec.frequency || 'monthly')
  const [nextDate, setNextDate] = useState(rec.next_date || todayLocal())
  const [endDate, setEndDate] = useState(rec.end_date || '')
  const [remind, setRemind] = useState(rec.remind_days ?? 1)
  const [icon, setIcon] = useState(rec.icon || '')
  const [color, setColor] = useState(rec.color || '#5eead4')
  const [payUrl, setPayUrl] = useState(rec.pay_url || '')
  const [note, setNote] = useState(rec.note || '')
  const [active, setActive] = useState(rec.active !== false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const list = cats.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))
  const shownIcon = icon || guessIcon(payee)

  const save = async (e) => {
    e.preventDefault()
    if (!payee.trim()) return setErr('Poné un nombre (ej: Internet)')
    if (!amount) return setErr('Poné el monto (si varía, uno aproximado)')
    if (!accountId) return setErr('Elegí una cuenta')
    setBusy(true)
    const payload = {
      household_id: household.id, account_id: accountId, type, amount: Math.round(amount), category_id: categoryId || null,
      frequency: freq, next_date: nextDate, end_date: endDate || null, payee: payee.trim(), note: note || null,
      kind: type === 'income' ? 'income' : kind, remind_days: Number(remind), icon: shownIcon, color,
      pay_url: payUrl || null, amount_variable: variable, active,
    }
    const { error } = isNew
      ? await supabase.from('recurring_transactions').insert(payload)
      : await supabase.from('recurring_transactions').update(payload).eq('id', rec.id)
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved(); onClose()
  }

  return (
    <Modal title={isNew ? (type === 'income' ? 'Nuevo ingreso fijo' : 'Nuevo pago') : 'Editar'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="segmented" style={{ marginBottom: 16 }}>
          <button type="button" className={type === 'expense' ? 'active-red' : ''} onClick={() => setType('expense')}>Pago</button>
          <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => setType('income')}>Ingreso</button>
        </div>
        <div className="row" style={{ gap: 12, marginBottom: 14 }}>
          <Tile icon={shownIcon} color={color} size="lg" />
          <input className="form-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={type === 'income' ? 'Ej: Sueldo, Cliente X' : 'Ej: Internet, Alquiler, Netflix'} autoFocus={isNew} />
        </div>
        <div className="field"><label>Monto</label><MoneyInput value={amount} onChange={setAmount} /></div>
        <label className="check"><input type="checkbox" checked={variable} onChange={(e) => setVariable(e.target.checked)} /> El monto varía cada mes (ANDE, agua…) — te lo pregunto al pagar</label>
        {type === 'expense' && (
          <div className="field">
            <label>Tipo</label>
            <div className="segmented">
              <button type="button" className={kind === 'bill' ? 'active' : ''} onClick={() => setKind('bill')}>Cuenta / servicio</button>
              <button type="button" className={kind === 'subscription' ? 'active' : ''} onClick={() => setKind('subscription')}>Suscripción</button>
            </div>
          </div>
        )}
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Frecuencia</label><select className="form-select" value={freq} onChange={(e) => setFreq(e.target.value)}>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label>Próximo vencimiento</label><input className="form-input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></div>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Cuenta</label><select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="field"><label>Categoría</label><select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Sin categoría</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        </div>
        {type === 'expense' && (
          <div className="field">
            <label><BellRing size={12} style={{ verticalAlign: -1 }} /> Avisarme</label>
            <div className="row wrap" style={{ gap: 6 }}>
              {[[0, 'El mismo día'], [1, '1 día antes'], [2, '2 días'], [3, '3 días'], [7, '1 semana']].map(([v, l]) => (
                <button type="button" key={v} className={`badge chip-btn ${Number(remind) === v ? 'on' : ''}`} onClick={() => setRemind(v)}>{l}</button>
              ))}
            </div>
          </div>
        )}
        <div className="field"><label>Ícono y color</label><IconPicker icons={BILL_ICONS} icon={shownIcon} color={color} onIcon={setIcon} onColor={setColor} /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Termina (opcional)</label><input className="form-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div className="field"><label>Link para pagar (opcional)</label><input className="form-input" value={payUrl} onChange={(e) => setPayUrl(e.target.value)} placeholder="https://…" /></div>
        </div>
        <div className="field"><label>Nota</label><input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: N° de cliente, plan contratado" /></div>
        {!isNew && <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activo</label>}
        {err && <div className="text-red" style={{ fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}

/* ---------------- Sincronizar con calendario ---------------- */
function SyncModal({ household, onClose }) {
  const [copied, setCopied] = useState(false)
  if (!household?.calendar_token) return <Modal title="Calendario" onClose={onClose}><p className="text-2">Recargá la app para activar el calendario.</p></Modal>
  const u = feedUrls(household.calendar_token)
  return (
    <Modal title="Tus pagos en el calendario" onClose={onClose}>
      <p className="text-2" style={{ fontSize: 14, marginBottom: 14 }}>
        Te suscribís una sola vez y todos tus pagos, vencimientos de tarjeta y metas aparecen en tu calendario. Si agregás o cambiás un pago acá, el calendario se actualiza solo.
      </p>
      <a className="btn btn-primary btn-block" href={u.google} target="_blank" rel="noreferrer" style={{ marginBottom: 8 }}><CalendarPlus size={17} /> Agregar a Google Calendar</a>
      <a className="btn btn-secondary btn-block" href={u.webcal} style={{ marginBottom: 14 }}><CalendarPlus size={17} /> Agregar a Apple Calendar</a>
      <div className="field">
        <label>O copiá el link (Outlook u otro calendario: “suscribirse desde URL”)</label>
        <div className="row" style={{ gap: 8 }}>
          <input className="form-input" readOnly value={u.https} style={{ fontSize: 12, fontFamily: 'monospace' }} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(u.https); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
        </div>
      </div>
      <p className="text-muted" style={{ fontSize: 12 }}>Google actualiza los calendarios suscritos cada algunas horas; Apple cada 6 horas. Apple además te avisa con alarma según los días de aviso de cada pago. Además te llega una notificación de la app a las 8:00 el día que vence y el día de aviso.</p>
    </Modal>
  )
}
