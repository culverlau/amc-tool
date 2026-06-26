import { useState, useEffect, useMemo } from 'react'
import FilterBar from './components/FilterBar'
import MovieCard from './components/MovieCard'
import StarDialog from './components/StarDialog'
import WatchlistPanel from './components/WatchlistPanel'

const BASE = import.meta.env.BASE_URL
const WATCHLIST_URL = 'https://script.google.com/macros/s/AKfycbxqX5--yrniT_ZrQz4WJ1CR9saTN5Q-VS9lDj7AvozqtWRiUF89Ig8ugot-b1HirfGt/exec'

export default function App() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ok' | 'error'
  const [watchlistItems, setWatchlistItems] = useState([])
  const [liveRtScores, setLiveRtScores] = useState(null) // Map<amcId, {rt, rtSlug}>
  const [pendingShowtime, setPendingShowtime] = useState(null)
  const [view, setView] = useState('main') // 'main' | 'watchlist'

  const watchlist = useMemo(
    () => new Set(watchlistItems.map(i => String(i.showtimeId))),
    [watchlistItems]
  )

  // showtimeId → movie name, built from data.json for watchlist display
  const showtimeMovieNames = useMemo(() => {
    if (!data) return {}
    const map = {}
    for (const movie of data.movies) {
      for (const s of movie.screenings) {
        map[String(s.showtimeId)] = movie.name
      }
    }
    return map
  }, [data])

  useEffect(() => {
    console.log('[RT] fetching live scores from Sheets...')
    fetch(`${WATCHLIST_URL}?sheet=scores`)
      .then(r => {
        console.log('[RT] Sheets response status:', r.status)
        return r.json()
      })
      .then(items => {
        console.log('[RT] raw Sheets items:', items.length, 'entries')
        console.log('[RT] sample (first 5):', items.slice(0, 5))
        const map = new Map()
        for (const item of items) {
          if (item.amcId) {
            map.set(String(item.amcId), {
              rt: item.rtScore != null ? Number(item.rtScore) : null,
              rtSlug: item.rtSlug || null,
            })
          }
        }
        console.log('[RT] map built:', map.size, 'entries')
        // Log scored entries (non-null scores)
        const scored = [...map.entries()].filter(([, v]) => v.rt != null)
        console.log('[RT] entries with scores:', scored.length)
        console.log('[RT] scored sample:', scored.slice(0, 5))
        setLiveRtScores(map)
      })
      .catch(err => console.error('[RT] Sheets fetch failed:', err))
  }, [])

  useEffect(() => {
    fetch(WATCHLIST_URL)
      .then(r => r.json())
      .then(items => {
        const seen = new Set()
        const unique = []
        for (const i of items) {
          const id = String(i.showtimeId)
          if (!seen.has(id)) {
            seen.add(id)
            unique.push({
              showtimeId: id,
              name: i.name || '',
              rowMin: i.rowMin || 'E',
              rowMax: i.rowMax || 'L',
              seatMin: Number(i.seatMin) || 7,
              seatMax: Number(i.seatMax) || 36,
            })
          }
        }
        setWatchlistItems(unique.map(i => ({
          ...i,
          availableSeats: i.availableSeats || '',
        })))
      })
      .catch(() => {})
  }, [])

  function handleToggleStar(showtime) {
    const id = String(showtime.showtimeId)
    if (watchlist.has(id)) {
      setWatchlistItems(prev => prev.filter(i => i.showtimeId !== id))
      fetch(WATCHLIST_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', showtimeId: id }),
      })
    } else {
      setPendingShowtime(showtime)
    }
  }

  function confirmStar(zone) {
    const s = pendingShowtime
    const id = String(s.showtimeId)
    const name = `${s.movieName || ''} · ${s.theaterName} · ${s.date} · ${s.time} · ${s.format}`
    const item = { showtimeId: id, name, ...zone }
    setWatchlistItems(prev => [...prev, item])
    setPendingShowtime(null)
    fetch(WATCHLIST_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', showtimeId: id, name, ...zone }),
    })
  }

  function removeFromWatchlist(showtimeId) {
    const id = String(showtimeId)
    setWatchlistItems(prev => prev.filter(i => i.showtimeId !== id))
    fetch(WATCHLIST_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', showtimeId: id }),
    })
  }

  const [filters, setFilters] = useState({
    theaters: [],
    formats: [],
    languages: [],
    search: '',
  })

  useEffect(() => {
    fetch(`${BASE}data.json`)
      .then(r => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then(d => {
        console.log('[data.json] loaded', d.movies.length, 'movies')
        const withScores = d.movies.filter(m => m.scores?.rt != null)
        const withSlug   = d.movies.filter(m => m.scores?.rtSlug && m.scores?.rt == null)
        console.log('[data.json] movies with RT score:', withScores.length)
        console.log('[data.json] movies with slug but no score (NR):', withSlug.length)
        console.log('[data.json] movies with no RT info:', d.movies.length - withScores.length - withSlug.length)
        setData(d)
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }, [])

  const allFormats = useMemo(() => {
    if (!data) return []
    return [...new Set(data.movies.flatMap(m => m.formats))].sort()
  }, [data])

  const allLanguages = useMemo(() => {
    if (!data) return []
    return [...new Set(data.movies.flatMap(m => m.languages))].sort()
  }, [data])

  const filteredMovies = useMemo(() => {
    if (!data) return []
    return data.movies.filter(movie => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!movie.name.toLowerCase().includes(q)) return false
      }
      if (filters.languages.length > 0) {
        if (!filters.languages.some(l => movie.languages.includes(l))) return false
      }
      // Theater + format filtering happens inside MovieCard (it returns null if empty)
      return true
    })
  }, [data, filters])

  function formatUpdated(iso) {
    if (!iso) return null
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York', timeZoneName: 'short',
    })
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="px-4 pt-6 pb-4 max-w-5xl mx-auto">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">AMC NYC</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Lincoln Square · 34th Street · Empire 25 · Kips Bay
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {data?.lastUpdated && (
              <p className="text-xs text-gray-600">
                Updated {formatUpdated(data.lastUpdated)}
              </p>
            )}
            <a
              href="https://docs.google.com/spreadsheets/d/1H-yeRzrIi9p7y8VD09ioNSdBHxEeV-Xl55u5rIJRX0k/edit"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Sheets ↗
            </a>
            <button
              onClick={() => setView('watchlist')}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                watchlistItems.length > 0
                  ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>★</span>
              <span>Watchlist</span>
              {watchlistItems.length > 0 && (
                <span className="bg-yellow-500/20 text-yellow-400 text-xs font-medium px-1.5 py-0.5 rounded-full">
                  {watchlistItems.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Filter bar */}
      {status === 'ok' && data && (
        <FilterBar
          theaters={data.theaters}
          formats={allFormats}
          languages={allLanguages}
          filters={filters}
          onChange={setFilters}
        />
      )}

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {status === 'loading' && (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <svg className="animate-spin w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Loading screenings...
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">Showtimes not loaded yet.</p>
            <p className="text-gray-600 text-sm mt-2">
              Run the GitHub Actions workflow manually to fetch data, then reload.
            </p>
          </div>
        )}

        {status === 'ok' && filteredMovies.length === 0 && (
          <div className="text-center py-24 text-gray-500">
            No movies match your filters.
          </div>
        )}

        {status === 'ok' && (
          <div className="space-y-3">
            {filteredMovies.map(movie => {
              const live = liveRtScores?.get(String(movie.id))
              const merged = live
                ? { ...movie, scores: { ...movie.scores, ...live } }
                : movie
              if (live) {
                console.log(`[RT overlay] "${movie.name}" (id=${movie.id}) live=${JSON.stringify(live)} base=${JSON.stringify(movie.scores)}`)
              } else if (liveRtScores) {
                // Sheets loaded but no entry found for this movie
                console.log(`[RT miss] "${movie.name}" (id=${movie.id}) — not in Sheets map (base scores: ${JSON.stringify(movie.scores)})`)
              }
              return (
                <MovieCard
                  key={movie.id}
                  movie={merged}
                  filters={filters}
                  watchlist={watchlist}
                  onToggleStar={handleToggleStar}
                />
              )
            })}
          </div>
        )}

        {status === 'ok' && data && (
          <p className="text-center text-xs text-gray-700 mt-8 pb-4">
            {data.movies.length} movies · refreshes every 6 hours
          </p>
        )}
      </main>

      {pendingShowtime && (
        <StarDialog
          showtime={pendingShowtime}
          onConfirm={confirmStar}
          onCancel={() => setPendingShowtime(null)}
        />
      )}

      {view === 'watchlist' && (
        <WatchlistPanel
          items={watchlistItems}
          movieNames={showtimeMovieNames}
          onRemove={removeFromWatchlist}
          onClose={() => setView('main')}
        />
      )}
    </div>
  )
}
