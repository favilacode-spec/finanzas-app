import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setMsg(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), password)
        if (error) throw error
      } else {
        if (!name.trim()) throw new Error('Ingresá tu nombre')
        const { data, error } = await signUp(email.trim(), password, name.trim())
        if (error) throw error
        if (!data.session) {
          setMsg('¡Cuenta creada! Revisá tu correo para confirmar y luego iniciá sesión.')
          setMode('login')
        }
      }
    } catch (e2) {
      setErr(traducir(e2.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen" style={{ padding: 18 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 16px', borderRadius: 18, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #33333a 0%, #0c0c0f 100%)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
            <Wallet size={32} color="#fff" strokeWidth={2.2} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800 }}>Mi Billetera CR</h1>
          <p className="text-2" style={{ marginTop: 6 }}>Tu administración financiera, en familia.</p>
        </div>

        <div className="card">
          <div className="segmented" style={{ marginBottom: 20 }}>
            <button type="button" className={mode === 'login' ? 'active-blue' : ''} onClick={() => { setMode('login'); setErr('') }}>Iniciar sesión</button>
            <button type="button" className={mode === 'signup' ? 'active-blue' : ''} onClick={() => { setMode('signup'); setErr('') }}>Crear cuenta</button>
          </div>

          <form onSubmit={submit}>
            {mode === 'signup' && (
              <div className="field">
                <label>Nombre</label>
                <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
              </div>
            )}
            <div className="field">
              <label>Correo</label>
              <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@correo.com" required />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} required />
            </div>

            {err && <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: 'var(--red-soft)', borderColor: 'var(--red-border)', color: '#d0d0d6', fontSize: 13.5 }}>{err}</div>}
            {msg && <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: 'var(--blue-soft)', borderColor: 'var(--blue-border)', color: '#ededf2', fontSize: 13.5 }}>{msg}</div>}

            <button className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </div>
        <p className="text-muted" style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5 }}>
          Ambos (vos y tu pareja) pueden crear su cuenta y compartir las finanzas con un código de hogar.
        </p>
      </div>
    </div>
  )
}

function traducir(m = '') {
  if (/Invalid login/i.test(m)) return 'Correo o contraseña incorrectos.'
  if (/already registered/i.test(m)) return 'Ese correo ya tiene una cuenta.'
  if (/at least 6/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.'
  return m
}
