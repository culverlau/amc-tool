import { useEffect, useState } from 'react'
import { searchTheaters, followTheater, unfollowTheater } from '@amc/shared'
import { supabase } from '../supabase'

export default function TheaterPicker({ followed, onFollowedChange, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(null) // amc_id currently being toggled

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    searchTheaters(supabase, query)
      .then((r) => { if (!cancelled) setResults(r) })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query])

  const followedIds = new Set(followed.map((t) => t.amc_id))

  async function toggle(theater) {
    setPending(theater.amc_id)
    try {
      if (followedIds.has(theater.amc_id)) {
        await unfollowTheater(supabase, theater.amc_id)
        onFollowedChange(followed.filter((t) => t.amc_id !== theater.amc_id))
      } else {
        await followTheater(supabase, theater.amc_id)
        onFollowedChange([...followed, theater])
      }
    } catch (e) {
      console.error('[theaters] toggle failed', e)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      <header className="flex items-center gap-4 px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm transition-colors">
          ← Back
        </button>
        <div className="flex-1">
          <h2 className="text-white font-semibold text-base">Theaters</h2>
          <p className="text-gray-500 text-xs">
            {followed.length === 0 ? 'Follow a theater to see showtimes' : `Following ${followed.length}`}
          </p>
        </div>
      </header>

      <div className="p-4 border-b border-gray-800 flex-shrink-0">
        <input
          type="text"
          autoFocus
          placeholder="Search by theater, city, or state..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-gray-800 text-sm text-gray-200 placeholder-gray-500 px-3 py-2.5 rounded-lg border border-transparent focus:border-gray-600 focus:outline-none"
        />
      </div>

      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
        <div className="max-w-2xl mx-auto w-full p-4 space-y-1.5">
          {loading && results.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-8">Searching...</p>
          )}
          {!loading && results.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-8">No theaters found.</p>
          )}
          {results.map((t) => {
            const isFollowed = followedIds.has(t.amc_id)
            return (
              <button
                key={t.amc_id}
                onClick={() => toggle(t)}
                disabled={pending === t.amc_id}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                  isFollowed ? 'bg-red-900/20 border border-red-800/40' : 'bg-gray-900 border border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{t.name}</p>
                  <p className="text-gray-500 text-xs">{[t.city, t.state].filter(Boolean).join(', ')}</p>
                </div>
                <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg ${
                  isFollowed ? 'text-red-300' : 'text-gray-500'
                }`}>
                  {isFollowed ? 'Following' : 'Follow'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
