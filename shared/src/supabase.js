import { createClient } from '@supabase/supabase-js'

/**
 * Build a Supabase client. Both clients call this with their own config:
 * the web app lets supabase-js use localStorage and detect the OAuth
 * redirect in the URL; the Expo app passes AsyncStorage and turns URL
 * detection off, since there is no browser URL to read a session out of.
 *
 * The anon key is meant to be public — it identifies the project, while the
 * signed-in user's JWT is what RLS actually gates on. The service role key
 * must never reach either bundle.
 */
export function createSupabaseClient({ url, anonKey, storage, detectSessionInUrl = true }) {
  if (!url || !anonKey) {
    throw new Error('Supabase url and anonKey are required')
  }
  return createClient(url, anonKey, {
    auth: {
      storage,
      detectSessionInUrl,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
}

/** Public Storage URL for one theater's showtime file. */
export function theaterDataUrl(supabaseUrl, amcId) {
  return `${supabaseUrl}/storage/v1/object/public/showtimes/theater-${amcId}.json`
}
