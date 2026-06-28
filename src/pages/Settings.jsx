import { useEffect, useState } from 'react'
import { Copy, Check, Users, KeyRound, Apple, Mail, Sparkles, LogOut, Calculator, Plus, Trash2 } from 'lucide-react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const DEFAULT_RULES = [
  { label: 'Principal', percent: 65, match: ['ueno', 'principal'] },
  { label: 'IVA', percent: 10, match: ['itau', 'itaú'] },
  { label: 'Diezmo', percent: 10, match: ['eko'] },
  { label: 'Ahorro pequeño', percent: 5, match: ['bnf'] },
  { label: 'Efectivo', percent: 10, match: ['efectivo', 'atlas'] },
]

const totalPct = (rules) => Math.round((rules || []).reduce((s, r) => s + (Number(r.percent) || 0), 0) * 100) / 100

function Copyable({ value, label }) {
  const [done, setDone] = useState(false)
  return (
    <div className="row" style={{ gap: 8 }}>
      <input className="form-input" readOnly value={value} style={{ fontSize: 13, fontFamily: 'monospace' }} onFocus={(e) => e.target.select()} />
      <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}>
        {done ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  )
}

export default function Settings() {
  const { user, profile, household, refresh, signOut } = useAuth()
  const [name, setName] = useState(profile?.name || '')
  const [hhName, setHhName] = useState(household?.name || '')
  const [members, setMembers] = useState([])
  const [token, setToken] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [msg, setMsg] = useState('')
  const [accounts, setAccounts] = useState([])
  const [rules, setRules] = useState([])

  useEffect(() => { setName(profile?.name || ''); setHhName(household?.name || '') }, [profile, household])

  useEffect(() => {
    if (!household) return
    supabase.from('household_members').select('user_id, role, profiles(name)').eq('household_id', household.id)
      .then(({ data }) => setMembers(data || []))
    supabase.rpc('get_or_create_ingest_token').then(({ data }) => setToken(data || ''))
    loadRules()
  }, [household])

  const loadRules = async () => {
    const [{ data: accs }, { data: rs }] = await Promise.all([
      supabase.from('accounts').select('id,name').eq('archived', false).order('name'),
      supabase.from('distribution_rules').select('*').order('sort'),
    ])
    setAccounts(accs || [])
    if (rs && rs.length > 0) {
      setRules(rs.map((r) => ({ label: r.label, percent: r.percent, account_id: r.account_id || '' })))
    } else {
      // precargar valores sugeridos, mapeando cuentas por nombre
      setRules(DEFAULT_RULES.map((d) => {
        const acc = (accs || []).find((a) => d.match.some((m) => a.name.toLowerCase().includes(m)))
        return { label: d.label, percent: d.percent, account_id: acc?.id || '' }
      }))
    }
  }

  const setRule = (i, key, val) => setRules((rs) => rs.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  const addRule = () => setRules((rs) => [...rs, { label: '', percent: 0, account_id: '' }])
  const removeRule = (i) => setRules((rs) => rs.filter((_, idx) => idx !== i))

  const saveRules = async () => {
    await supabase.from('distribution_rules').delete().eq('household_id', household.id)
    const rows = rules
      .filter((r) => r.label.trim() && Number(r.percent) > 0)
      .map((r, idx) => ({ household_id: household.id, label: r.label.trim(), percent: Number(r.percent), account_id: r.account_id || null, sort: idx }))
    if (rows.length) await supabase.from('distribution_rules').insert(rows)
    flash('Distribución guardada')
    loadRules()
  }

  const saveName = async () => { await supabase.from('profiles').update({ name }).eq('id', user.id); refresh(); flash('Nombre actualizado') }
  const saveHh = async () => { await supabase.from('households').update({ name: hhName }).eq('id', household.id); refresh(); flash('Hogar actualizado') }
  const join = async () => {
    if (!joinCode.trim()) return
    const { error } = await supabase.rpc('join_household', { code: joinCode.trim() })
    if (error) return flash(error.message)
    setJoinCode(''); refresh(); flash('¡Te uniste al hogar! Recargá la página.')
  }
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  const applePayUrl = `${FUNCTIONS_URL}/apple-pay-ingest`
  const emailUrl = `${FUNCTIONS_URL}/email-ingest`

  return (
    <div style={{ maxWidth: 720 }}>
      {msg && <div className="card" style={{ marginBottom: 16, background: 'var(--blue-soft)', borderColor: 'var(--blue-border)', color: '#ededf2', padding: '10px 14px' }}>{msg}</div>}

      {/* Perfil */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Mi perfil</div>
        <div className="field"><label>Nombre</label><input className="form-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>{user?.email}</div>
        <button className="btn btn-primary btn-sm" onClick={saveName}>Guardar</button>
      </div>

      {/* Hogar compartido */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><Users size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Hogar compartido</div>
        <div className="field"><label>Nombre del hogar</label><input className="form-input" value={hhName} onChange={(e) => setHhName(e.target.value)} /></div>
        <button className="btn btn-primary btn-sm" onClick={saveHh} style={{ marginBottom: 18 }}>Guardar</button>

        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Código de invitación (compartilo con tu pareja)</label>
        <Copyable value={household?.invite_code || ''} />

        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Miembros</label>
          {members.map((m) => (
            <div className="row between" key={m.user_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{m.profiles?.name || 'Usuario'}</span>
              <span className="badge">{m.role === 'owner' ? 'Dueño' : 'Miembro'}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Unirme a otro hogar (con un código)</label>
          <div className="row" style={{ gap: 8 }}>
            <input className="form-input" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Pegá el código aquí" />
            <button className="btn btn-secondary" onClick={join}>Unirme</button>
          </div>
        </div>
      </div>

      {/* Apple Pay */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><Apple size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Automatización: Apple Pay</div>
        <p className="text-2" style={{ fontSize: 13.5, marginBottom: 14 }}>
          Configurá un Atajo en tu iPhone que registre cada pago automáticamente. Usá estos dos datos en el paso "Obtener contenido de URL" del atajo:
        </p>
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>URL (método POST)</label>
        <Copyable value={applePayUrl} />
        <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', margin: '12px 0 6px' }}>Tu token (campo "token" del cuerpo JSON)</label>
        <Copyable value={token} />
        <p className="text-muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          El cuerpo JSON debe ser: <code>{`{"token":"TU_TOKEN","amount":[Monto],"merchant":[Comercio]}`}</code>. En el archivo INSTRUCCIONES.md tenés el paso a paso completo.
        </p>
      </div>

      {/* Email */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><Mail size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Automatización: Emails del banco</div>
        <p className="text-2" style={{ fontSize: 13.5, marginBottom: 14 }}>
          Con un script gratuito de Gmail (Apps Script), tus emails de notificación del banco se registran solos. Usá esta URL y tu token (el mismo de arriba):
        </p>
        <Copyable value={emailUrl} />
        <p className="text-muted" style={{ fontSize: 12.5, marginTop: 12 }}>Paso a paso en el archivo INSTRUCCIONES.md.</p>
      </div>

      {/* Distribución de ingresos */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><Calculator size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Distribución de ingresos</div>
        <p className="text-2" style={{ fontSize: 13.5, marginBottom: 14 }}>
          Cuando apruebes una <b>transferencia recibida</b> (ingreso), la app te muestra cuánto transferir a cada cuenta según estos porcentajes.
        </p>
        {rules.map((r, i) => (
          <div className="row" style={{ gap: 8, marginBottom: 8, alignItems: 'center' }} key={i}>
            <input className="form-input" style={{ flex: 2, minWidth: 90, padding: '9px 11px' }} placeholder="Concepto" value={r.label} onChange={(e) => setRule(i, 'label', e.target.value)} />
            <div style={{ position: 'relative', width: 78 }}>
              <input className="form-input" style={{ padding: '9px 22px 9px 11px' }} inputMode="numeric" value={r.percent} onChange={(e) => setRule(i, 'percent', e.target.value.replace(/[^0-9.]/g, ''))} />
              <span style={{ position: 'absolute', right: 10, top: 10, color: 'var(--text-muted)', fontSize: 13 }}>%</span>
            </div>
            <select className="form-select" style={{ flex: 2, minWidth: 110, padding: '9px 30px 9px 11px' }} value={r.account_id} onChange={(e) => setRule(i, 'account_id', e.target.value)}>
              <option value="">Cuenta…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button type="button" className="icon-btn" onClick={() => removeRule(i)}><Trash2 size={14} /></button>
          </div>
        ))}
        <div className="row between" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={addRule}><Plus size={15} /> Agregar fila</button>
          <span className="badge" style={{ background: totalPct(rules) === 100 ? 'var(--blue-soft)' : 'var(--red-soft)', color: totalPct(rules) === 100 ? '#ededf2' : '#c9c9cf', borderColor: totalPct(rules) === 100 ? 'var(--blue-border)' : 'var(--red-border)' }}>
            Total: {totalPct(rules)}%
          </span>
        </div>
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={saveRules}>Guardar distribución</button>
      </div>

      {/* IA */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Activar consejos con IA (opcional)</div>
        <p className="text-2" style={{ fontSize: 13.5 }}>
          Creá una clave gratis en console.groq.com y cargala en Supabase → Edge Functions → Secrets como <code>GROQ_API_KEY</code>. Con eso se activa el asesor IA. Sin la clave, el resto de la app funciona igual.
        </p>
      </div>

      <button className="btn btn-danger" onClick={signOut}><LogOut size={16} /> Cerrar sesión</button>
    </div>
  )
}
