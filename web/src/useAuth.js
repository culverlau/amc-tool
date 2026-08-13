import { useEffect, useState } from 'react'
import { getProfile } from '@amc/shared'
import { supabase } from './supabase'

/** Session + profile (which carries waitlist status), kept in sync with auth changes. */
export function useAuth() {
  const [session, setSession] = useState(undefined) // undefined = not checked yet, null = signed out
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    let cancelled = false
    getProfile(supabase)
      .then((p) => { if (!cancelled) setProfile(p) })
      .catch((e) => { if (!cancelled) setProfileError(e) })
    return () => { cancelled = true }
  }, [session])

  return {
    loading: session === undefined || (session && profile === null && !profileError),
    session,
    profile,
    profileError,
    signInWithGoogle: () => supabase.auth.signInWithOAuth({ provider: 'google' }),
    signOut: () => supabase.auth.signOut(),
  }
}
