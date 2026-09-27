import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { setAmountsHidden } from '../lib/format'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// Corta una promesa que se queda colgada (red lenta, app que vuelve de segundo plano)
const conTiempo = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [household, setHousehold] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const userIdRef = useRef(null)
  const [hideBalances, setHideBalances] = useState(() => {
    try { return localStorage.getItem('hideBalances') === '1' } catch { return false }
  })
  // mantener el formateador de moneda sincronizado (antes de renderizar los hijos)
  setAmountsHidden(hideBalances)
  const toggleHide = () => setHideBalances((v) => {
    const nv = !v
    try { localStorage.setItem('hideBalances', nv ? '1' : '0') } catch { /* noop */ }
    setAmountsHidden(nv)
    return nv
  })

  // Carga perfil y hogar. Reintenta si la red falla; devuelve true si salió bien.
  const loadProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); setHousehold(null); return true }
    for (let intento = 0; intento < 3; intento++) {
      try {
        const { data: prof, error } = await conTiempo(
          supabase.from('profiles').select('*').eq('id', uid).maybeSingle(), 8000)
        if (error) throw error
        // Sesión obsoleta: hay token pero el usuario ya no existe en la BD → cerrar sesión
        if (!prof) {
          await supabase.auth.signOut()
          setProfile(null); setHousehold(null)
          return true
        }
        setProfile(prof)
        if (prof.active_household_id) {
          const { data: hh, error: e2 } = await conTiempo(
            supabase.from('households').select('*').eq('id', prof.active_household_id).maybeSingle(), 8000)
          if (e2) throw e2
          setHousehold(hh || null)
        } else {
          setHousehold(null)
        }
        setLoadError(false)
        return true
      } catch {
        await espera(800 * (intento + 1))
      }
    }
    setLoadError(true)
    return false
  }, [])

  useEffect(() => {
    let vivo = true

    const iniciar = async () => {
      let u = null
      try {
        const { data } = await conTiempo(supabase.auth.getSession(), 10000)
        u = data.session?.user ?? null
      } catch {
        // No pudimos leer la sesión a tiempo: probamos de nuevo una vez
        try { const { data } = await supabase.auth.getSession(); u = data.session?.user ?? null } catch { /* noop */ }
      }
      if (!vivo) return
      userIdRef.current = u?.id || null
      setUser(u)
      await loadProfile(u?.id)
      if (vivo) setLoading(false)
    }
    iniciar()

    // IMPORTANTE: este callback no puede esperar otras llamadas a Supabase (se traba el
    // candado de la sesión y la app queda cargando para siempre). Por eso las
    // consultas se hacen después, fuera del callback.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      const mismoUsuario = (u?.id || null) === userIdRef.current
      userIdRef.current = u?.id || null
      setUser(u)
      if (event === 'INITIAL_SESSION') return // ya lo maneja iniciar()
      if (event === 'TOKEN_REFRESHED' && mismoUsuario) return // solo se renovó el token
      setTimeout(() => { loadProfile(u?.id) }, 0)
    })

    // Al volver a la app (celular que estuvo en segundo plano): si algo quedó a medias, reintentar
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      setTimeout(async () => {
        try { await supabase.auth.getSession() } catch { /* noop */ }
        if (userIdRef.current) setHousehold((hh) => { if (!hh) loadProfile(userIdRef.current); return hh })
      }, 0)
    }
    document.addEventListener('visibilitychange', alVolver)

    return () => { vivo = false; sub.subscription.unsubscribe(); document.removeEventListener('visibilitychange', alVolver) }
  }, [loadProfile])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signUp = (email, password, name) =>
    supabase.auth.signUp({ email, password, options: { data: { name } } })

  const signOut = () => supabase.auth.signOut()

  const refresh = () => loadProfile(user?.id)

  const value = { user, profile, household, loading, loadError, signIn, signUp, signOut, refresh, setProfile, hideBalances, toggleHide }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
