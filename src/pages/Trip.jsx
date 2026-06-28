import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Plane, Camera, Link as LinkIcon, Check, Sparkles, Settings2 } from 'lucide-react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import Modal from '../components/Modal'

const usd = (v) => '$' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

export default function Trip() {
  const { household } = useAuth()
  const [trip, setTrip] = useState(null)
  const [items, setItems] = useState([])
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [cfg, setCfg] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [ai, setAi] = useState(''); const [aiBusy, setAiBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    let { data: trips } = await supabase.from('trips').select('*').limit(1)
    let t = trips?.[0]
    if (!t) {
      const { data } = await supabase.from('trips').insert({
        household_id: household.id, name: 'Costa Rica · Diciembre', days: 30, fx_rate: 6650,
        start_date: '2026-12-01', end_date: '2026-12-31',
      }).select().single()
      t = data
    }
    setTrip(t)
    const [{ data: its }, { data: accs }, { data: bals }] = await Promise.all([
      supabase.from('trip_items').select('*').eq('trip_id', t.id).order('created_at'),
      supabase.from('accounts').select('id,name').eq('archived', false).order('name'),
      supabase.from('account_balances').select('*'),
    ])
    setItems(its || []); setAccounts(accs || []); setBalances(bals || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household])

  if (loading || !trip) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  const fx = Number(trip.fx_rate) || 6650
  const itemsTotal = items.reduce((s, i) => s + Number(i.cost_usd || 0), 0)
  const dailyTotal = Number(trip.daily_budget_usd || 0) * Number(trip.days || 0)
  const budget = dailyTotal + Number(trip.other_costs_usd || 0) + itemsTotal
  // Si hay cuenta de ahorro vinculada, el ahorro = saldo de esa cuenta convertido a USD
  const savedAcc = trip.saved_account_id ? accounts.find((a) => a.id === trip.saved_account_id) : null
  const savedAccBal = savedAcc ? (balances.find((b) => b.account_id === savedAcc.id)?.balance || 0) : null
  const saved = savedAcc ? (savedAccBal / fx) : Number(trip.current_saved_usd || 0)
  const remaining = Math.max(0, budget - saved)

  // meses hasta el viaje
  const target = trip.start_date ? new Date(trip.start_date) : new Date(new Date().getFullYear(), 11, 1)
  const now = new Date()
  const monthsLeft = Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()))
  const perMonth = remaining / monthsLeft

  const both = (v) => `${usd(v)}  ·  ${money(v * fx)}`

  const aiAdvice = async () => {
    setAiBusy(true); setAi('')
    try {
      const { data: sess } = await supabase.auth.getSession()
      const summary = {
        objetivo: 'Consejos para presupuestar y ahorrar para un viaje',
        viaje: trip.name, dias: trip.days, moneda: 'USD (mostrar también equivalente en guaraníes)',
        presupuesto_total_usd: budget, gasto_diario_usd: trip.daily_budget_usd, otros_costos_usd: trip.other_costs_usd,
        compras_usd: itemsTotal, ya_ahorrado_usd: saved, falta_usd: remaining, meses_para_ahorrar: monthsLeft,
        tipo_cambio_gs_por_usd: fx,
      }
      const r = await fetch(`${FUNCTIONS_URL}/ai-insights`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session.access_token}` },
        body: JSON.stringify({ summary }),
      })
      const j = await r.json(); setAi(j.insights || j.error || 'No se pudo generar.')
    } catch (e) { setAi(String(e.message || e)) } finally { setAiBusy(false) }
  }

  const delItem = async (id) => { await supabase.from('trip_items').delete().eq('id', id); load() }
  const togglePurchased = async (it) => { await supabase.from('trip_items').update({ purchased: !it.purchased }).eq('id', it.id); load() }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(120deg, #1a1a1f, #0c0c0f)' }}>
        <div className="row between wrap">
          <div className="row" style={{ gap: 12 }}>
            <span className="icon-chip" style={{ background: 'rgba(255,255,255,0.08)' }}><Plane size={20} /></span>
            <div>
              <h2 style={{ fontSize: 18 }}>{trip.name}</h2>
              <p className="text-muted" style={{ fontSize: 12.5 }}>{trip.days} días · tipo de cambio ₲{fx.toLocaleString('es-PY')}/US$</p>
            </div>
          </div>
          <button className="icon-btn" onClick={() => setCfg(true)}><Settings2 size={18} /></button>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="stat-label">Presupuesto total del viaje</div>
          <div className="stat-value" style={{ fontSize: 24 }}>{usd(budget)}</div>
          <div className="text-2" style={{ fontSize: 13 }}>{money(budget * fx)}</div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Diario {usd(dailyTotal)} + otros {usd(trip.other_costs_usd)} + compras {usd(itemsTotal)}
          </div>
        </div>
        <div className="card">
          <div className="stat-label">Cuánto ahorrar</div>
          <div className="stat-value" style={{ fontSize: 24 }}>{both(perMonth)}<span className="text-muted" style={{ fontSize: 14, fontWeight: 500 }}> /mes</span></div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Falta {usd(remaining)} en {monthsLeft} {monthsLeft === 1 ? 'mes' : 'meses'} (ya tenés {usd(saved)})
          </div>
          {savedAcc && (
            <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              Ahorro tomado de “{savedAcc.name}”: {money(savedAccBal)} → {usd(saved)}
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}><Plus size={18} /> Agregar cosa por comprar</button>
        <button className="btn btn-secondary" onClick={aiAdvice} disabled={aiBusy}><Sparkles size={16} /> {aiBusy ? 'Pensando…' : 'Consejos IA'}</button>
      </div>

      {ai && <div className="card" style={{ marginBottom: 16, whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 14 }}>{ai}</div>}

      <div className="card card-pad-0">
        <div style={{ padding: '14px 18px' }} className="row between">
          <div className="card-title" style={{ margin: 0 }}>Cosas por comprar ({items.length})</div>
          <span className="text-2" style={{ fontSize: 13 }}>{usd(itemsTotal)} · {money(itemsTotal * fx)}</span>
        </div>
        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>Agregá lo que querés comprar, con foto o link y su precio.</div>
        ) : items.map((it) => (
          <div key={it.id} className="row between" style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', gap: 12, opacity: it.purchased ? 0.55 : 1 }}>
            <div className="row" style={{ gap: 12, minWidth: 0 }}>
              {it.image
                ? <img src={it.image} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                : <span className="icon-chip" style={{ width: 46, height: 46 }}><Camera size={18} /></span>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, textDecoration: it.purchased ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                <div className="text-muted" style={{ fontSize: 12.5 }}>{usd(it.cost_usd)} · {money(Number(it.cost_usd) * fx)}
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

      {cfg && <TripConfig trip={trip} accounts={accounts} onClose={() => setCfg(false)} onSaved={load} />}
      {addOpen && <ItemForm trip={trip} household={household} onClose={() => setAddOpen(false)} onSaved={load} />}
    </div>
  )
}

function TripConfig({ trip, accounts = [], onClose, onSaved }) {
  const [f, setF] = useState({
    name: trip.name || '', days: trip.days || 30, daily: trip.daily_budget_usd || '', other: trip.other_costs_usd || '',
    saved: trip.current_saved_usd || '', fx: trip.fx_rate || 6650, start: trip.start_date || '', end: trip.end_date || '',
    savedAccount: trip.saved_account_id || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const numf = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0
  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    await supabase.from('trips').update({
      name: f.name.trim() || 'Viaje', days: parseInt(f.days, 10) || 0,
      daily_budget_usd: numf(f.daily), other_costs_usd: numf(f.other), current_saved_usd: numf(f.saved),
      fx_rate: numf(f.fx) || 6650, start_date: f.start || null, end_date: f.end || null,
      saved_account_id: f.savedAccount || null,
    }).eq('id', trip.id)
    setBusy(false); onSaved(); onClose()
  }
  return (
    <Modal title="Ajustes del viaje" onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Nombre</label><input className="form-input" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Desde</label><input className="form-input" type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input className="form-input" type="date" value={f.end} onChange={(e) => set('end', e.target.value)} /></div>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Días</label><input className="form-input" inputMode="numeric" value={f.days} onChange={(e) => set('days', e.target.value)} /></div>
          <div className="field"><label>Gasto diario (US$)</label><input className="form-input" inputMode="decimal" value={f.daily} onChange={(e) => set('daily', e.target.value)} placeholder="0" /></div>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Otros costos US$ (pasajes, hotel)</label><input className="form-input" inputMode="decimal" value={f.other} onChange={(e) => set('other', e.target.value)} placeholder="0" /></div>
          <div className="field"><label>Ya ahorrado (US$)</label><input className="form-input" inputMode="decimal" value={f.saved} onChange={(e) => set('saved', e.target.value)} placeholder="0" /></div>
        </div>
        <div className="field">
          <label>Cuenta de ahorro del viaje</label>
          <select className="form-select" value={f.savedAccount} onChange={(e) => set('savedAccount', e.target.value)}>
            <option value="">Manual (uso "Ya ahorrado")</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="text-muted" style={{ fontSize: 11.5, marginTop: 5 }}>
            {f.savedAccount ? 'El ahorro del viaje se toma automáticamente del saldo de esta cuenta (convertido a US$).' : 'Si elegís una cuenta, su saldo cuenta como lo ahorrado para el viaje.'}
          </div>
        </div>
        <div className="field"><label>Tipo de cambio (₲ por US$)</label><input className="form-input" inputMode="numeric" value={f.fx} onChange={(e) => set('fx', e.target.value)} placeholder="6650" /></div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}

function ItemForm({ trip, household, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [link, setLink] = useState('')
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const img = new Image()
    const reader = new FileReader()
    reader.onload = () => { img.src = reader.result }
    img.onload = () => {
      const max = 800
      const scale = Math.min(1, max / Math.max(img.width, img.height))
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
    await supabase.from('trip_items').insert({
      trip_id: trip.id, household_id: household.id, name: name.trim(),
      cost_usd: parseFloat(String(cost).replace(/[^0-9.]/g, '')) || 0, link: link || null, image: image || null,
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
        <div className="field"><label>Qué es</label><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Zapatillas Nike" autoFocus /></div>
        <div className="field"><label>Costo (US$)</label><input className="form-input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" /></div>
        <div className="field"><label>Link del producto (opcional)</label><input className="form-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Agregar'}</button>
      </form>
    </Modal>
  )
}
