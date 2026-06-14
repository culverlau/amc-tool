import { useState, useEffect, useMemo } from 'react'
import FilterBar from './components/FilterBar'
import MovieCard from './components/MovieCard'

const BASE = import.meta.env.BASE_URL
const WATCHLIST_URL = 'https://script.google.com/macros/s/AKfycbxqX5--yrniT_ZrQz4WJ1CR9saTN5Q-VS9lDj7AvozqtWRiUF89Ig8ugot-b1HirfGt/exec'

export default function App() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ok' | 'error'
  const [watchlist, setWatchlist] = useState(new Set())

  useEffect(() => {
    fetch(WATCHLIST_URL)
      .then(r => r.json())
      .then(data => setWatchlist(new Set(data.map(item => String(item.showtimeId)))))
      .catch(() => {})
  }, [])

  function toggleStar(showtime) {
    const id = String(showtime.showtimeId)
    const wasStarred = watchlist.has(id)
    setWatchlist(prev => {
      const next = new Set(prev)
      wasStarred ? next.delete(id) : next.add(id)
      return next
    })
    const label = `${showtime.theaterName} · ${showtime.date} · ${showtime.time} · ${showtime.format}`
    fetch(WATCHLIST_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: wasStarred ? 'remove' : 'add', showtimeId: id, name: label }),
    })
  }

  const [filters, setFilters] = useState({
    theaters: [],
    formats: [],
    languages: [],
    search: '',
    hideWorldCup: true,
    hideEvents: true,
    hideNoAList: true,
  })

  useEffect(() => {
    fetch(`${BASE}data.json`)
      .then(r => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then(d => {
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
      if (filters.hideWorldCup && movie.isWorldCup) return false
      if (filters.hideEvents && movie.isFathom) return false
      if (filters.hideNoAList && movie.availableForAList === false) return false
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
          {data?.lastUpdated && (
            <p className="text-xs text-gray-600 text-right">
              Updated {formatUpdated(data.lastUpdated)}
            </p>
          )}
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
            {filteredMovies.map(movie => (
              <MovieCard
                key={movie.id}
                movie={movie}
                filters={filters}
                watchlist={watchlist}
                onToggleStar={toggleStar}
              />
            ))}
          </div>
        )}

        {status === 'ok' && data && (
          <p className="text-center text-xs text-gray-700 mt-8 pb-4">
            {data.movies.length} movies · refreshes every 6 hours
          </p>
        )}
      </main>
    </div>
  )
}
