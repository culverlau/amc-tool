/**
 * Every database call both clients make. RLS is what actually scopes these to
 * the signed-in user — the `user_id` filters here are for index selectivity and
 * clarity, not security.
 */

// ------------------------------------------------------------------ profile

export async function getProfile(sb) {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).single()
  if (error) throw error
  return data
}

/** Marks the first-run onboarding flow as done (skipped or finished — both
 * count, since the point is not showing it again). */
export async function completeOnboarding(sb) {
  const { data: { user } } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', user.id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Clears onboarded_at so the first-run flow shows again — used by the
 * "Replay onboarding" control in Settings. */
export async function restartOnboarding(sb) {
  const { data: { user } } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('profiles')
    .update({ onboarded_at: null })
    .eq('id', user.id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Swaps in a fresh random ntfy topic — e.g. if a user suspects theirs has
 * leaked (ntfy topics are unlisted but not access-controlled: anyone who
 * knows the name can subscribe). */
export async function regenerateNtfyTopic(sb) {
  const { data: { user } } = await sb.auth.getUser()
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const topic = 'amc-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  const { data, error } = await sb
    .from('profiles')
    .update({ ntfy_topic: topic })
    .eq('id', user.id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Only preference columns; status and snipe_cap are rejected by a DB trigger. */
export async function updateSeatZoneDefaults(sb, zone) {
  const { data: { user } } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('profiles')
    .update({
      row_min: zone.row_min,
      row_max: zone.row_max,
      seat_min: zone.seat_min,
      seat_max: zone.seat_max,
    })
    .eq('id', user.id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ----------------------------------------------------------------- theaters

export async function getFollowedTheaters(sb) {
  const { data, error } = await sb
    .from('user_theaters')
    .select('amc_id, theaters(amc_id, name, city, state, last_fetched_at)')
    .order('amc_id')
  if (error) throw error
  return (data || []).map((r) => r.theaters).filter(Boolean)
}

export async function searchTheaters(sb, query, limit = 25) {
  let q = sb.from('theaters').select('amc_id, name, city, state').limit(limit).order('name')
  const term = (query || '').trim()
  if (term) {
    const like = `%${term}%`
    q = q.or(`name.ilike.${like},city.ilike.${like},state.ilike.${like}`)
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function followTheater(sb, amcId) {
  const { data: { user } } = await sb.auth.getUser()
  const { error } = await sb.from('user_theaters').insert({ user_id: user.id, amc_id: amcId })
  if (error && error.code !== '23505') throw error // ignore duplicate follow
}

export async function unfollowTheater(sb, amcId) {
  const { error } = await sb.from('user_theaters').delete().eq('amc_id', amcId)
  if (error) throw error
}

/** Kicks off an on-demand showtime fetch for one theater (GitHub Actions,
 * usually done within a minute or two) instead of waiting for the 6-hour
 * cron. Fire-and-forget from the caller's perspective — it dispatches the
 * workflow and returns before the fetch itself finishes. */
export async function triggerShowtimeFetch(sb, amcId) {
  const { error } = await sb.functions.invoke('trigger-fetch', { body: { amc_id: amcId } })
  if (error) throw error
}

// ---------------------------------------------------------------- watchlist

/**
 * Watchlist rows with the sniper's latest scrape attached. showtime_seats has
 * no FK to watchlist (it is shared across users), so this is two queries
 * merged client-side rather than a PostgREST join.
 *
 * `availableSeats` is null when the showtime has never been scraped, and an
 * array (possibly empty) once it has — the UI distinguishes "no data yet" from
 * "nothing open right now".
 */
/** Past 30 days of seat alerts (older rows are expired server-side by
 * scripts/snipe_seats.py). Separate from the watchlist itself. */
export async function getAlertHistory(sb, limit = 50) {
  const { data, error } = await sb
    .from('notification_history')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function getWatchlist(sb) {
  const { data: rows, error } = await sb
    .from('watchlist')
    .select('*')
    .order('starts_at', { ascending: true })
  if (error) throw error
  if (!rows?.length) return []

  const { data: seats, error: seatErr } = await sb
    .from('showtime_seats')
    .select('showtime_id, available_seats, sold_out, scraped_at')
    .in('showtime_id', rows.map((r) => r.showtime_id))
  if (seatErr) throw seatErr

  const byShowtime = new Map((seats || []).map((s) => [String(s.showtime_id), s]))
  return rows.map((r) => {
    const s = byShowtime.get(String(r.showtime_id))
    return {
      ...r,
      availableSeats: s ? s.available_seats : null,
      soldOut: s ? s.sold_out : null,
      scrapedAt: s ? s.scraped_at : null,
    }
  })
}

export async function addToWatchlist(sb, showtime, zone) {
  const { data: { user } } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('watchlist')
    .insert({
      user_id: user.id,
      showtime_id: showtime.showtimeId,
      theater_id: showtime.theaterId,
      movie_name: showtime.movieName,
      starts_at: showtime.startsAt,
      format: showtime.format,
      row_min: zone.row_min,
      row_max: zone.row_max,
      seat_min: zone.seat_min,
      seat_max: zone.seat_max,
    })
    .select()
    .single()
  // The snipe-cap trigger raises check_violation; surface it as a usable message.
  if (error) {
    if (error.code === '23514' || /snipe limit/i.test(error.message || '')) {
      throw new Error(error.message || 'Snipe limit reached')
    }
    throw error
  }
  return data
}

export async function removeFromWatchlist(sb, showtimeId) {
  const { error } = await sb.from('watchlist').delete().eq('showtime_id', showtimeId)
  if (error) throw error
}

// --------------------------------------------------------------- hidden movies

/** Set of AMC movie ids (as strings, matching movie.id elsewhere) the user
 * has hidden from their main list. */
export async function getHiddenMovies(sb) {
  const { data, error } = await sb.from('hidden_movies').select('movie_id')
  if (error) throw error
  return new Set((data || []).map((r) => String(r.movie_id)))
}

export async function hideMovie(sb, movieId) {
  const { data: { user } } = await sb.auth.getUser()
  const { error } = await sb.from('hidden_movies').upsert(
    { user_id: user.id, movie_id: movieId },
    { onConflict: 'user_id,movie_id' }
  )
  if (error) throw error
}

export async function unhideMovie(sb, movieId) {
  const { error } = await sb.from('hidden_movies').delete().eq('movie_id', movieId)
  if (error) throw error
}

export async function unhideMovies(sb, movieIds) {
  if (!movieIds.length) return
  const { error } = await sb.from('hidden_movies').delete().in('movie_id', movieIds)
  if (error) throw error
}

// ------------------------------------------------------------ wishlist movies

/** Movies the user wants to see, oldest-added first. movie_id is a string to
 * match movie.id elsewhere; movie_name/poster are a snapshot from when it was
 * added, so it can be shown even once it's no longer playing anywhere followed. */
export async function getWishlist(sb) {
  const { data, error } = await sb
    .from('wishlist_movies')
    .select('movie_id, movie_name, poster, added_at')
    .order('added_at')
  if (error) throw error
  return (data || []).map((r) => ({ ...r, movie_id: String(r.movie_id) }))
}

export async function addToWishlist(sb, movie) {
  const { data: { user } } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('wishlist_movies')
    .upsert(
      { user_id: user.id, movie_id: movie.id, movie_name: movie.name, poster: movie.poster || null },
      { onConflict: 'user_id,movie_id' }
    )
    .select('movie_id, movie_name, poster, added_at')
    .single()
  if (error) throw error
  return { ...data, movie_id: String(data.movie_id) }
}

export async function removeFromWishlist(sb, movieId) {
  const { error } = await sb.from('wishlist_movies').delete().eq('movie_id', movieId)
  if (error) throw error
}

// ------------------------------------------------------------- seat layouts

/** Cached physical seat-layout range per (theater, layoutId) auditorium,
 * scraped once by scripts/scrape_layouts.py and reused across every
 * showtime sharing that room. Returns a Map keyed by `${theater_id}:${layout_id}`
 * -> { row_min, row_max, seat_min, seat_max } — a missing entry means that
 * room hasn't been scraped yet, not an error; callers should treat it as
 * "no hint available". */
export async function getSeatLayouts(sb, theaterIds) {
  const ids = (theaterIds || []).map(Number).filter(Number.isFinite)
  if (ids.length === 0) return new Map()
  const { data, error } = await sb
    .from('seat_layouts')
    .select('theater_id, layout_id, row_min, row_max, seat_min, seat_max')
    .in('theater_id', ids)
  if (error) throw error
  return new Map(
    (data || []).map((r) => [
      `${r.theater_id}:${r.layout_id}`,
      { row_min: r.row_min, row_max: r.row_max, seat_min: r.seat_min, seat_max: r.seat_max },
    ])
  )
}

// ------------------------------------------------------------- movie scores

/** Map<amcId, {rt, rtSlug}> — overlaid on the scores baked into the data files. */
export async function getMovieScores(sb) {
  const { data, error } = await sb.from('movie_scores').select('amc_id, rt_score, rt_slug')
  if (error) throw error
  return new Map(
    (data || []).map((r) => [String(r.amc_id), { rt: r.rt_score ?? null, rtSlug: r.rt_slug ?? null }])
  )
}

// -------------------------------------------------------------- push tokens

export async function registerPushToken(sb, expoToken, { platform, deviceLabel } = {}) {
  const { data: { user } } = await sb.auth.getUser()
  const { error } = await sb
    .from('push_tokens')
    .upsert(
      { user_id: user.id, expo_token: expoToken, platform, device_label: deviceLabel },
      { onConflict: 'expo_token' }
    )
  if (error) throw error
}

export async function listPushTokens(sb) {
  const { data, error } = await sb
    .from('push_tokens')
    .select('id, platform, device_label, created_at')
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function removePushToken(sb, id) {
  const { error } = await sb.from('push_tokens').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------- web push

/** `subscription` is `PushSubscription.toJSON()`: { endpoint, keys: { p256dh, auth } }. */
export async function saveWebPushSubscription(sb, subscription, { userAgent } = {}) {
  const { data: { user } } = await sb.auth.getUser()
  const { error } = await sb
    .from('web_push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent,
      },
      { onConflict: 'endpoint' }
    )
  if (error) throw error
}

export async function listWebPushSubscriptions(sb) {
  const { data, error } = await sb
    .from('web_push_subscriptions')
    .select('id, endpoint, user_agent, created_at')
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function removeWebPushSubscription(sb, id) {
  const { error } = await sb.from('web_push_subscriptions').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------------- admin
// All of these only work for the hardcoded admin email — enforced by RLS
// (supabase/migrations/0005_admin_rls.sql), not by anything in this file.

export async function listAllProfiles(sb) {
  const { data, error } = await sb
    .from('profiles')
    .select('id, email, display_name, status, snipe_cap, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function updateUserStatus(sb, userId, status) {
  const { error } = await sb.from('profiles').update({ status }).eq('id', userId)
  if (error) throw error
}

export async function updateUserSnipeCap(sb, userId, snipeCap) {
  const { error } = await sb.from('profiles').update({ snipe_cap: snipeCap }).eq('id', userId)
  if (error) throw error
}

export async function getAppSettings(sb) {
  const { data, error } = await sb.from('app_settings').select('*').single()
  if (error) throw error
  return data
}

export async function updateAppSettings(sb, settings) {
  const { data, error } = await sb
    .from('app_settings')
    .update(settings)
    .eq('id', true)
    .select()
    .single()
  if (error) throw error
  return data
}
