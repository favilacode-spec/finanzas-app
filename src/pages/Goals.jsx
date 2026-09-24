import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Target, Camera, Archive, ArchiveRestore, PiggyBank, Minus, Link2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import { todayLocal, daysBetween, shortDate, parseLocal } from '../lib/dates'
import { compressImage } from '../lib/image'
import { useOnChange, notifyChange } from '../lib/events'
import Modal from '../components/Modal'
import Tile, { hexA } from '../components/Tile'
import Ring from '../components/Ring'
import MoneyInput from '../components/MoneyInput'
import IconPicker from '../components/IconPicker'
import Icon, { GOAL_ICONS } from '../components/Icon'

// Cálculos del "asistente de meta"
export function goalStats(g, current) {
  const target = Number(g.target_amount || 0)
  const cur = Math.max(0, current)
  const left = Math.max(0, target - cur)
  const pct = target > 0 ? Math.min(100, (cur / target) * 100) : 0
  const done = target > 0 && cur >= target
  const out = { target, cur, left, pct, done }
  if (g.target_date && !done) {
    const today = todayLocal()
    const days = daysBetween(today, g.target_date)
    out.daysLeft = days
    if (days > 0) {
      out.perMonth = Math.ceil(left / Math.max(1, days / 30.44))
      out.perWeek = Math.ceil(left / Math.max(1, days / 7))
    }
    const start = String(g.created_at || today).slice(0, 10)
    const total = daysBetween(start, g.target_date)
    if (total > 0) {
      const expected = target * Math.min(1, Math.max(0, daysBetween(start, today) / total))
      out.expected = expected
      out.onTrack = cur >= expected * 0.97
      out.behindBy = Math.max(0, Math.ceil(expected - cur))
    }
  }
  return out
}

export default function Goals() {
  const { household, user } = useAuth()
  const [goals, setGoals] = useState([])
  const [contrib, setContrib] = useState([])
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('activas')
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)

  const load = async () => {
    const [g, c, a, b] = await Promise.all([
      supabase.from('goals').select('*').order('created_at'),
      supabase.from('goal_contributions').select('*').order('contributed_on', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('accounts').select('id,name,type,color,icon').eq('archived', false),
      supabase.from('account_balances').select('*'),
    ])
    setGoals(g.data || []); setContrib(c.data || []); setAccounts(a.data || []); setBalances(b.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnChange(load)

  const currentOf = (g) => g.account_id ? Number(balances.find((b) => b.account_id === g.account_id)?.balance || 0) : Number(g.current_amount || 0)

  const active = goals.filter((g) => !g.archived && !goalStats(g, currentOf(g)).done)
  const finished = goals.filter((g) => g.archived || goalStats(g, currentOf(g)).done)
  const list = tab === 'activas' ? active : finished
  const totalSaved = active.reduce((s, g) => s + Math.max(0, currentOf(g)), 0)
  const totalTarget = active.reduce((s, g) => s + Number(g.target_amount || 0), 0)
  const monthly = active.reduce((s, g) => s + (goalStats(g, currentOf(g)).perMonth || 0), 0)

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  const openGoal = detail && goals.find((g) => g.id === detail)

  return (
    <div className="stack">
      <div className="card card-hero">
        <div className="row between" style={{ alignItems: 'center' }}>
          <div>
            <div className="stat-label">Ahorrado para tus metas</div>
            <div className="amount-big" style={{ fontSize: 28, color: 'var(--accent)' }}>{money(totalSaved)}</div>
            <div className="text-muted" style={{ fontSize: 12.5 }}>de {money(totalTarget)}{monthly ? ` · ahorrá ${money(monthly)}/mes para llegar a todas` : ''}</div>
          </div>
          <Ring pct={totalTarget ? (totalSaved / totalTarget) * 100 : 0} size={74} stroke={8}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>{totalTarget ? Math.round((totalSaved / totalTarget) * 100) : 0}%</span>
          </Ring>
        </div>
      </div>

      <div className="row between wrap" style={{ gap: 10 }}>
        <div className="segmented" style={{ minWidth: 260 }}>
          <button className={tab === 'activas' ? 'active' : ''} onClick={() => setTab('activas')}>Activas ({active.length})</button>
          <button className={tab === 'fin' ? 'active' : ''} onClick={() => setTab('fin')}>Cumplidas ({finished.length})</button>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={17} /> Nueva meta</button>
      </div>

      {list.length === 0 ? (
        <div className="card empty-state"><Target size={40} /><p>{tab === 'activas' ? 'Creá una meta con foto: un viaje, un lente, el fondo de emergencia…' : 'Cuando cumplas una meta aparece acá. 🎉'}</p></div>
      ) : (
        <div className="grid grid-3">
          {list.map((g) => <GoalCard key={g.id} g={g} current={currentOf(g)} accounts={accounts} onOpen={() => setDetail(g.id)} />)}
        </div>
      )}

      {form && <GoalForm goal={form} household={household} accounts={accounts} onClose={() => setForm(null)} onSaved={load} />}
      {openGoal && (
        <GoalDetail g={openGoal} current={currentOf(openGoal)} contribs={contrib.filter((c) => c.goal_id === openGoal.id)} accounts={accounts}
          household={household} user={user} onClose={() => setDetail(null)} onChanged={load}
          onEdit={() => { setForm(openGoal); setDetail(null) }} />
      )}
    </div>
  )
}

function Cover({ g, height = 128, children }) {
  const color = g.color || '#34d399'
  const bg = g.image
    ? { backgroundImage: `url(${g.image})` }
    : { background: `radial-gradient(120% 90% at 20% 10%, ${hexA(color, 0.55)}, ${hexA(color, 0.12)} 60%, #0c0e10)` }
  return (
    <div className="goal-cover" style={{ height, ...bg }}>
      {!g.image && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color, opacity: 0.9 }}><Icon name={g.icon || 'target'} size={Math.round(height / 2.6)} /></div>}
      {children}
    </div>
  )
}

function GoalCard({ g, current, accounts, onOpen }) {
  const st = goalStats(g, current)
  const color = g.color || '#34d399'
  const linked = g.account_id && accounts.find((a) => a.id === g.account_id)
  return (
    <div className="card" style={{ cursor: 'pointer', padding: 14 }} onClick={onOpen}>
      <Cover g={g}>
        <div className="goal-badge">
          {st.done ? <span className="badge badge-green" style={{ background: 'rgba(0,0,0,.55)' }}>¡Cumplida! 🎉</span>
            : st.onTrack === false ? <span className="badge badge-amber" style={{ background: 'rgba(0,0,0,.55)' }}>Atrasada</span>
            : st.onTrack ? <span className="badge badge-green" style={{ background: 'rgba(0,0,0,.55)' }}>Vas bien</span> : null}
        </div>
      </Cover>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 750, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>
            {g.target_date ? `Para el ${shortDate(g.target_date)} ${parseLocal(g.target_date).getFullYear()}` : 'Sin fecha'}{linked ? ` · ${linked.name}` : ''}
          </div>
        </div>
        <span style={{ fontWeight: 800, color }}>{st.pct.toFixed(0)}%</span>
      </div>
      <div className="progress thick" style={{ margin: '10px 0 8px' }}><span style={{ width: st.pct + '%', background: `linear-gradient(90deg, ${hexA(color, 0.7)}, ${color})` }} /></div>
      <div className="row between" style={{ fontSize: 13 }}>
        <span><strong>{money(st.cur)}</strong> <span className="text-muted">de {money(st.target)}</span></span>
      </div>
      {!st.done && st.perMonth > 0 && <div className="text-2" style={{ fontSize: 12.5, marginTop: 6 }}>Ahorrá {money(st.perMonth)}/mes para llegar</div>}
    </div>
  )
}

function GoalDetail({ g, current, contribs, accounts, household, user, onClose, onChanged, onEdit }) {
  const st = goalStats(g, current)
  const color = g.color || '#34d399'
  const [mode, setMode] = useState(null) // 'add' | 'remove'
  const linked = g.account_id && accounts.find((a) => a.id === g.account_id)

  const archive = async () => { await supabase.from('goals').update({ archived: !g.archived }).eq('id', g.id); onChanged(); onClose() }
  const del = async () => { if (!confirm(`¿Eliminar la meta "${g.name}"?`)) return; await supabase.from('goals').delete().eq('id', g.id); onChanged(); onClose() }
  const delContrib = async (c) => {
    if (!confirm('¿Borrar este aporte?')) return
    await supabase.from('goal_contributions').delete().eq('id', c.id)
    if (!g.account_id) await supabase.from('goals').update({ current_amount: Math.max(0, Number(g.current_amount || 0) - Number(c.amount)) }).eq('id', g.id)
    onChanged()
  }

  return (
    <Modal title={g.name} onClose={onClose} wide>
      <Cover g={g} height={170}>
        <div className="goal-badge"><span className="badge" style={{ background: 'rgba(0,0,0,.55)', color: '#fff' }}>{st.done ? '¡Cumplida! 🎉' : g.target_date ? `${st.daysLeft > 0 ? `Faltan ${st.daysLeft} días` : 'Fecha cumplida'}` : 'Sin fecha límite'}</span></div>
      </Cover>

      <div className="row" style={{ gap: 18, alignItems: 'center', margin: '4px 0 16px' }}>
        <Ring pct={st.pct} size={96} stroke={10} color={color}><div><div style={{ fontWeight: 800, fontSize: 18 }}>{st.pct.toFixed(0)}%</div></div></Ring>
        <div style={{ flex: 1 }}>
          <div className="amount-big" style={{ fontSize: 26 }}>{money(st.cur)}</div>
          <div className="text-muted" style={{ fontSize: 13 }}>de {money(st.target)} · faltan {money(st.left)}</div>
          {linked && <div className="badge" style={{ marginTop: 6 }}><Link2 size={12} /> Sigue el saldo de {linked.name}</div>}
        </div>
      </div>

      {!st.done && (
        <div className="card" style={{ background: st.onTrack === false ? 'var(--amber-soft)' : 'var(--accent-soft)', borderColor: 'transparent', padding: 14, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{st.onTrack === false ? '⚠️ Vas un poco atrasado' : st.onTrack ? '✅ Vas bien encaminado' : '💡 Plan de ahorro'}</div>
          <div className="text-2" style={{ fontSize: 13.5 }}>
            {st.perMonth ? <>Para llegar el {shortDate(g.target_date)} ahorrá <strong>{money(st.perMonth)} por mes</strong> (≈ {money(st.perWeek)} por semana).</> : g.target_date ? 'La fecha ya pasó: poné una nueva fecha para recalcular.' : 'Poné una fecha objetivo y te calculo cuánto ahorrar por mes.'}
            {st.onTrack === false && st.behindBy > 0 ? <> Para ir al día te faltan {money(st.behindBy)}.</> : null}
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setMode('add')}><PiggyBank size={17} /> Aportar</button>
        <button className="btn btn-secondary" onClick={() => setMode('remove')}><Minus size={16} /> Retirar</button>
      </div>

      {g.note && <div className="text-2" style={{ fontSize: 13.5, marginBottom: 14, fontStyle: 'italic' }}>“{g.note}”</div>}

      <div className="section-label" style={{ marginTop: 0 }}>Aportes</div>
      {contribs.length === 0 ? <div className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>Todavía no hay aportes registrados.</div> : (
        <div className="list" style={{ marginBottom: 14 }}>
          {contribs.map((c) => (
            <div className="list-row" key={c.id} style={{ minHeight: 48 }}>
              <Tile icon={c.amount < 0 ? 'hand-coins' : 'piggy-bank'} color={c.amount < 0 ? '#ff6b6b' : color} size="sm" />
              <div className="list-main"><div className="list-title" style={{ fontSize: 14 }}>{c.note || (c.amount < 0 ? 'Retiro' : 'Aporte')}</div><div className="list-sub">{shortDate(c.contributed_on)}</div></div>
              <span className={`list-amount ${c.amount < 0 ? 'amount-neg' : 'amount-pos'}`}>{c.amount < 0 ? '−' : '+'}{money(Math.abs(c.amount))}</span>
              <button className="icon-btn plain" onClick={() => delContrib(c)}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onEdit}><Pencil size={14} /> Editar</button>
        <button className="btn btn-secondary btn-sm" onClick={archive}>{g.archived ? <><ArchiveRestore size={14} /> Reactivar</> : <><Archive size={14} /> Archivar</>}</button>
        <button className="btn btn-danger btn-sm" onClick={del}><Trash2 size={14} /></button>
      </div>

      {mode && <ContribModal g={g} mode={mode} accounts={accounts} household={household} user={user} onClose={() => setMode(null)} onDone={() => { setMode(null); onChanged() }} />}
    </Modal>
  )
}

function ContribModal({ g, mode, accounts, household, user, onClose, onDone }) {
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const others = accounts.filter((a) => a.id !== g.account_id)
  const [fromAcc, setFromAcc] = useState(g.account_id ? (others[0]?.id || '') : '')
  const [busy, setBusy] = useState(false)
  const sign = mode === 'remove' ? -1 : 1

  const save = async (e) => {
    e.preventDefault()
    const amt = Math.round(Number(amount) || 0)
    if (!amt) return
    setBusy(true)
    // si la meta sigue una cuenta, movemos la plata de verdad con una transferencia
    if (g.account_id && fromAcc) {
      await supabase.from('transactions').insert({
        household_id: household.id, type: 'transfer', amount: amt, currency: 'PYG', occurred_on: date,
        account_id: sign > 0 ? fromAcc : g.account_id, transfer_account_id: sign > 0 ? g.account_id : fromAcc,
        payee: `${sign > 0 ? 'Aporte' : 'Retiro'} meta: ${g.name}`, note: note || null, created_by: user.id, source: 'manual',
      })
    } else if (!g.account_id) {
      await supabase.from('goals').update({ current_amount: Math.max(0, Number(g.current_amount || 0) + sign * amt) }).eq('id', g.id)
    }
    await supabase.from('goal_contributions').insert({ household_id: household.id, goal_id: g.id, amount: sign * amt, contributed_on: date, note: note || null, created_by: user.id })
    setBusy(false); notifyChange(); onDone()
  }

  return (
    <Modal title={mode === 'remove' ? `Retirar de "${g.name}"` : `Aportar a "${g.name}"`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Monto</label><MoneyInput value={amount} onChange={setAmount} big autoFocus /></div>
        {g.account_id && (
          <div className="field">
            <label>{mode === 'remove' ? 'Devolver a la cuenta' : 'Sacar la plata de'}</label>
            <select className="form-select" value={fromAcc} onChange={(e) => setFromAcc(e.target.value)}>
              <option value="">No mover plata (solo anotar)</option>
              {others.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Fecha</label><input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label>Nota</label><input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" /></div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}

function GoalForm({ goal, household, accounts, onClose, onSaved }) {
  const isNew = !goal.id
  const [name, setName] = useState(goal.name || '')
  const [target, setTarget] = useState(Number(goal.target_amount) || 0)
  const [current, setCurrent] = useState(Number(goal.current_amount) || 0)
  const [date, setDate] = useState(goal.target_date || '')
  const [icon, setIcon] = useState(goal.icon || 'target')
  const [color, setColor] = useState(goal.color || '#34d399')
  const [image, setImage] = useState(goal.image || '')
  const [accountId, setAccountId] = useState(goal.account_id || '')
  const [note, setNote] = useState(goal.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const preview = useMemo(() => ({ ...goal, name, icon, color, image }), [goal, name, icon, color, image])

  const pick = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try { setImage(await compressImage(f, 1000, 0.72)) } catch { setErr('No pude leer la foto') }
    e.target.value = ''
  }

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setErr('Poné un nombre')
    if (!target) return setErr('Poné cuánto querés juntar')
    setBusy(true)
    const payload = {
      household_id: household.id, name: name.trim(), target_amount: Math.round(target), target_date: date || null,
      icon, color, image: image || null, account_id: accountId || null, note: note || null,
    }
    if (!accountId) payload.current_amount = Math.round(current)
    const { error } = isNew ? await supabase.from('goals').insert(payload) : await supabase.from('goals').update(payload).eq('id', goal.id)
    setBusy(false)
    if (error) return setErr(error.message)
    notifyChange(); onSaved(); onClose()
  }

  return (
    <Modal title={isNew ? 'Nueva meta' : 'Editar meta'} onClose={onClose}>
      <form onSubmit={save}>
        <div onClick={() => fileRef.current?.click()} style={{ cursor: 'pointer' }}>
          <Cover g={preview} height={140}>
            <div className="goal-badge"><span className="badge" style={{ background: 'rgba(0,0,0,.6)', color: '#fff' }}><Camera size={13} /> {image ? 'Cambiar foto' : 'Agregar foto'}</span></div>
          </Cover>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
        {image && <button type="button" className="link" style={{ marginBottom: 10 }} onClick={() => setImage('')}>Quitar foto</button>}

        <div className="field"><label>Nombre</label><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Viaje a Costa Rica, Lente 85mm" autoFocus={isNew} /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Quiero juntar</label><MoneyInput value={target} onChange={setTarget} /></div>
          <div className="field"><label>Para cuándo (opcional)</label><input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="field">
          <label>¿Dónde guardás esta plata?</label>
          <select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Llevo la cuenta a mano (aportes)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>Sigue el saldo de: {a.name}</option>)}
          </select>
        </div>
        {!accountId && <div className="field"><label>Ya tengo ahorrado</label><MoneyInput value={current} onChange={setCurrent} /></div>}
        <div className="field"><label>Ícono y color</label><IconPicker icons={GOAL_ICONS} icon={icon} color={color} onIcon={setIcon} onColor={setColor} /></div>
        <div className="field"><label>¿Por qué quiero esto? (opcional)</label><input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: para las fotos de bodas en exteriores" /></div>
        {err && <div className="text-red" style={{ fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}
