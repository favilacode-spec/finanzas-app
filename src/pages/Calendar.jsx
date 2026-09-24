import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import {
  todayLocal, monthStart, monthEnd, shiftMonth, parseLocal, toISO, addDays, occurrences, cardDueDate, monthName, shortDate,
} from '../lib/dates'
import { useOnChange } from '../lib/events'
import Tile from '../components/Tile'
import TransactionModal from '../components/TransactionModal'
import { guessIcon } from '../components/Icon'
import { feedUrls } from '../lib/ics'

const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
// monto ultra compacto para las celdas: 410k · 1,8M
const tiny = (n) => { const a = Math.abs(n); return a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + 'M' : a >= 1000 ? Math.round(a / 1000) + 'k' : String(Math.round(a)) }

export default function CalendarPage() {
  const { household } = useAuth()
  const [month, setMonth] = useState(monthStart())
  const [sel, setSel] = useState(todayLocal())
  const [txns, setTxns] = useState([])
  const [recs, setRecs] = useState([])
  const [cards, setCards] = useState([])
  const [cats, setCats] = useState({})
  const [add, setAdd] = useState(null)
  const [loading, setLoading] = useState(true)

  // grilla: desde el lunes anterior al día 1 hasta el domingo posterior al último día
  const gridStart = useMemo(() => { const d = parseLocal(month); const dow = (d.getDay() + 6) % 7; return addDays(month, -dow) }, [month])
  const gridEnd = useMemo(() => { const e = parseLocal(monthEnd(month)); const dow = (e.getDay() + 6) % 7; return addDays(toISO(e), 6 - dow) }, [month])

  const load = async () => {
    const [t, r, a, c] = await Promise.all([
      supabase.from('transactions').select('*').gte('occurred_on', gridStart).lte('occurred_on', gridEnd),
      supabase.from('recurring_transactions').select('*').eq('active', true),
      supabase.from('accounts').select('id,name,type,due_day,color').eq('type', 'credit_card').eq('archived', false),
      supabase.from('categories').select('id,name,color,icon'),
    ])
    setTxns(t.data || []); setRecs(r.data || []); setCards(a.data || [])
    const m = {}; (c.data || []).forEach((x) => { m[x.id] = x }); setCats(m)
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household, gridStart, gridEnd]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnChange(load)

  const today = todayLocal()
  // eventos planificados (desde hoy): recurrentes proyectados + vencimientos de tarjeta
  const planned = useMemo(() => {
    const from = gridStart < today ? today : gridStart
    const out = []
    recs.forEach((r) => occurrences(r, from, gridEnd).forEach((d) => out.push({ date: d, r, kind: 'rec' })))
    // vencidos sin marcar: se muestran en su fecha original
    recs.filter((r) => r.next_date < today && r.next_date >= gridStart).forEach((r) => out.push({ date: r.next_date, r, kind: 'rec', late: true }))
    cards.forEach((c) => {
      if (!c.due_day) return
      let d = cardDueDate(c.due_day, from)
      while (d && d <= gridEnd) { out.push({ date: d, card: c, kind: 'card' }); d = cardDueDate(c.due_day, addDays(d, 1)) }
    })
    return out
  }, [recs, cards, gridStart, gridEnd, today])

  const days = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d)

  const dayData = (d) => {
    const tx = txns.filter((t) => t.occurred_on === d)
    const pl = planned.filter((p) => p.date === d)
    const out = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0) + pl.filter((p) => p.kind === 'card' || p.r?.type === 'expense').reduce((s, p) => s + Number(p.r?.amount || 0), 0)
    const inc = tx.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0) + pl.filter((p) => p.r?.type === 'income').reduce((s, p) => s + Number(p.r.amount), 0)
    return { tx, pl, out, inc }
  }

  const selData = dayData(sel)
  const monthPlanned = planned.filter((p) => p.date.startsWith(month.slice(0, 7)) && (p.kind === 'card' || p.r?.type === 'expense'))
  const monthPlannedTotal = monthPlanned.reduce((s, p) => s + Number(p.r?.amount || 0), 0)

  return (
    <div className="stack">
      <div className="card cal-card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 750, fontSize: 17, textTransform: 'capitalize' }}>{monthName(month)}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>Pagos pendientes: {money(monthPlannedTotal)}</div>
          </div>
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
        </div>
        {loading ? <div style={{ padding: 30, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div> : (
          <div className="cal-grid">
            {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
            {days.map((d) => {
              const { tx, pl, out, inc } = dayData(d)
              const cls = ['cal-day', d.slice(0, 7) !== month.slice(0, 7) && 'out', d === today && 'today', d === sel && 'sel'].filter(Boolean).join(' ')
              return (
                <button key={d} className={cls} onClick={() => setSel(d)}>
                  <span className="cal-num">{parseLocal(d).getDate()}</span>
                  {out > 0 && <span className="cal-amt text-red">−{tiny(out)}</span>}
                  {inc > 0 && <span className="cal-amt text-accent">+{tiny(inc)}</span>}
                  <span className="cal-dots">
                    {pl.slice(0, 4).map((p, i) => <span key={i} style={{ background: p.late ? 'var(--red)' : p.kind === 'card' ? '#f472b6' : p.r.type === 'income' ? 'var(--accent)' : 'var(--amber)' }} />)}
                    {tx.slice(0, 3).map((t, i) => <span key={'t' + i} style={{ background: 'var(--text-muted)' }} />)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="row wrap" style={{ gap: 12, marginTop: 12, fontSize: 11.5 }}>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--amber)' }} />Pago</span>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--accent)' }} />Cobro</span>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 9, background: '#f472b6' }} />Tarjeta</span>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--red)' }} />Vencido</span>
          <span className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--text-muted)' }} />Movimiento</span>
        </div>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 6 }}>
          <div className="card-title" style={{ margin: 0, textTransform: 'capitalize' }}>{sel === today ? 'Hoy' : shortDate(sel)}</div>
          <button className="btn btn-soft btn-sm" onClick={() => setAdd({ date: sel })}><Plus size={15} /> Agregar</button>
        </div>
        {selData.pl.length === 0 && selData.tx.length === 0 && <div className="empty-state" style={{ padding: 22 }}>Nada este día.</div>}
        <div className="list">
          {selData.pl.map((p, i) => (
            <div className="list-row" key={'p' + i}>
              <Tile icon={p.kind === 'card' ? 'credit-card' : (p.r.icon || guessIcon(p.r.payee))} color={p.kind === 'card' ? (p.card.color || '#f472b6') : (p.r.color || '#5eead4')} />
              <div className="list-main">
                <div className="list-title">{p.kind === 'card' ? `Vence tarjeta ${p.card.name}` : p.r.payee || 'Pago'}</div>
                <div className="list-sub">{p.late ? 'Vencido sin marcar' : p.kind === 'card' ? 'Pagá el resumen' : p.r.type === 'income' ? 'Cobro esperado' : 'Pago programado'}</div>
              </div>
              {p.r && <span className={`list-amount ${p.r.type === 'income' ? 'amount-pos' : ''}`}>{p.r.type === 'income' ? '+' : ''}{money(p.r.amount)}</span>}
            </div>
          ))}
          {selData.tx.map((t) => (
            <div className="list-row clickable" key={t.id} onClick={() => setAdd({ edit: t })}>
              <Tile icon={cats[t.category_id]?.icon || (t.type === 'transfer' ? 'repeat' : 'receipt')} color={cats[t.category_id]?.color || '#94a3b8'} />
              <div className="list-main">
                <div className="list-title">{t.payee || cats[t.category_id]?.name || (t.type === 'transfer' ? 'Transferencia' : 'Movimiento')}</div>
                <div className="list-sub">{cats[t.category_id]?.name || ''}</div>
              </div>
              <span className={`list-amount ${t.type === 'income' ? 'amount-pos' : t.type === 'expense' ? 'amount-neg' : ''}`}>{t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      {household?.calendar_token && (
        <div className="card">
          <div className="card-title"><CalendarPlus size={17} /> Llevalo a tu calendario</div>
          <p className="text-2" style={{ fontSize: 13.5, marginBottom: 12 }}>Suscribite una vez y tus pagos aparecen en Google Calendar o en el Calendario del iPhone, siempre actualizados.</p>
          <div className="row" style={{ gap: 8 }}>
            <a className="btn btn-secondary btn-sm" style={{ flex: 1 }} href={feedUrls(household.calendar_token).google} target="_blank" rel="noreferrer">Google Calendar</a>
            <a className="btn btn-secondary btn-sm" style={{ flex: 1 }} href={feedUrls(household.calendar_token).webcal}>Apple Calendar</a>
          </div>
        </div>
      )}

      {add && (add.edit
        ? <TransactionModal edit={add.edit} onClose={() => setAdd(null)} onSaved={load} />
        : <TransactionModal prefill={{ date: add.date }} onClose={() => setAdd(null)} onSaved={load} />)}
    </div>
  )
}
