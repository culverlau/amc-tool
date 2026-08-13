import { theaterDataUrl } from './supabase.js'

/**
 * Showtime data is one JSON file per theater in a public Storage bucket, so a
 * client downloads only the theaters its user actually follows. This merges
 * those files back into the single shape the UI already consumes:
 *   { lastUpdated, theaters: {id: name}, movies: [{..., screenings: []}] }
 *
 * Returns { data, failed } — `failed` lists theaters whose file was missing or
 * unreadable, which is normal for a theater followed before its first fetch.
 */
export async function loadShowtimeData(supabaseUrl, amcIds) {
  const results = await Promise.all(
    (amcIds || []).map(async (id) => {
      try {
        const res = await fetch(theaterDataUrl(supabaseUrl, id), { cache: 'no-cache' })
        if (!res.ok) return { id, error: `HTTP ${res.status}` }
        return { id, json: await res.json() }
      } catch (e) {
        return { id, error: String(e) }
      }
    })
  )

  const failed = results.filter((r) => r.error).map((r) => r.id)
  const loaded = results.filter((r) => r.json).map((r) => r.json)

  return { data: mergeTheaterData(loaded), failed }
}

export function mergeTheaterData(files) {
  const theaters = {}
  const byMovieId = new Map()
  let lastUpdated = null

  for (const file of files) {
    if (!file) continue
    if (file.lastUpdated && (!lastUpdated || file.lastUpdated < lastUpdated)) {
      // Report the *oldest* file so a stale theater is visible rather than hidden.
      lastUpdated = file.lastUpdated
    }
    Object.assign(theaters, file.theaters || {})

    for (const movie of file.movies || []) {
      const existing = byMovieId.get(movie.id)
      if (!existing) {
        byMovieId.set(movie.id, { ...movie, screenings: [...(movie.screenings || [])] })
        continue
      }
      existing.screenings.push(...(movie.screenings || []))
      existing.formats = [...new Set([...(existing.formats || []), ...(movie.formats || [])])]
      existing.languages = [...new Set([...(existing.languages || []), ...(movie.languages || [])])]
    }
  }

  const movies = [...byMovieId.values()]
  for (const m of movies) {
    m.screenings.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))
  }

  return { lastUpdated, theaters, movies }
}
