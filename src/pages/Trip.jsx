import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Camera, Link as LinkIcon, Check, Sparkles, Settings2, Target, ArrowLeft, Plane } from 'lucide-react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, amountsHidden } from '../lib/format'
import Modal from '../components/Modal'

const usd = (v) => amountsHidden() ? '$ •••' : '$' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

// Estimado de referencia para un viaje a Costa Rica sin alojamiento
const EST = [
  { label: 'Comida (mezcla casa / sodas / restaurante)', perDay: 12 },
  { label: 'Transporte local (bus, Uber/taxi)', perDay: 6 },
  { label: 'Salidas, tours y entradas a parques', perDay: 7 },
  { label: 'SIM / datos prepago (1 mes)', oneTime: 20 },
  { label: 'Regalos / souvenirs', oneTime: 100 },
  { label: 'Seguro de viaje (opcional)', oneTime: 50 },
]

export default function Projects() {
  const { household } = useAuth()
  const [projects, setProjects] = useState([])
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState([])
  const [sel, setSel] = useState(null)      // id del proyecto abierto
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    const [p, a, b] = await Promise.all([
      supabase.from('trips').select('*').eq('archived', false).order('created_at'),
      supabase.from('accounts').select('id,name').eq('archived', false).order('name'),
      supabase.from('account_balances').select('*'),
    ])
    setProjects(p.data || []); setAccounts(a.data || []); setBalances(b.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household])

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  const balOf = (id) => balances.find((x) => x.account_id === id)?.balance || 0
  const current = projects.find((p) => p.id === sel)

  if (current) {
    return <ProjectDetail project={current} accounts={accounts} balOf={balOf} onBack={() => { setSel(null); load() }} onChanged={load} />
  }

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 16, gap: 10 }}>
        <p className="text-2">Presupuestos de ahorro para lo que necesites: un viaje, un curso, una compra grande…</p>
        <button className="btn btn-primary" onClick={() => setNewOpen(true)}><Plus size={18} /> Nuevo proyecto</button>
      </div>

      {projects.length === 0 ? (
        <div className="card empty-state"><Target size={40} /><p>Creá tu primer proyecto y vinculale una cuenta de ahorro.</p></div>
      ) : (
        <div className="grid grid-2">
          {projects.map((p) => {
            const isUsd = p.currency === 'USD'
            const fx = Number(p.fx_rate) || 6650
            const fmt = (v) => isUsd ? usd(v) : money(v)
            const saved = p.saved_account_id ? (isUsd ? balOf(p.saved_account_id) / fx : balOf(p.saved_account_id)) : Number(p.current_saved_usd || 0)
            const goal = Number(p.daily_budget_usd || 0) * Number(p.days || 0) + Number(p.other_costs_usd || 0)
            const pct = goal > 0 ? Math.min(100, (saved / goal) * 100) : 0
            const acc = accounts.find((a) => a.id === p.saved_account_id)
            return (
              <button key={p.id} className="card" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }} onClick={() => setSel(p.id)}>
                <div className="row between" style={{ marginBottom: 10 }}>
                  <span className="row" style={{ gap: 10 }}>
                    <span className="icon-chip">{/costa rica|viaje/i.test(p.name) ? <Plane size={18} /> : <Target size={18} />}</span>
                    <div>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{acc ? `Ahorro: ${acc.name}` : 'Sin cuenta vinculada'}{p.end_date ? ` · para ${new Date(p.end_date).toLocaleDateString('es', { month: 'short', year: 'numeric' })}` : ''}</div>
                    </div>
                  </span>
                  <span className="badge">{p.currency}</span>
                </div>
                <div className="stat-value" style={{ fontSize: 22 }}>{fmt(saved)} <span className="text-muted" style={{ fontSize: 14, fontWeight: 500 }}>de {fmt(goal)}</span></div>
                <div className="progress" style={{ marginTop: 10 }}><span style={{ width: pct + '%', background: '#e7e7ea' }} /></div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>{pct.toFixed(0)}% ahorrado</div>
              </button>
            )
          })}
        </div>
      )}

      {newOpen && <NewProject household={household} accounts={accounts} onClose={() => setNewOpen(false)} onSaved={(id) => { load(); setSel(id) }} />}
    </div>
  )
}

/* ---------------- Nuevo proyecto ---------------- */
function NewProject({ household, accounts, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('PYG')
  const [goal, setGoal] = useState('')
  const [endDate, setEndDate] = useState('')
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const numf = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const { data } = await supabase.from('trips').insert({
      household_id: household.id, name: name.trim(), currency,
      other_costs_usd: numf(goal), days: 0, daily_budget_usd: 0,
      end_date: endDate || null, saved_account_id: account || null,
      fx_rate: 6650, current_saved_usd: 0,
    }).select().single()
    setBusy(false); onSaved(data?.id); onClose()
  }

  return (
    <Modal title="Nuevo proyecto" onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Nombre</label><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Viaje, Auto, Curso, Mudanza" autoFocus /></div>
        <div className="field">
          <label>Moneda</label>
          <div className="segmented">
            <button type="button" className={currency === 'PYG' ? 'active-blue' : ''} onClick={() => setCurrency('PYG')}>Guaraníes ₲</button>
            <button type="button" className={currency === 'USD' ? 'active-blue' : ''} onClick={() => setCurrency('USD')}>Dólares US$</button>
          </div>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Meta a juntar</label><input className="form-input" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="0" /></div>
          <div className="field"><label>Fecha objetivo</label><input className="form-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        </div>
        <div className="field">
          <label>Cuenta de ahorro vinculada</label>
          <select className="form-select" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Sin vincular</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="text-muted" style={{ fontSize: 11.5, marginTop: 5 }}>El saldo de esa cuenta cuenta como lo ahorrado para este proyecto.</div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creando…' : 'Crear proyecto'}</button>
      </form>
    </Modal>
  )
}

/* ---------------- Detalle del proyecto ---------------- */
function ProjectDetail({ project: p, accounts, balOf, onBack, onChanged }) {
  const { household } = useAuth()
  const [items, setItems] = useState([])
  const [cfg, setCfg] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [ai, setAi] = useState(''); const [aiBusy, setAiBusy] = useState(false)

  const isUsd = p.currency === 'USD'
  const fx = Number(p.fx_rate) || 6650
  const fmt = (v) => isUsd ? usd(v) : money(v)
  const alt = (v) => isUsd ? money(v * fx) : usd(v / fx)

  const load = async () => {
    const { data } = await supabase.from('trip_items').select('*').eq('trip_id', p.id).order('created_at')
    setItems(data || [])
  }
  useEffect(() => { load() }, [p.id])

  const itemsTotal = items.reduce((s, i) => s + Number(i.cost_usd || 0), 0)
  const dailyTotal = Number(p.daily_budget_usd || 0) * Number(p.days || 0)
  const budget = dailyTotal + Number(p.other_costs_usd || 0) + itemsTotal
  const savedAcc = p.saved_account_id ? accounts.find((a) => a.id === p.saved_account_id) : null
  const savedAccBal = savedAcc ? balOf(savedAcc.id) : null
  const saved = savedAcc ? (isUsd ? savedAccBal / fx : savedAccBal) : Number(p.current_saved_usd || 0)
  const remaining = Math.max(0, budget - saved)
  const target = p.end_date ? new Date(p.end_date) : null
  const now = new Date()
  const monthsLeft = target ? Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())) : 1
  const perMonth = remaining / monthsLeft
  const isTrip = Number(p.days || 0) > 0 || /viaje|costa rica/i.test(p.name)

  const estRows = EST.map((e) => ({ label: e.label, detail: e.perDay ? `$${e.perDay}/día` : 'único', amount: e.perDay ? e.perDay * Number(p.days || 0) : e.oneTime }))
  const estSub = estRows.reduce((s, r) => s + r.amount, 0)
  const estExtra = Math.round(estSub * 0.1)
  const estTotal = estSub + estExtra

  const aiAdvice = async () => {
    setAiBusy(true); setAi('')
    try {
      const { data: sess } = await supabase.auth.getSession()
      const summary = { objetivo: 'Consejos para ahorrar y presupuestar un proyecto personal', proyecto: p.name, moneda: p.currency, meta: budget, ya_ahorrado: saved, falta: remaining, meses_para_ahorrar: monthsLeft, compras: items.map((i) => ({ nombre: i.name, costo: Number(i.cost_usd) })) }
      const r = await fetch(`${FUNCTIONS_URL}/ai-insights`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session.access_token}` }, body: JSON.stringify({ summary }) })
      const j = await r.json(); setAi(j.insights || j.error || 'No se pudo generar.')
    } catch (e) { setAi(String(e.message || e)) } finally { setAiBusy(false) }
  }

  const delItem = async (id) => { await supabase.from('trip_items').delete().eq('id', id); load() }
  const togglePurchased = async (it) => { await supabase.from('trip_items').update({ purchased: !it.purchased }).eq('id', it.id); load() }
  const delProject = async () => {
    if (!confirm(`¿Eliminar el proyecto "${p.name}"?`)) return
    await supabase.from('trips').update({ archived: true }).eq('id', p.id)
    onBack()
  }

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 14, gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={16} /> Proyectos</button>
        <div className="row" style={{ gap: 6 }}>
          <button className="icon-btn" onClick={() => setCfg(true)}><Settings2 size={18} /></button>
          <button className="icon-btn" onClick={delProject}><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(120deg, #1a1a1f, #0c0c0f)' }}>
        <div className="row between wrap">
          <div>
            <h2 style={{ fontSize: 18 }}>{p.name}</h2>
            <p className="text-muted" style={{ fontSize: 12.5 }}>
              {p.end_date ? `Para ${new Date(p.end_date).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Sin fecha objetivo'}
              {isUsd ? ` · ₲${fx.toLocaleString('es-PY')}/US$` : ''}
            </p>
          </div>
          <span className="badge">{p.currency}</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="stat-label">Ahorrado</div>
          {savedAcc && <span className="badge">Cuenta: {savedAcc.name}</span>}
        </div>
        <div className="stat-value" style={{ fontSize: 30 }}>{fmt(saved)}</div>
        <div className="text-2" style={{ fontSize: 14 }}>{alt(saved)}</div>
        {budget > 0 && (
          <>
            <div className="progress" style={{ marginTop: 12 }}><span style={{ width: Math.min(100, (saved / budget) * 100) + '%', background: '#e7e7ea' }} /></div>
            <div className="row between" style={{ marginTop: 7, fontSize: 12.5 }}>
              <span className="text-2">{((saved / budget) * 100).toFixed(0)}% de la meta</span>
              <span className="text-muted">Meta: {fmt(budget)}</span>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="stat-label">Meta total</div>
          <div className="stat-value" style={{ fontSize: 24 }}>{fmt(budget)}</div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            {dailyTotal > 0 ? `diario ${fmt(dailyTotal)} + ` : ''}base {fmt(p.other_costs_usd)} + compras {fmt(itemsTotal)}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Cuánto ahorrar</div>
          <div className="stat-value" style={{ fontSize: 24 }}>{fmt(perMonth)}<span className="text-muted" style={{ fontSize: 14, fontWeight: 500 }}> /mes</span></div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Falta {fmt(remaining)} en {monthsLeft} {monthsLeft === 1 ? 'mes' : 'meses'}</div>
        </div>
      </div>

      {isTrip && Number(p.days || 0) > 0 && (
        <div className="card card-pad-0" style={{ marginBottom: 16 }}>
          <div style={{ padding: '14px 18px' }} className="row between">
            <div className="card-title" style={{ margin: 0 }}>Estimado sugerido · {p.days} días (sin hotel)</div>
            <span className="text-2" style={{ fontSize: 13 }}>{usd(estTotal)}</span>
          </div>
          <table className="data-table">
            <tbody>
              {estRows.map((r, i) => (
                <tr key={i}>
                  <td><div style={{ fontWeight: 600 }}>{r.label}</div><div className="text-muted" style={{ fontSize: 11.5 }}>{r.detail}</div></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{usd(r.amount)}</td>
                </tr>
              ))}
              <tr><td className="text-2">Imprevistos (10%)</td><td style={{ textAlign: 'right' }} className="text-2">{usd(estExtra)}</td></tr>
              <tr><td style={{ fontWeight: 700 }}>Total estimado</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{usd(estTotal)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={18} /> Agregar cosa por comprar</button>
        <button className="btn btn-secondary" onClick={aiAdvice} disabled={aiBusy}><Sparkles size={16} /> {aiBusy ? 'Pensando…' : 'Consejos IA'}</button>
      </div>

      {ai && <div className="card" style={{ marginBottom: 16, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 14 }}>{ai}</div>}

      <div className="card card-pad-0">
        <div style={{ padding: '14px 18px' }} className="row between">
          <div className="card-title" style={{ margin: 0 }}>Cosas por comprar ({items.length})</div>
          <span className="text-2" style={{ fontSize: 13 }}>{fmt(itemsTotal)}</span>
        </div>
        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>Agregá lo que querés comprar, con foto o link y su precio.</div>
        ) : items.map((it) => (
          <div key={it.id} className="row between" style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', gap: 12, opacity: it.purchased ? 0.55 : 1 }}>
            <div className="row" style={{ gap: 12, minWidth: 0 }}>
              {it.image ? <img src={it.image} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                : <span className="icon-chip" style={{ width: 46, height: 46 }}><Camera size={18} /></span>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, textDecoration: it.purchased ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                <div className="text-muted" style={{ fontSize: 12.5 }}>{fmt(it.cost_usd)}
                  {it.link && <> · <a href={it.link} target="_blank" rel="noreferrer" style={{ color: 'var(--text-2)', textDecoration: 'underline' }}><LinkIcon size={11} style={{ verticalAlign: -1 }} /> link</a></>}
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button className="icon-btn" onClick={() => togglePurchased(it)} title="Comprado"><Check size={15} /></button>
              <button className="icon-btn" onClick={() => delItem(it.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {cfg && <ProjectConfig project={p} accounts={accounts} onClose={() => setCfg(false)} onSaved={() => { setCfg(false); onChanged() }} />}
      {addOpen && <ItemForm project={p} household={household} onClose={() => setAddOpen(false)} onSaved={load} />}
    </div>
  )
}

/* ---------------- Config ---------------- */
function ProjectConfig({ project: p, accounts, onClose, onSaved }) {
  const [f, setF] = useState({
    name: p.name || '', currency: p.currency || 'PYG', days: p.days || 0,
    daily: p.daily_budget_usd || '', other: p.other_costs_usd || '', saved: p.current_saved_usd || '',
    fx: p.fx_rate || 6650, start: p.start_date || '', end: p.end_date || '', savedAccount: p.saved_account_id || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const numf = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0
  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    await supabase.from('trips').update({
      name: f.name.trim() || 'Proyecto', currency: f.currency, days: parseInt(f.days, 10) || 0,
      daily_budget_usd: numf(f.daily), other_costs_usd: numf(f.other), current_saved_usd: numf(f.saved),
      fx_rate: numf(f.fx) || 6650, start_date: f.start || null, end_date: f.end || null,
      saved_account_id: f.savedAccount || null,
    }).eq('id', p.id)
    setBusy(false); onSaved()
  }
  return (
    <Modal title="Ajustes del proyecto" onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Nombre</label><input className="form-input" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field">
          <label>Moneda</label>
          <div className="segmented">
            <button type="button" className={f.currency === 'PYG' ? 'active-blue' : ''} onClick={() => set('currency', 'PYG')}>Guaraníes ₲</button>
            <button type="button" className={f.currency === 'USD' ? 'active-blue' : ''} onClick={() => set('currency', 'USD')}>Dólares US$</button>
          </div>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Desde</label><input className="form-input" type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></div>
          <div className="field"><label>Fecha objetivo</label><input className="form-input" type="date" value={f.end} onChange={(e) => set('end', e.target.value)} /></div>
        </div>
        <div className="field"><label>Meta / costo base</label><input className="form-input" inputMode="decimal" value={f.other} onChange={(e) => set('other', e.target.value)} placeholder="0" /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Días (si es viaje)</label><input className="form-input" inputMode="numeric" value={f.days} onChange={(e) => set('days', e.target.value)} placeholder="0" /></div>
          <div className="field"><label>Gasto por día</label><input className="form-input" inputMode="decimal" value={f.daily} onChange={(e) => set('daily', e.target.value)} placeholder="0" /></div>
        </div>
        <div className="field">
          <label>Cuenta de ahorro vinculada</label>
          <select className="form-select" value={f.savedAccount} onChange={(e) => set('savedAccount', e.target.value)}>
            <option value="">Manual (uso "Ya ahorrado")</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {!f.savedAccount && <div className="field"><label>Ya ahorrado</label><input className="form-input" inputMode="decimal" value={f.saved} onChange={(e) => set('saved', e.target.value)} placeholder="0" /></div>}
        {f.currency === 'USD' && <div className="field"><label>Tipo de cambio (₲ por US$)</label><input className="form-input" inputMode="numeric" value={f.fx} onChange={(e) => set('fx', e.target.value)} placeholder="6650" /></div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}

/* ---------------- Ítem ---------------- */
function ItemForm({ project: p, household, onClose, onSaved }) {
  const isUsd = p.currency === 'USD'
  const fx = Number(p.fx_rate) || 6650
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [curr, setCurr] = useState(isUsd ? 'usd' : 'pyg')
  const [link, setLink] = useState('')
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const pickPhoto = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const img = new Image(); const reader = new FileReader()
    reader.onload = () => { img.src = reader.result }
    img.onload = () => {
      const max = 800, scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      setImage(c.toDataURL('image/jpeg', 0.7))
    }
    reader.readAsDataURL(file)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const raw = parseFloat(String(cost).replace(/[^0-9.]/g, '')) || 0
    // guardamos en la moneda del proyecto
    let value = raw
    if (isUsd && curr === 'pyg') value = raw / fx
    if (!isUsd && curr === 'usd') value = raw * fx
    await supabase.from('trip_items').insert({
      trip_id: p.id, household_id: household.id, name: name.trim(),
      cost_usd: value, link: link || null, image: image || null,
    })
    setBusy(false); onSaved(); onClose()
  }

  return (
    <Modal title="Cosa por comprar" onClose={onClose}>
      <form onSubmit={save}>
        <div className="row" style={{ gap: 14, marginBottom: 14, alignItems: 'center' }}>
          <button type="button" onClick={() => fileRef.current?.click()} style={{ width: 72, height: 72, borderRadius: 12, border: '1px dashed var(--border-2)', background: image ? `center/cover url(${image})` : 'var(--bg-base)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
            {!image && <Camera size={22} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickPhoto} style={{ display: 'none' }} />
          <div className="text-muted" style={{ fontSize: 12.5 }}>Tocá para sacar una foto o elegir del rollo (opcional).</div>
        </div>
        <div className="field"><label>Qué es</label><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Zapatillas" autoFocus /></div>
        <div className="field">
          <label>Costo</label>
          <div className="segmented" style={{ marginBottom: 8 }}>
            <button type="button" className={curr === 'pyg' ? 'active-blue' : ''} onClick={() => setCurr('pyg')}>Guaraníes ₲</button>
            <button type="button" className={curr === 'usd' ? 'active-blue' : ''} onClick={() => setCurr('usd')}>US$</button>
          </div>
          <input className="form-input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
        </div>
        <div className="field"><label>Link del producto (opcional)</label><input className="form-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Agregar'}</button>
      </form>
    </Modal>
  )
}
