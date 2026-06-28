import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, Target } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, fmtDate } from '../lib/format'
import Modal from '../components/Modal'

export default function Goals() {
  const { household } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('goals').select('*').order('created_at')
    setGoals(data || []); setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household])

  const del = async (id) => { if (confirm('¿Eliminar esta meta?')) { await supabase.from('goals').delete().eq('id', id); load() } }
  const addFunds = async (g) => {
    const v = prompt(`¿Cuánto agregás a "${g.name}"? (₲)`)
    if (!v) return
    const amt = parseInt(v.replace(/[^0-9]/g, ''), 10) || 0
    await supabase.from('goals').update({ current_amount: Number(g.current_amount) + amt }).eq('id', g.id); load()
  }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  return (
    <div>
      <div className="row between" style={{ marginBottom: 16 }}>
        <p className="text-2">Ahorrá para tus objetivos.</p>
        <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={18} /> Nueva meta</button>
      </div>

      {goals.length === 0 ? (
        <div className="card empty-state"><Target size={40} /><p>Creá tu primera meta de ahorro.</p></div>
      ) : (
        <div className="grid grid-2">
          {goals.map((g) => {
            const pct = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0
            const done = g.current_amount >= g.target_amount && g.target_amount > 0
            return (
              <div className="card" key={g.id}>
                <div className="row between" style={{ marginBottom: 12 }}>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="icon-chip" style={{ background: 'rgba(255,255,255,0.06)', color: '#d6d6db' }}><Target size={19} /></span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{g.name}</div>
                      {g.target_date && <div className="text-muted" style={{ fontSize: 12 }}>Meta: {fmtDate(g.target_date)}</div>}
                    </div>
                  </span>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn" onClick={() => setForm(g)}><Pencil size={14} /></button>
                    <button className="icon-btn" onClick={() => del(g.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="stat-value" style={{ fontSize: 22 }}>{money(g.current_amount)} <span className="text-muted" style={{ fontSize: 14, fontWeight: 500 }}>/ {money(g.target_amount)}</span></div>
                <div className="progress" style={{ marginTop: 10 }}><span style={{ width: pct + '%', background: done ? '#e7e7ea' : 'var(--blue)' }} /></div>
                <div className="row between" style={{ marginTop: 10 }}>
                  <span className="badge" style={{ background: done ? 'var(--blue-soft)' : undefined }}>{done ? '¡Completada! 🎉' : `${pct.toFixed(0)}%`}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => addFunds(g)}>+ Agregar ahorro</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {form && <GoalForm goal={form} household={household} onClose={() => setForm(null)} onSaved={load} />}
    </div>
  )
}

function GoalForm({ goal, household, onClose, onSaved }) {
  const isNew = !goal.id
  const [name, setName] = useState(goal.name || '')
  const [target, setTarget] = useState(goal.target_amount ? String(goal.target_amount) : '')
  const [current, setCurrent] = useState(goal.current_amount ? String(goal.current_amount) : '')
  const [date, setDate] = useState(goal.target_date || '')
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const payload = {
      household_id: household.id, name: name.trim(),
      target_amount: parseInt(String(target).replace(/[^0-9]/g, ''), 10) || 0,
      current_amount: parseInt(String(current).replace(/[^0-9]/g, ''), 10) || 0,
      target_date: date || null,
    }
    if (isNew) await supabase.from('goals').insert(payload)
    else await supabase.from('goals').update(payload).eq('id', goal.id)
    setBusy(false); onSaved(); onClose()
  }

  return (
    <Modal title={isNew ? 'Nueva meta' : 'Editar meta'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Nombre</label><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Viaje, Auto, Emergencias" autoFocus /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Monto objetivo (₲)</label><input className="form-input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" /></div>
          <div className="field"><label>Ahorrado (₲)</label><input className="form-input" inputMode="numeric" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="0" /></div>
        </div>
        <div className="field"><label>Fecha objetivo (opcional)</label><input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}
