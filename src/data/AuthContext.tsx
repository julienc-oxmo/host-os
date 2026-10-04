import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface AuthUser { id: string; email: string | null }
interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  mode: 'supabase' | 'local'
  signIn(email: string, password: string): Promise<string | null>
  signUp(email: string, password: string): Promise<string | null>
  magicLink(email: string): Promise<string | null>
  signOut(): Promise<void>
}

const Ctx = createContext<AuthCtx>(null as never)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthCtx>(() => {
    if (!supabase)
      return {
        user: { id: 'local-user', email: null }, loading: false, mode: 'local',
        signIn: async () => null, signUp: async () => null, magicLink: async () => null, signOut: async () => {},
      }
    const sb = supabase
    return {
      user: session ? { id: session.user.id, email: session.user.email ?? null } : null,
      loading, mode: 'supabase',
      signIn: async (email, password) => (await sb.auth.signInWithPassword({ email, password })).error?.message ?? null,
      signUp: async (email, password) => {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        if (error) return error.message
        return data.session ? null : 'CHECK_EMAIL'
      },
      magicLink: async (email) =>
        (await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })).error?.message ?? 'CHECK_EMAIL',
      signOut: async () => { await sb.auth.signOut() },
    }
  }, [session, loading])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
