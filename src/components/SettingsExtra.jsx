import { useState } from 'react'
import { CalendarPlus, Copy, Check, Smartphone, DatabaseBackup, Upload, Download, Gauge } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { feedUrls } from '../lib/ics'
import MoneyInput from './MoneyInput'

const BACKUP_TABLES = ['account_labels', 'accounts', 'categories', 'transactions', 'recurring_transactions', 'budgets', 'budget_adjustments', 'goals', 'goal_contributions', 'debts', 'debt_payments', 'trips', 'trip_items', 'merchant_rules', 'distribution_rules']

function CopyBox({ value }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="row" style={{ gap: 8 }}>
      <input className="form-input" readOnly value={value} style={{ fontSize: 12, fontFamily: 'monospace' }} onFocus={(e) => e.target.select()} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500) }}>{ok ? <Check size={15} /> : <Copy size={15} />}</button>
    </div>
  )
}

export default function SettingsExtra({ flash }) {
  const { household, refresh } = useAuth()
  const [payday, setPayday] = useState(household?.payday || '')
  const [limit, setLimit] = useState(Number(household?.daily_limit) || 0)
  const [auto, setAuto] = useState(!household?.daily_limit)
  const [busy, setBusy] = useState(false)
  if (!household) return null
  const feed = household.calendar_token ? feedUrls(household.calendar_token) : null
  const base = window.location.origin

  const savePlan = async () => {
    await supabase.from('households').update({ payday: parseInt(payday, 10) || null, daily_limit: auto ? null : Math.round(limit) || null }).eq('id', household.id)
    await refresh(); flash?.('Guardado')
  }
  const newToken = async () => {
    if (!confirm('Esto genera un link nuevo y el anterior deja de funcionar (tendrás que volver a suscribirte en tu calendario). ¿Seguimos?')) return
    const tok = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('')
    await supabase.from('households').update({ calendar_token: tok }).eq('id', household.id)
    await refresh(); flash?.('Link de calendario renovado')
  }

  const backup = async () => {
    setBusy(true)
    const out = { app: 'Mi Billetera', version: 2, exported_at: new Date().toISOString(), household: household.name, tables: {} }
    for (const t of BACKUP_TABLES) {
      const { data } = await supabase.from(t).select('*')
      out.tables[t] = data || []
    }
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `mi-billetera-copia-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setBusy(false); flash?.('Copia descargada')
  }

  const restore = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    let data
    try { data = JSON.parse(await f.text()) } catch { return flash?.('Ese archivo no es una copia válida') }
    if (!data?.tables) return flash?.('Ese archivo no es una copia de Mi Billetera')
    const n = Object.values(data.tables).reduce((s, x) => s + (x?.length || 0), 0)
    if (!confirm(`Voy a restaurar ${n} registros en este hogar. Lo que ya existe con el mismo ID se sobreescribe con la versión de la copia; no se borra nada más. ¿Seguimos?`)) return
    setBusy(true)
    let fails = 0
    for (const t of BACKUP_TABLES) {
      const rows = (data.tables[t] || []).map((r) => ('household_id' in r ? { ...r, household_id: household.id } : r))
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from(t).upsert(rows.slice(i, i + 200), { onConflict: 'id' })
        if (error) fails++
      }
    }
    setBusy(false)
    flash?.(fails ? `Restaurado con ${fails} error(es). Revisá los datos.` : 'Copia restaurada ✅')
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><Gauge size={16} /> Límite diario y día de cobro</div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label>Día del mes en que cobrás (opcional)</label>
            <input className="form-input" inputMode="numeric" value={payday} onChange={(e) => setPayday(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="Si lo dejás vacío uso tu próximo ingreso fijo" />
          </div>
          <div className="field">
            <label>Límite para gastar por día</label>
            <div className="segmented" style={{ marginBottom: 8 }}>
              <button type="button" className={auto ? 'active' : ''} onClick={() => setAuto(true)}>Automático</button>
              <button type="button" className={!auto ? 'active' : ''} onClick={() => setAuto(false)}>Monto fijo</button>
            </div>
            {!auto && <MoneyInput value={limit} onChange={setLimit} />}
          </div>
        </div>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Automático: lo que tenés en cuentas (sin tarjetas) menos los pagos que vencen antes del cobro, dividido por los días que faltan.</p>
        <button className="btn btn-primary btn-sm" onClick={savePlan}>Guardar</button>
      </div>

      {feed && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title"><CalendarPlus size={16} /> Calendario (Google / Apple)</div>
          <p className="text-2" style={{ fontSize: 13.5, marginBottom: 12 }}>Tus pagos, vencimientos de tarjeta y metas en tu calendario, siempre actualizados.</p>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <a className="btn btn-secondary btn-sm" style={{ flex: 1 }} href={feed.google} target="_blank" rel="noreferrer">Google Calendar</a>
            <a className="btn btn-secondary btn-sm" style={{ flex: 1 }} href={feed.webcal}>Apple Calendar</a>
          </div>
          <CopyBox value={feed.https} />
          <button className="link" style={{ marginTop: 10 }} onClick={newToken}>Generar un link nuevo (si lo compartiste por error)</button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><Smartphone size={16} /> Doble toque atrás del iPhone</div>
        <p className="text-2" style={{ fontSize: 13.5, marginBottom: 10 }}>Abrí la carga de un gasto con dos toques en la espalda del celular:</p>
        <ol className="text-2" style={{ fontSize: 13.5, paddingLeft: 18, marginBottom: 12, display: 'grid', gap: 6 }}>
          <li>App <strong>Atajos</strong> → <strong>+</strong> → acción <strong>“Abrir URL”</strong> y pegá este link:</li>
        </ol>
        <CopyBox value={`${base}/?nuevo=gasto`} />
        <ol start={2} className="text-2" style={{ fontSize: 13.5, paddingLeft: 18, margin: '12px 0', display: 'grid', gap: 6 }}>
          <li>Nombralo “Nuevo gasto” y guardalo.</li>
          <li><strong>Ajustes</strong> del iPhone → Accesibilidad → Tocar → <strong>Tocar atrás</strong> → Doble toque → elegí el atajo “Nuevo gasto”.</li>
        </ol>
        <p className="text-muted" style={{ fontSize: 12.5 }}>Variantes: <code>?nuevo=ingreso</code>, <code>?nuevo=gasto&amp;monto=15000&amp;texto=Café&amp;cuenta=Ueno</code>. Si agregás la app a la pantalla de inicio, abre como app.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><DatabaseBackup size={16} /> Copia de seguridad</div>
        <p className="text-2" style={{ fontSize: 13.5, marginBottom: 12 }}>Descargá todo (cuentas, movimientos, pagos, metas, presupuestos, deudas) en un archivo. Guardalo en iCloud o Drive.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={backup} disabled={busy}><Download size={15} /> Descargar copia</button>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}><Upload size={15} /> Restaurar copia
            <input type="file" accept="application/json,.json" onChange={restore} style={{ display: 'none' }} />
          </label>
        </div>
        {busy && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Trabajando…</div>}
      </div>
    </>
  )
}
