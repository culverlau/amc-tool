import { createSupabaseClient } from '@amc/shared'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The anon key is meant to be public — it identifies the project; RLS on the
// signed-in user's JWT is what actually scopes queries. Safe to ship in the bundle.
export const supabase = createSupabaseClient({
  url,
  anonKey,
  storage: window.localStorage,
  detectSessionInUrl: true,
})

export const SUPABASE_URL = url
