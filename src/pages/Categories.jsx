import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

const ICONS = ['tag', 'wifi', 'zap', 'droplet', 'smartphone', 'tv', 'music', 'dumbbell', 'pill', 'camera', 'baby', 'bus', 'wrench', 'scissors', 'book', 'heart', 'utensils', 'shopping-cart', 'car', 'fuel', 'home', 'plug', 'heart-pulse', 'graduation-cap', 'clapperboard', 'shirt', 'coffee', 'repeat', 'plane', 'paw-print', 'briefcase', 'line-chart', 'gift', 'banknote', 'receipt']
const COLORS = ['#34d399', '#5eead4', '#60a5fa', '#a78bfa', '#f472b6', '#fb7185', '#f97316', '#fbbf24', '#a3e635', '#94a3b8']

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
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          <div className="list">
            {list.filter((c) => !c.parent_id || !list.some((p) => p.id === c.parent_id)).map((c) => (
              <div key={c.id}>
                <CatRow c={c} onEdit={() => setForm(c)} onDel={() => del(c)} onSub={() => setForm({ kind: tab, parent_id: c.id, color: c.color, icon: c.icon })} />
                {list.filter((x) => x.parent_id === c.id).map((sub) => <CatRow key={sub.id} c={sub} sub onEdit={() => setForm(sub)} onDel={() => del(sub)} />)}
              </div>
            ))}
          </div>
        </div>
      )}

      {form && <CatForm cat={form} parents={list.filter((c) => !c.parent_id)} household={household} onClose={() => setForm(null)} onSaved={load} />}
    </div>
  )
}

function CatRow({ c, sub, onEdit, onDel, onSub }) {
  return (
    <div className="list-row" style={{ paddingLeft: sub ? 34 : 0 }}>
      <span className={`tile ${sub ? 'tile-sm' : ''}`} style={{ background: (c.color || '#888') + '26', color: c.color }}><Icon name={c.icon} size={sub ? 15 : 18} /></span>
      <div className="list-main"><div className="list-title" style={{ fontSize: sub ? 14 : 15 }}>{c.name}</div>{sub && <div className="list-sub">Subcategoría</div>}</div>
      {onSub && <button className="btn btn-ghost btn-sm" onClick={onSub}><Plus size={13} /> Sub</button>}
      <button className="icon-btn" onClick={onEdit}><Pencil size={14} /></button>
      <button className="icon-btn" onClick={onDel}><Trash2 size={14} /></button>
    </div>
  )
}

function CatForm({ cat, parents = [], household, onClose, onSaved }) {
  const [parentId, setParentId] = useState(cat.parent_id || '')
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
    const payload = { household_id: household.id, name: name.trim(), kind, icon, color, parent_id: parentId && parentId !== cat.id ? parentId : null }
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
          <label>Dentro de (subcategoría, opcional)</label>
          <select className="form-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Ninguna — es una categoría principal</option>
            {parents.filter((p) => p.id !== cat.id && p.kind === kind).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
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
