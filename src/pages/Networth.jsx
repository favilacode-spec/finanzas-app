import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, CreditCard, HandCoins, Home, Wallet, Scale } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, moneyCompact } from '../lib/format'
import Modal from '../components/Modal'
import Tile from '../components/Tile'
import { useOnChange } from '../lib/events'
import StatRow from '../components/StatRow'
import CreditCardArt from '../components/CreditCardArt'
import BankBadge from '../components/BankBadge'

const TIPOS_BIEN = [
  { value: 'inmueble', label: 'Inmueble (casa, terreno)', icon: 'home', color: '#22b8a6' },
  { value: 'vehiculo', label: 'Vehículo', icon: 'car', color: '#2f6fed' },
  { value: 'cripto', label: 'Cripto', icon: 'bitcoin', color: '#f0a500' },
  { value: 'equipo', label: 'Equipo / herramienta', icon: 'package', color: '#7c5cff' },
  { value: 'inversion', label: 'Inversión', icon: 'trending-up', color: '#34d399' },
  { value: 'otro', label: 'Otro', icon: 'box', color: '#9aa0aa' },
]
const tipoBien = (v) => TIPOS_BIEN.find((t) => t.value === v) || TIPOS_BIEN[5]

// Semáforo según cuánto de tus activos está comprometido en deuda
function salud(ratio) {
  if (ratio == null) return { txt: 'Sin datos', color: '#9aa0aa', detalle: 'Cargá tus cuentas y bienes para calcularlo.' }
  if (ratio < 35) return { txt: 'Saludable', color: '#34d399', detalle: 'Tus deudas están por debajo del 35% de tus activos.' }
  if (ratio < 70) return { txt: 'Atención', color: '#f0a500', detalle: 'Tus deudas pasan el 35% de tus activos. Conviene bajarlas.' }
  if (ratio < 100) return { txt: 'Riesgo', color: '#ef3e48', detalle: 'Tus deudas se acercan al valor de todo lo que tenés.' }
  return { txt: 'Crítico', color: '#ef3e48', detalle: 'Debés más de lo que tenés. El patrimonio es negativo.' }
}

export default function Networth() {
  const { household } = useAuth()
  const [pat, setPat] = useState(null)
  const [assets, setAssets] = useState([])
  const [recv, setRecv] = useState([])
  const [cards, setCards] = useState([])
  const [hist, setHist] = useState([])
  const [planes, setPlanes] = useState([])
  const [loading, setLoading] = useState(true)
  const [formBien, setFormBien] = useState(null)
  const [formCobro, setFormCobro] = useState(null)

  const load = async () => {
    const [p, a, r, acc, bal, h, cu] = await Promise.all([
      supabase.from('patrimonio').select('*').maybeSingle(),
      supabase.from('assets').select('*').eq('archived', false).order('sort').order('created_at'),
      supabase.from('receivables').select('*').eq('status', 'open').order('due_date', { nullsFirst: false }),
      supabase.from('accounts').select('*').eq('archived', false).eq('type', 'credit_card'),
      supabase.from('account_balances').select('*'),
      supabase.from('net_worth_snapshots').select('*').order('taken_on').limit(24),
      supabase.from('installment_plans').select('*').eq('closed', false).order('first_date'),
    ])
    setPat(p.data || null)
    setAssets(a.data || [])
    setRecv(r.data || [])
    setHist(h.data || [])
    setPlanes(cu.data || [])
    const balances = bal.data || []
    setCards((acc.data || []).map((c) => ({
      ...c,
      usado: Math.abs(Math.min(0, Number(balances.find((b) => b.account_id === c.id)?.balance || 0))),
    })))
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnChange(load)

  // Guarda la foto de hoy para armar el histórico
  useEffect(() => {
    if (!household || !pat) return
    supabase.from('net_worth_snapshots').upsert({
      household_id: household.id,
      taken_on: new Date().toISOString().slice(0, 10),
      assets_total: pat.activos, debts_total: pat.pasivos, net_worth: pat.patrimonio_neto,
    }, { onConflict: 'household_id,taken_on' }).then(() => {})
  }, [household, pat])

  const delBien = async (id) => {
    if (!confirm('¿Eliminar este bien?')) return
    await supabase.from('assets').delete().eq('id', id); load()
  }
  const cobrado = async (r) => {
    if (!confirm(`¿Marcar como cobrado ${money(r.amount - r.collected)} de ${r.who}?`)) return
    await supabase.from('receivables').update({ status: 'paid', collected: r.amount }).eq('id', r.id); load()
  }
  const delCobro = async (id) => {
    if (!confirm('¿Eliminar esta cuenta por cobrar?')) return
    await supabase.from('receivables').delete().eq('id', id); load()
  }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  const pn = Number(pat?.patrimonio_neto || 0)
  const s = salud(pat?.ratio_deuda != null ? Number(pat.ratio_deuda) : null)
  const totalCobrar = recv.reduce((t, r) => t + (Number(r.amount) - Number(r.collected)), 0)
  // Cuotas pendientes por tarjeta: lo que NO vence este mes
  const cuotasDe = (accId) => {
    const ps = planes.filter((p) => p.account_id === accId && p.paid_months < p.months)
    const mes = ps.reduce((t, p) => t + Math.round(Number(p.total_amount) / (p.months || 1)), 0)
    const futuro = ps.reduce((t, p) => {
      const cuota = Math.round(Number(p.total_amount) / (p.months || 1))
      return t + cuota * Math.max(0, p.months - p.paid_months - 1)
    }, 0)
    return { planes: ps, cuotaMes: mes, futuro, cantidad: ps.length }
  }
  const cupoTotal = cards.reduce((t, c) => t + Number(c.credit_limit || 0), 0)
  const cupoUsado = cards.reduce((t, c) => t + c.usado, 0)

  // Barra de composición: qué parte de tus activos es cada cosa
  const partes = [
    { label: 'Cuentas', v: Number(pat?.activo_cuentas || 0), color: '#34d399' },
    { label: 'Bienes', v: Number(pat?.activo_bienes || 0), color: '#2f6fed' },
    { label: 'Por cobrar', v: Number(pat?.activo_por_cobrar || 0), color: '#f0a500' },
  ].filter((p) => p.v > 0)
  const totalPartes = partes.reduce((t, p) => t + p.v, 0) || 1

  return (
    <div>
      {/* Patrimonio neto */}
      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #16161c, #0b0b0e)' }}>
        <div className="row between wrap" style={{ gap: 12 }}>
          <div>
            <div className="stat-label">Patrimonio neto</div>
            <div className="stat-value" style={{ fontSize: 34, color: pn < 0 ? '#ef3e48' : undefined }}>{money(pn)}</div>
            <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              Todo lo que tenés menos todo lo que debés
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="badge" style={{ background: s.color + '22', color: s.color, borderColor: s.color + '55' }}>
              {pn < 0 ? <TrendingDown size={13} style={{ verticalAlign: -2 }} /> : <TrendingUp size={13} style={{ verticalAlign: -2 }} />} {s.txt}
            </span>
            {pat?.ratio_deuda != null && (
              <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Deuda / activos: <b style={{ color: s.color }}>{Number(pat.ratio_deuda).toLocaleString('es-PY')}%</b>
              </div>
            )}
          </div>
        </div>
        <div className="text-2" style={{ fontSize: 12.5, marginTop: 10 }}>{s.detalle}</div>
      </div>

      <StatRow items={[
        { label: 'Lo que tenés', value: pat?.activos, color: '#34d399', icon: Wallet, valueColor: '#34d399',
          hint: `${partes.length} tipo${partes.length === 1 ? '' : 's'} de activo` },
        { label: 'Lo que debés', value: pat?.pasivos, color: '#ef3e48', icon: Scale, valueColor: '#ef3e48',
          hint: 'Deudas + tarjetas' },
        { label: 'Te deben', value: totalCobrar, color: '#f0a500', icon: HandCoins,
          hint: `${recv.length} pendiente${recv.length === 1 ? '' : 's'}` },
        { label: 'Cupo disponible', value: cupoTotal - cupoUsado, color: '#7c5cff', icon: CreditCard,
          hint: cupoTotal > 0 ? `de ${money(cupoTotal)}` : 'Sin tarjetas' },
      ]} />

      {/* Composición de activos */}
      {partes.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">De qué está hecho lo que tenés</div>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
            {partes.map((p) => (
              <span key={p.label} style={{ width: (p.v / totalPartes * 100) + '%', background: p.color }} />
            ))}
          </div>
          <div className="row wrap" style={{ gap: 14, marginTop: 10 }}>
            {partes.map((p) => (
              <span key={p.label} className="text-2" style={{ fontSize: 12 }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: p.color, marginRight: 6 }} />
                {p.label} <b>{money(p.v)}</b>
                <span className="text-muted"> · {(p.v / totalPartes * 100).toFixed(0)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Evolución */}
      {hist.length > 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Cómo viene tu patrimonio</div>
          <Sparkline datos={hist.map((h) => Number(h.net_worth))} />
          <div className="row between" style={{ marginTop: 8, fontSize: 11.5 }}>
            <span className="text-muted">{hist[0].taken_on}</span>
            <span className="text-muted">{hist[hist.length - 1].taken_on}</span>
          </div>
        </div>
      )}

      {/* Tarjetas de crédito */}
      <div className="section-head">
        <CreditCard size={16} />
        <h2>Mis tarjetas</h2>
        <span className="line" />
        {cupoTotal > 0 && (
          <span className="text-2" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
            Disponible <b style={{ color: '#34d399' }}>{money(cupoTotal - cupoUsado)}</b>
          </span>
        )}
      </div>
      {cards.length === 0 ? (
        <div className="card empty-state" style={{ padding: 28, fontSize: 13, marginBottom: 16 }}>
          Creá una cuenta de tipo <b>Tarjeta de crédito</b> y ponele el límite para verla acá.
        </div>
      ) : (
        <div className="card-grid" style={{ marginBottom: 16 }}>
          {cards.map((c) => (
            <CreditCardArt
              key={c.id}
              name={c.name}
              bankId={c.bank_id}
              network={c.card_network}
              color={c.color}
              limit={c.credit_limit}
              used={c.usado}
              dueDay={c.due_day}
              closeDay={c.statement_day}
              currency={c.currency}
              enCuotas={cuotasDe(c.id).futuro}
              cuotasActivas={cuotasDe(c.id).cantidad}
            />
          ))}
        </div>
      )}

      {/* Compras en cuotas */}
      {planes.length > 0 && (
        <div className="card card-pad-0" style={{ marginBottom: 16 }}>
          <div style={{ padding: '14px 18px' }} className="row between wrap">
            <div className="card-title" style={{ margin: 0 }}>
              <CreditCard size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Compras en cuotas ({planes.length})
            </div>
            <span className="text-2" style={{ fontSize: 13 }}>
              {money(planes.reduce((t, p) => t + Math.round(Number(p.total_amount) / (p.months || 1)), 0))} por mes
            </span>
          </div>
          {planes.map((p) => {
            const cuota = Math.round(Number(p.total_amount) / (p.months || 1))
            const restantes = Math.max(0, p.months - p.paid_months)
            const pct = p.months ? (p.paid_months / p.months) * 100 : 0
            return (
              <div key={p.id} style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                <div className="row between" style={{ gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.merchant}</div>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      {money(cuota)} × {p.months} · pagaste {p.paid_months} de {p.months}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 700 }}>{money(cuota * restantes)}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      {restantes} {restantes === 1 ? 'cuota' : 'cuotas'}
                    </div>
                  </div>
                </div>
                <div className="progress" style={{ marginTop: 8 }}>
                  <span style={{ width: pct + '%', background: '#7c5cff' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Bienes */}
      <div className="card card-pad-0" style={{ marginBottom: 16 }}>
        <div style={{ padding: '14px 18px' }} className="row between wrap">
          <div className="card-title" style={{ margin: 0 }}>
            <Home size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Bienes ({assets.length})
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setFormBien({})}><Plus size={15} /> Agregar bien</button>
        </div>
        {assets.length === 0 ? (
          <div className="empty-state" style={{ padding: 28, fontSize: 13 }}>
            Agregá tu casa, auto, equipos o cripto para que cuenten en tu patrimonio.
          </div>
        ) : assets.map((a) => {
          const t = tipoBien(a.kind)
          return (
            <div key={a.id} className="row between" style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', gap: 10 }}>
              <span className="row" style={{ gap: 10, minWidth: 0 }}>
                <Tile icon={a.color ? (t.icon) : t.icon} color={a.color || t.color} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div className="text-muted" style={{ fontSize: 11.5 }}>
                    {t.label}{a.qty ? ` · ${a.qty}` : ''}{a.currency !== 'PYG' ? ` · ${a.currency}` : ''}
                  </div>
                </div>
              </span>
              <div className="row" style={{ gap: 6 }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {a.currency === 'USD' ? 'US$ ' + Number(a.value).toLocaleString('en-US') : money(a.value)}
                </span>
                <button className="icon-btn" onClick={() => setFormBien(a)}><Pencil size={13} /></button>
                <button className="icon-btn" onClick={() => delBien(a.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cuentas por cobrar */}
      <div className="card card-pad-0">
        <div style={{ padding: '14px 18px' }} className="row between wrap">
          <div className="card-title" style={{ margin: 0 }}>
            <HandCoins size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Te deben ({recv.length})
          </div>
          <span className="row" style={{ gap: 8 }}>
            {totalCobrar > 0 && <span className="text-2" style={{ fontSize: 13 }}>{money(totalCobrar)}</span>}
            <button className="btn btn-secondary btn-sm" onClick={() => setFormCobro({})}><Plus size={15} /> Agregar</button>
          </span>
        </div>
        {recv.length === 0 ? (
          <div className="empty-state" style={{ padding: 28, fontSize: 13 }}>
            Anotá acá lo que te deben tus clientes. Podés mandarles el recordatorio por WhatsApp.
          </div>
        ) : recv.map((r) => {
          const falta = Number(r.amount) - Number(r.collected)
          const vencido = r.due_date && new Date(r.due_date) < new Date(new Date().toDateString())
          const msg = encodeURIComponent(`Hola ${r.who}! Te escribo por ${r.concept || 'el pago pendiente'} de ${money(falta)}. ¡Gracias!`)
          return (
            <div key={r.id} className="row between" style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', gap: 10 }}>
              <span className="row" style={{ gap: 10, minWidth: 0 }}>
                <Tile icon="user" color={vencido ? '#ef3e48' : '#f0a500'} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.who}</div>
                  <div className="text-muted" style={{ fontSize: 11.5 }}>
                    {r.concept || 'Sin concepto'}
                    {r.due_date ? ` · vence ${new Date(r.due_date).toLocaleDateString('es')}` : ''}
                    {vencido ? ' · VENCIDO' : ''}
                  </div>
                </div>
              </span>
              <div className="row" style={{ gap: 6 }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(falta)}</span>
                {r.phone && (
                  <a className="icon-btn" href={`https://wa.me/${String(r.phone).replace(/\D/g, '')}?text=${msg}`} target="_blank" rel="noreferrer" title="Recordar por WhatsApp">💬</a>
                )}
                <button className="icon-btn" onClick={() => cobrado(r)} title="Marcar cobrado">✓</button>
                <button className="icon-btn" onClick={() => setFormCobro(r)}><Pencil size={13} /></button>
                <button className="icon-btn" onClick={() => delCobro(r.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          )
        })}
      </div>

      {formBien && <FormBien bien={formBien} household={household} onClose={() => setFormBien(null)} onSaved={load} />}
      {formCobro && <FormCobro cobro={formCobro} household={household} onClose={() => setFormCobro(null)} onSaved={load} />}
    </div>
  )
}

/* Mini gráfico de línea, sin librerías */
function Sparkline({ datos }) {
  if (!datos || datos.length < 2) return null
  const min = Math.min(...datos), max = Math.max(...datos)
  const rango = (max - min) || 1
  const W = 600, H = 70
  const pts = datos.map((v, i) => {
    const x = (i / (datos.length - 1)) * W
    const y = H - ((v - min) / rango) * (H - 8) - 4
    return `${x},${y}`
  }).join(' ')
  const sube = datos[datos.length - 1] >= datos[0]
  const col = sube ? '#34d399' : '#ef3e48'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 70, marginTop: 10 }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ---------- Formulario de bien ---------- */
function FormBien({ bien, household, onClose, onSaved }) {
  const [f, setF] = useState({
    name: bien.name || '', kind: bien.kind || 'inmueble',
    value: bien.value ? String(bien.value) : '', currency: bien.currency || 'PYG',
    qty: bien.qty ? String(bien.qty) : '', note: bien.note || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const num = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0

  const save = async (e) => {
    e.preventDefault()
    if (!f.name.trim()) return
    setBusy(true)
    const payload = {
      household_id: household.id, name: f.name.trim(), kind: f.kind,
      value: num(f.value), currency: f.currency, qty: f.qty ? num(f.qty) : null,
      note: f.note || null, color: tipoBien(f.kind).color,
    }
    if (bien.id) await supabase.from('assets').update(payload).eq('id', bien.id)
    else await supabase.from('assets').insert(payload)
    setBusy(false); onSaved(); onClose()
  }

  return (
    <Modal title={bien.id ? 'Editar bien' : 'Agregar bien'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>¿Qué es?</label>
          <input className="form-input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej: Casa de Luque, Auto, Bitcoin" autoFocus />
        </div>
        <div className="field"><label>Tipo</label>
          <select className="form-select" value={f.kind} onChange={(e) => set('kind', e.target.value)}>
            {TIPOS_BIEN.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>¿Cuánto vale hoy?</label>
            <input className="form-input" inputMode="decimal" value={f.value} onChange={(e) => set('value', e.target.value)} placeholder="0" />
          </div>
          <div className="field"><label>Moneda</label>
            <select className="form-select" value={f.currency} onChange={(e) => set('currency', e.target.value)}>
              <option value="PYG">Guaraníes ₲</option>
              <option value="USD">Dólares US$</option>
            </select>
          </div>
        </div>
        {f.kind === 'cripto' && (
          <div className="field"><label>Cantidad (opcional)</label>
            <input className="form-input" inputMode="decimal" value={f.qty} onChange={(e) => set('qty', e.target.value)} placeholder="Ej: 0.015" />
          </div>
        )}
        <div className="field"><label>Nota (opcional)</label>
          <input className="form-input" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="Detalle" />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}

/* ---------- Formulario de cuenta por cobrar ---------- */
function FormCobro({ cobro, household, onClose, onSaved }) {
  const [f, setF] = useState({
    who: cobro.who || '', concept: cobro.concept || '',
    amount: cobro.amount ? String(cobro.amount) : '', currency: cobro.currency || 'PYG',
    due_date: cobro.due_date || '', phone: cobro.phone || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const num = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0

  const save = async (e) => {
    e.preventDefault()
    if (!f.who.trim()) return
    setBusy(true)
    const payload = {
      household_id: household.id, who: f.who.trim(), concept: f.concept || null,
      amount: num(f.amount), currency: f.currency,
      due_date: f.due_date || null, phone: f.phone || null,
    }
    if (cobro.id) await supabase.from('receivables').update(payload).eq('id', cobro.id)
    else await supabase.from('receivables').insert(payload)
    setBusy(false); onSaved(); onClose()
  }

  return (
    <Modal title={cobro.id ? 'Editar cobro' : '¿Quién te debe?'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field"><label>Cliente o persona</label>
          <input className="form-input" value={f.who} onChange={(e) => set('who', e.target.value)} placeholder="Nombre" autoFocus />
        </div>
        <div className="field"><label>¿Por qué?</label>
          <input className="form-input" value={f.concept} onChange={(e) => set('concept', e.target.value)} placeholder="Ej: Sesión de fotos, seña del evento" />
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Monto</label>
            <input className="form-input" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
          </div>
          <div className="field"><label>Moneda</label>
            <select className="form-select" value={f.currency} onChange={(e) => set('currency', e.target.value)}>
              <option value="PYG">Guaraníes ₲</option>
              <option value="USD">Dólares US$</option>
            </select>
          </div>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>¿Para cuándo?</label>
            <input className="form-input" type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </div>
          <div className="field"><label>WhatsApp (opcional)</label>
            <input className="form-input" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="595981..." />
          </div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}
