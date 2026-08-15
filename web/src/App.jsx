import { useState, useEffect, useMemo } from 'react'
import FilterBar from './components/FilterBar'
import MovieCard from './components/MovieCard'
import StarDialog from './components/StarDialog'
import WatchlistPanel from './components/WatchlistPanel'
import TheaterPicker from './components/TheaterPicker'
import Settings from './components/Settings'
import Onboarding from './components/Onboarding'
import Admin from './components/Admin'
import LegendModal from './components/Legend'
import { SignInScreen, WaitlistScreen, LoadingScreen } from './components/AuthGate'
import { useAuth } from './useAuth'
import { supabase, SUPABASE_URL } from './supabase'
import { ADMIN_EMAIL } from './config'
import {
  getFollowedTheaters,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getMovieScores,
  loadShowtimeData,
} from '@amc/shared'

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}

function hashToView(hash) {
  if (hash === '#watchlist') return 'watchlist'
  if (hash === '#theaters') return 'theaters'
  if (hash === '#settings') return 'settings'
  if (hash === '#admin') return 'admin'
  return 'main'
}

export default function App() {
  const { loading, session, profile, setProfile, signInWithGoogle, signOut } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <SignInScreen onSignIn={signInWithGoogle} />
  if (!profile) return <LoadingScreen />
  if (profile.status === 'waitlisted') return <WaitlistScreen onSignOut={signOut} />
  if (!profile.onboarded_at) return <Onboarding profile={profile} onDone={setProfile} />

  return <MainApp initialProfile={profile} onSignOut={signOut} onRestartOnboarding={setProfile} />
}

function MainApp({ initialProfile, onSignOut, onRestartOnboarding }) {
  const [profile, setProfile] = useState(initialProfile)
  const [followedTheaters, setFollowedTheaters] = useState(null) // null = still loading
  const [data, setData] = useState(null)
  const [dataStatus, setDataStatus] = useState('loading') // 'loading' | 'ok' | 'error'
  const [failedTheaters, setFailedTheaters] = useState([])
  const [watchlistItems, setWatchlistItems] = useState([])
  const [movieScores, setMovieScores] = useState(null)
  const [pendingShowtime, setPendingShowtime] = useState(null)
  const [view, setView] = useState(() => hashToView(window.location.hash))
  const [legendOpen, setLegendOpen] = useState(false)

  // Keep view in sync with the URL hash (back/forward button, direct links)
  useEffect(() => {
    const sync = () => setView(hashToView(window.location.hash))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  function goTo(hash) {
    window.location.hash = hash
  }
  function closeOverlay() {
    // Strip the hash without leaving a bare "#" or a dangling history entry
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setView('main')
  }

  useEffect(() => {
    getFollowedTheaters(supabase)
      .then(setFollowedTheaters)
      .catch((e) => { console.error('[theaters] load failed', e); setFollowedTheaters([]) })
  }, [])

  function reloadWatchlist() {
    return getWatchlist(supabase).then(setWatchlistItems).catch((e) => console.error('[watchlist] reload failed', e))
  }
  useEffect(() => { reloadWatchlist() }, [])

  useEffect(() => {
    getMovieScores(supabase).then(setMovieScores).catch(() => setMovieScores(new Map()))
  }, [])

  // Reload showtime data whenever the set of followed theaters changes
  useEffect(() => {
    if (followedTheaters === null) return
    if (followedTheaters.length === 0) {
      setData({ lastUpdated: null, theaters: {}, movies: [] })
      setDataStatus('ok')
      return
    }
    setDataStatus('loading')
    loadShowtimeData(SUPABASE_URL, followedTheaters.map((t) => t.amc_id))
      .then(({ data: merged, failed }) => {
        setData(merged)
        setFailedTheaters(failed)
        setDataStatus('ok')
      })
      .catch((e) => { console.error('[data] load failed', e); setDataStatus('error') })
  }, [followedTheaters])

  const watchlistSet = useMemo(
    () => new Set(watchlistItems.map((i) => String(i.showtime_id))),
    [watchlistItems]
  )

  function handleToggleStar(showtime) {
    const id = String(showtime.showtimeId)
    if (watchlistSet.has(id)) {
      setWatchlistItems((prev) => prev.filter((i) => String(i.showtime_id) !== id))
      removeFromWatchlist(supabase, showtime.showtimeId).catch((e) => {
        console.error('[watchlist] remove failed', e)
        reloadWatchlist()
      })
    } else {
      setPendingShowtime(showtime)
    }
  }

  // Throws on failure (e.g. snipe cap reached) — StarDialog shows the error
  // and keeps itself open rather than this function swallowing it.
  async function confirmStar(zone) {
    const s = pendingShowtime
    const added = await addToWatchlist(supabase, s, zone)
    setWatchlistItems((prev) => [...prev, { ...added, availableSeats: null, soldOut: null, scrapedAt: null }])
    setPendingShowtime(null)
  }

  function handleRemoveFromWatchlist(showtimeId) {
    setWatchlistItems((prev) => prev.filter((i) => i.showtime_id !== showtimeId))
    removeFromWatchlist(supabase, showtimeId).catch((e) => {
      console.error('[watchlist] remove failed', e)
      reloadWatchlist()
    })
  }

  const [filters, setFilters] = useState({ theaters: [], formats: [], languages: [], search: '' })

  const allFormats = useMemo(
    () => (data ? [...new Set(data.movies.flatMap((m) => m.formats))].sort() : []),
    [data]
  )
  const allLanguages = useMemo(
    () => (data ? [...new Set(data.movies.flatMap((m) => m.languages))].sort() : []),
    [data]
  )

  const filteredMovies = useMemo(() => {
    if (!data) return []
    return data.movies.filter((movie) => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!movie.name.toLowerCase().includes(q)) return false
      }
      if (filters.languages.length > 0) {
        if (!filters.languages.some((l) => movie.languages.includes(l))) return false
      }
      // Theater + format filtering happens inside MovieCard (it returns null if empty)
      return true
    })
  }, [data, filters])

  function formatUpdated(iso) {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  }

  const hasTheaters = (followedTheaters?.length ?? 0) > 0

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="px-4 pt-6 pb-4 max-w-5xl mx-auto">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">NYC Showtimes</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {followedTheaters === null
                ? ' '
                : hasTheaters
                  ? followedTheaters.map((t) => t.name.replace(/^AMC /, '')).join(' · ')
                  : 'Follow a theater to get started'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {data?.lastUpdated && (
              <p className="text-xs text-gray-600">
                Updated {formatUpdated(data.lastUpdated)}
              </p>
            )}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLegendOpen(true)}
                title="What the icons mean"
                className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Key
              </button>
              <button
                onClick={() => goTo('theaters')}
                className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Theaters
              </button>
              <button
                onClick={() => goTo('settings')}
                className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Settings
              </button>
              {profile.email === ADMIN_EMAIL && (
                <button
                  onClick={() => goTo('admin')}
                  className="text-sm px-3 py-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  Admin
                </button>
              )}
              <button
                onClick={() => goTo('watchlist')}
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
        </div>
      </header>

      {/* Filter bar */}
      {dataStatus === 'ok' && data && hasTheaters && (
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
        {followedTheaters === null && (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Spinner />
          </div>
        )}

        {followedTheaters !== null && !hasTheaters && (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">No theaters followed yet.</p>
            <button
              onClick={() => goTo('theaters')}
              className="mt-4 text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-4 py-2 rounded-lg"
            >
              Follow a theater
            </button>
          </div>
        )}

        {hasTheaters && dataStatus === 'loading' && (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Spinner />
            Loading screenings...
          </div>
        )}

        {hasTheaters && dataStatus === 'error' && (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">Showtimes not loaded yet.</p>
            <p className="text-gray-600 text-sm mt-2">Try reloading in a few minutes.</p>
          </div>
        )}

        {hasTheaters && dataStatus === 'ok' && failedTheaters.length > 0 && (
          <p className="text-center text-xs text-gray-600 mb-4">
            Still fetching {failedTheaters.length} newly-followed theater — check back within a few hours.
          </p>
        )}

        {hasTheaters && dataStatus === 'ok' && filteredMovies.length === 0 && (
          <div className="text-center py-24 text-gray-500">
            No movies match your filters.
          </div>
        )}

        {hasTheaters && dataStatus === 'ok' && (
          <div className="space-y-3">
            {filteredMovies.map((movie) => {
              const live = movieScores?.get(String(movie.id))
              const merged = live
                ? { ...movie, scores: { ...movie.scores, ...live } }
                : movie
              return (
                <MovieCard
                  key={movie.id}
                  movie={merged}
                  filters={filters}
                  watchlist={watchlistSet}
                  onToggleStar={handleToggleStar}
                  theaterNames={data.theaters}
                />
              )
            })}
          </div>
        )}

        {hasTheaters && dataStatus === 'ok' && (
          <p className="text-center text-xs text-gray-700 mt-8 pb-4">
            {data.movies.length} movies
          </p>
        )}
      </main>

      {pendingShowtime && (
        <StarDialog
          showtime={pendingShowtime}
          defaultZone={profile}
          onConfirm={confirmStar}
          onCancel={() => setPendingShowtime(null)}
        />
      )}

      {view === 'watchlist' && (
        <WatchlistPanel
          items={watchlistItems}
          theaterNames={data?.theaters || {}}
          onRemove={handleRemoveFromWatchlist}
          onClose={closeOverlay}
        />
      )}

      {view === 'theaters' && (
        <TheaterPicker
          followed={followedTheaters || []}
          onFollowedChange={setFollowedTheaters}
          onClose={closeOverlay}
        />
      )}

      {view === 'settings' && (
        <Settings
          profile={profile}
          onProfileChange={setProfile}
          onClose={closeOverlay}
          onSignOut={onSignOut}
          onRestartOnboarding={onRestartOnboarding}
        />
      )}

      {view === 'admin' && profile.email === ADMIN_EMAIL && (
        <Admin onClose={closeOverlay} />
      )}

      {legendOpen && <LegendModal onClose={() => setLegendOpen(false)} />}
    </div>
  )
}
