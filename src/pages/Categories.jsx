import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

const ICONS = ['tag', 'utensils', 'shopping-cart', 'car', 'fuel', 'home', 'plug', 'heart-pulse', 'graduation-cap', 'clapperboard', 'shirt', 'coffee', 'repeat', 'plane', 'paw-print', 'briefcase', 'line-chart', 'gift', 'banknote', 'receipt']
const COLORS = ['#d4202a', '#ef3e48', '#0b3b8f', '#2f6fed', '#f0a500', '#22b8a6', '#7c5cff', '#e06bd0', '#9aa0a6']

export default function Categories() {
  const { household } = useAuth()
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('expense')
  const [form, setForm] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').order('name')
    setCats(data || []); setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household])

  const del = async (c) => {
    if (!confirm(`¿Eliminar la categoría "${c.name}"? Los movimientos quedarán sin categoría.`)) return
    await supabase.from('categories').delete().eq('id', c.id); load()
  }

  const list = cats.filter((c) => c.kind === tab)

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 16 }}>
        <div className="segmented" style={{ maxWidth: 300 }}>
          <button className={tab === 'expense' ? 'active-red' : ''} onClick={() => setTab('expense')}>Gastos</button>
          <button className={tab === 'income' ? 'active-blue' : ''} onClick={() => setTab('income')}>Ingresos</button>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ kind: tab })}><Plus size={18} /> Nueva</button>
      </div>

      {loading ? <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div> : (
        <div className="grid grid-3">
          {list.map((c) => (
            <div className="card row between" key={c.id} style={{ padding: 14 }}>
              <span className="row" style={{ gap: 11 }}>
                <span className="icon-chip" style={{ background: (c.color || '#888') + '22', color: c.color }}><Icon name={c.icon} size={18} /></span>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
              </span>
              <div className="row" style={{ gap: 4 }}>
                <button className="icon-btn" onClick={() => setForm(c)}><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => del(c)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && <CatForm cat={form} household={household} onClose={() => setForm(null)} onSaved={load} />}
    </div>
  )
}

function CatForm({ cat, household, onClose, onSaved }) {
  const isNew = !cat.id
  const [name, setName] = useState(cat.name || '')
  const [kind, setKind] = useState(cat.kind || 'expense')
  const [icon, setIcon] = useState(cat.icon || 'tag')
  const [color, setColor] = useState(cat.color || '#d4202a')
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const payload = { household_id: household.id, name: name.trim(), kind, icon, color }
    if (isNew) await supabase.from('categories').insert(payload)
    else await supabase.from('categories').update(payload).eq('id', cat.id)
    setBusy(false); onSaved(); onClose()
  }

  return (
    <Modal title={isNew ? 'Nueva categoría' : 'Editar categoría'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field">
          <label>Nombre</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Tipo</label>
          <div className="segmented">
            <button type="button" className={kind === 'expense' ? 'active-red' : ''} onClick={() => setKind('expense')}>Gasto</button>
            <button type="button" className={kind === 'income' ? 'active-blue' : ''} onClick={() => setKind('income')}>Ingreso</button>
          </div>
        </div>
        <div className="field">
          <label>Color</label>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            {COLORS.map((c) => <button type="button" key={c} onClick={() => setColor(c)} style={{ width: 30, height: 30, borderRadius: 8, background: c, border: color === c ? '2px solid #fff' : '2px solid transparent' }} />)}
            <label title="Elegir cualquier color" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', border: !COLORS.includes(color) ? '2px solid #fff' : '2px solid transparent', background: 'conic-gradient(#ff0000,#ff9900,#ffee00,#33dd00,#00ddcc,#0066ff,#cc00ff,#ff0066,#ff0000)' }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: color, boxShadow: '0 0 0 2px rgba(0,0,0,.35)' }} />
              </span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'auto' }} />
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Más colores</span>
            </label>
          </div>
        </div>
        <div className="field">
          <label>Ícono</label>
          <div className="row wrap" style={{ gap: 8 }}>
            {ICONS.map((ic) => (
              <button type="button" key={ic} onClick={() => setIcon(ic)}
                className="icon-chip" style={{ background: icon === ic ? color + '33' : 'var(--bg-elevated)', color: icon === ic ? color : 'var(--text-2)', border: icon === ic ? `1px solid ${color}` : '1px solid transparent' }}>
                <Icon name={ic} size={18} />
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}
