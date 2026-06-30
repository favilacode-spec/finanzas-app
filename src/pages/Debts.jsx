import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Star, ArrowUp, ArrowDown, CheckCircle2, CreditCard, Sparkles, Snowflake } from 'lucide-react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import Modal from '../components/Modal'

export default function Debts() {
  const { household, user } = useAuth()
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [payFor, setPayFor] = useState(null)
  const [ai, setAi] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('debts').select('*').eq('paid_off', false)
    // El orden lo manda 'sort' (manual). Como desempate, saldo más chico primero (snowball).
    const sorted = (data || []).sort((a, b) =>
      (a.sort - b.sort) || (Number(a.current_balance) - Number(b.current_balance)))
    setDebts(sorted)
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household])

  const total = debts.reduce((s, d) => s + Number(d.current_balance), 0)
  const totalMin = debts.reduce((s, d) => s + Number(d.min_payment || 0), 0)

  // Reasigna sort 0..n al nuevo orden y recarga
  const reindex = async (arr) => {
    await Promise.all(arr.map((d, idx) => supabase.from('debts').update({ sort: idx }).eq('id', d.id)))
    load()
  }

  const togglePriority = async (d) => {
    const next = !d.priority
    await supabase.from('debts').update({ priority: next }).eq('id', d.id)
    if (next) {
      // al marcar prioridad, mandarla arriba de todo
      const arr = [{ ...d, priority: true }, ...debts.filter((x) => x.id !== d.id)]
      reindex(arr)
    } else load()
  }

  const move = async (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= debts.length) return
    const arr = [...debts]
    const [x] = arr.splice(i, 1)
    arr.splice(j, 0, x)
    reindex(arr)
  }

  const snowball = async () => {
    // prioridad arriba, luego saldo más chico primero
    const order = [...debts].sort((a, b) => (b.priority - a.priority) || (Number(a.current_balance) - Number(b.current_balance)))
    reindex(order)
  }

  const del = async (id) => { if (confirm('¿Eliminar esta deuda?')) { await supabase.from('debts').delete().eq('id', id); load() } }

  const aiPlan = async () => {
    setAiBusy(true); setAi('')
    try {
      const { data: sess } = await supabase.auth.getSession()
      const summary = {
        objetivo: 'Plan para salir de deudas con método bola de nieve (snowball)',
        moneda: 'PYG',
        deudas: debts.map((d) => ({ nombre: d.name, saldo: Number(d.current_balance), interes: Number(d.interest_rate), pago_minimo: Number(d.min_payment), prioridad: d.priority })),
        total_deuda: total,
      }
      const r = await fetch(`${FUNCTIONS_URL}/ai-insights`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session.access_token}` },
        body: JSON.stringify({ summary }),
      })
      const j = await r.json()
      setAi(j.insights || j.error || 'No se pudo generar el plan.')
    } catch (e) { setAi(String(e.message || e)) } finally { setAiBusy(false) }
  }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(120deg, #1a1a1f, #0c0c0f)' }}>
        <div className="row between wrap">
          <div>
            <div className="stat-label">Deuda total</div>
            <div className="stat-value" style={{ fontSize: 30 }}>{money(total)}</div>
            <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{debts.length} deudas · pago mínimo mensual: {money(totalMin)}</div>
          </div>
          <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={18} /> Nueva deuda</button>
        </div>
      </div>

      <div className="row between wrap" style={{ marginBottom: 14, gap: 8 }}>
        <span className="text-2" style={{ fontSize: 13 }}>Orden sugerido: bola de nieve (saldo más chico primero). Marcá ⭐ para priorizar o movelas con las flechas.</span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={snowball}><Snowflake size={15} /> Ordenar snowball</button>
          <button className="btn btn-secondary btn-sm" onClick={aiPlan} disabled={aiBusy}><Sparkles size={15} /> {aiBusy ? 'Pensando…' : 'Plan IA'}</button>
        </div>
      </div>

      {ai && <div className="card" style={{ marginBottom: 16, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 14 }}>{ai}</div>}

      {debts.length === 0 ? (
        <div className="card empty-state"><CreditCard size={40} /><p>Agregá tus deudas para armar tu plan de salida.</p></div>
      ) : (
        <div className="grid">
          {debts.map((d, i) => {
            const paid = Number(d.total_amount) - Number(d.current_balance)
            const pct = d.total_amount > 0 ? Math.min(100, Math.max(0, (paid / Number(d.total_amount)) * 100)) : 0
            return (
              <div className="card" key={d.id}>
                <div className="row between" style={{ marginBottom: 10 }}>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="badge" style={{ fontWeight: 700 }}>{i + 1}</span>
                    <div>
                      <div className="row" style={{ gap: 7 }}>
                        <span style={{ fontWeight: 700, fontSize: 16 }}>{d.name}</span>
                        {d.priority && <Star size={15} fill="#e7e7ea" color="#e7e7ea" />}
                      </div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        Saldo {money(d.current_balance)} de {money(d.total_amount)}
                        {Number(d.min_payment) > 0 ? ` · mín. ${money(d.min_payment)}` : ''}
                      </div>
                    </div>
                  </span>
                  <div className="row" style={{ gap: 3 }}>
                    <button className="icon-btn" onClick={() => move(i, -1)} title="Subir"><ArrowUp size={14} /></button>
                    <button className="icon-btn" onClick={() => move(i, 1)} title="Bajar"><ArrowDown size={14} /></button>
                    <button className="icon-btn" onClick={() => togglePriority(d)} title="Prioridad"><Star size={14} fill={d.priority ? '#e7e7ea' : 'none'} /></button>
                    <button className="icon-btn" onClick={() => setForm(d)}><Pencil size={14} /></button>
                    <button className="icon-btn" onClick={() => del(d.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="progress"><span style={{ width: pct + '%', background: '#e7e7ea' }} /></div>
                <div className="row between" style={{ marginTop: 10 }}>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>{pct.toFixed(0)}% pagado</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPayFor(d)}><CheckCircle2 size={15} /> Registrar pago</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {form && <DebtForm debt={form} household={household} onClose={() => setForm(null)} onSaved={load} />}
      {payFor && <PaymentForm debt={payFor} household={household} user={user} onClose={() => setPayFor(null)} onSaved={load} />}
    </div>
  )
}

function DebtForm({ debt, household, onClose, onSaved }) {
  const isNew = !debt.id
  const [name, setName] = useState(debt.name || '')
  const [total, setTotal] = useState(debt.total_amount ? String(debt.total_amount) : '')
  const [balance, setBalance] = useState(debt.current_balance != null && debt.id ? String(debt.current_balance) : (debt.total_amount ? String(debt.total_amount) : ''))
  const [minPay, setMinPay] = useState(debt.min_payment ? String(debt.min_payment) : '')
  const [busy, setBusy] = useState(false)
  const num = (v) => parseInt(String(v).replace(/[^0-9]/g, ''), 10) || 0

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const payload = {
      household_id: household.id, name: name.trim(),
      total_amount: num(total), current_balance: isNew ? (num(balance) || num(total)) : num(balance),
      interest_rate: 0, min_payment: num(minPay),
    }
    if (isNew) await supabase.from('debts').insert(payload)
    else await supabase.from('debts').update(payload).eq('id', debt.id)
    setBusy(false); onSaved(); onClose()
  }

  return (
    <Modal title={isNew ? 'Nueva deuda' : 'Editar deuda'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Nombre</label><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Tarjeta, Préstamo, Familiar" autoFocus /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Monto total (₲)</label><input className="form-input" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0" /></div>
          <div className="field"><label>Saldo pendiente (₲)</label><input className="form-input" inputMode="numeric" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" /></div>
        </div>
        <div className="field"><label>Pago mínimo mensual (₲, opcional)</label><input className="form-input" inputMode="numeric" value={minPay} onChange={(e) => setMinPay(e.target.value)} placeholder="0" /></div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}

function PaymentForm({ debt, household, user, onClose, onSaved }) {
  const [amount, setAmount] = useState(debt.min_payment ? String(debt.min_payment) : '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    const amt = parseInt(String(amount).replace(/[^0-9]/g, ''), 10) || 0
    if (amt <= 0) return
    setBusy(true)
    await supabase.from('debt_payments').insert({ debt_id: debt.id, household_id: household.id, amount: amt, paid_on: date, created_by: user.id })
    const newBal = Math.max(0, Number(debt.current_balance) - amt)
    await supabase.from('debts').update({ current_balance: newBal, paid_off: newBal <= 0 }).eq('id', debt.id)
    setBusy(false); onSaved(); onClose()
  }

  return (
    <Modal title={`Pago — ${debt.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <p className="text-2" style={{ fontSize: 13, marginBottom: 12 }}>Saldo actual: <b>{money(debt.current_balance)}</b></p>
        <div className="field"><label>Monto del pago (₲)</label><input className="form-input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus style={{ fontSize: 20, fontWeight: 700 }} /></div>
        <div className="field"><label>Fecha</label><input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Registrar pago'}</button>
      </form>
    </Modal>
  )
}
