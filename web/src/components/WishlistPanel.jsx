import { useEffect, useState } from 'react'

function formatStartsAt(iso) {
  const d = new Date(iso)
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${dateStr}, ${timeStr}`
}

function Poster({ src, name }) {
  const [error, setError] = useState(false)
  return (
    <div className="w-12 h-[72px] flex-shrink-0 bg-gray-800 rounded-lg overflow-hidden">
      {src && !error && (
        <img src={src} alt={name} className="w-full h-full object-cover" onError={() => setError(true)} />
      )}
    </div>
  )
}

export default function WishlistPanel({ items, movies = [], onRemove, onSelect, onClose }) {
  // Lock the page behind from scrolling while the wishlist is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const moviesById = new Map(movies.map((m) => [String(m.id), m]))
  const now = Date.now()

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm transition-colors"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h2 className="text-white font-semibold text-base">Wishlist</h2>
          <p className="text-gray-500 text-xs">
            {items.length === 0 ? 'No movies saved' : `${items.length} movie${items.length !== 1 ? 's' : ''} · pinned to the top of your showtimes`}
          </p>
        </div>
      </header>

      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
        <div className="p-4 max-w-2xl mx-auto w-full space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-sm">No movies on your wishlist.</p>
            <p className="text-gray-600 text-xs mt-1">
              Tap ♡ on a movie to save it here.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const movie = moviesById.get(item.movie_id)
            const upcoming = movie ? movie.screenings.filter((s) => new Date(s.startsAt).getTime() > now) : []
            const playing = upcoming.length > 0

            return (
              <div key={item.movie_id} className="bg-gray-900 border border-gray-800 rounded-2xl p-3 flex items-center gap-3">
                <button
                  onClick={() => playing && onSelect(item.movie_id)}
                  disabled={!playing}
                  className={`flex items-center gap-3 flex-1 min-w-0 text-left ${playing ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <Poster src={movie?.poster || item.poster} name={item.movie_name} />
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-base leading-tight">{movie?.name || item.movie_name}</p>
                    <p className={`text-sm mt-0.5 ${playing ? 'text-gray-400' : 'text-gray-600'}`}>
                      {playing
                        ? `${upcoming.length} showtime${upcoming.length !== 1 ? 's' : ''} · next ${formatStartsAt(upcoming[0].startsAt)}`
                        : 'Not showing at your theaters'}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => onRemove(item.movie_id)}
                  className="text-gray-600 hover:text-red-400 text-xs transition-colors flex-shrink-0 py-1 px-2 rounded hover:bg-gray-800"
                >
                  Remove
                </button>
              </div>
            )
          })
        )}
        </div>
      </div>
    </div>
  )
}
