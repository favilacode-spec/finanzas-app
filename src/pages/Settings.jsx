import { useEffect, useState } from 'react'
import { Copy, Check, Users, KeyRound, Apple, Mail, Sparkles, LogOut } from 'lucide-react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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

  useEffect(() => { setName(profile?.name || ''); setHhName(household?.name || '') }, [profile, household])

  useEffect(() => {
    if (!household) return
    supabase.from('household_members').select('user_id, role, profiles(name)').eq('household_id', household.id)
      .then(({ data }) => setMembers(data || []))
    supabase.rpc('get_or_create_ingest_token').then(({ data }) => setToken(data || ''))
  }, [household])

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
      {msg && <div className="card" style={{ marginBottom: 16, background: 'var(--blue-soft)', borderColor: 'var(--blue-border)', color: '#bcd3ff', padding: '10px 14px' }}>{msg}</div>}

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
