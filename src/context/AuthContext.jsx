import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [household, setHousehold] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); setHousehold(null); return }
    const { data: prof, error } = await supabase
      .from('profiles').select('*').eq('id', uid).maybeSingle()
    // Sesión obsoleta: hay token pero el usuario ya no existe en la BD → cerrar sesión
    if (!error && !prof) {
      await supabase.auth.signOut()
      setProfile(null); setHousehold(null)
      return
    }
    setProfile(prof || null)
    if (prof?.active_household_id) {
      const { data: hh } = await supabase
        .from('households').select('*').eq('id', prof.active_household_id).maybeSingle()
      setHousehold(hh || null)
    } else {
      setHousehold(null)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      await loadProfile(u?.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      const u = session?.user ?? null
      setUser(u)
      await loadProfile(u?.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signUp = (email, password, name) =>
    supabase.auth.signUp({ email, password, options: { data: { name } } })

  const signOut = () => supabase.auth.signOut()

  const refresh = () => loadProfile(user?.id)

  const value = { user, profile, household, loading, signIn, signUp, signOut, refresh, setProfile }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
