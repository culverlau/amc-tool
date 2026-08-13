import { useEffect } from 'react'

function formatStartsAt(iso) {
  const d = new Date(iso)
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return { dateStr, timeStr }
}

export default function WatchlistPanel({ items, theaterNames = {}, onRemove, onClose }) {
  // Lock the page behind from scrolling while the watchlist is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

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
          <h2 className="text-white font-semibold text-base">Watchlist</h2>
          <p className="text-gray-500 text-xs">
            {items.length === 0 ? 'Nothing monitored' : `${items.length} showing${items.length !== 1 ? 's' : ''} monitored · seats updated every 5 min`}
          </p>
        </div>
      </header>

      {/* Items — the full-width area below the header scrolls; content is
          centered inside it so scrolling over the side gutters works too. */}
      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
        <div className="p-4 max-w-2xl mx-auto w-full space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-sm">No showtimes being watched.</p>
            <p className="text-gray-600 text-xs mt-1">
              Star a showing to start monitoring seats.
            </p>
          </div>
        ) : (
          items.map(item => {
            const { dateStr, timeStr } = formatStartsAt(item.starts_at)
            const theaterName = (theaterNames[item.theater_id] || '').replace(/^AMC /, '')
            const seats = item.availableSeats

            return (
              <div key={item.showtime_id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-base leading-tight">{item.movie_name}</p>
                    <p className="text-gray-400 text-sm mt-0.5">
                      {[theaterName, dateStr, timeStr, item.format?.replace(' at AMC', '')].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemove(item.showtime_id)}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors flex-shrink-0 py-1 px-2 rounded hover:bg-gray-800"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-2">
                    Zone: rows {item.row_min}–{item.row_max} · seats {item.seat_min}–{item.seat_max}
                  </p>
                  {seats === null ? (
                    <p className="text-gray-600 text-sm">Seat data not yet available</p>
                  ) : seats.length === 0 ? (
                    <p className="text-gray-600 text-sm">No good seats open right now</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {seats.map(seat => (
                        <span
                          key={seat}
                          className="bg-green-500/15 text-green-400 text-xs font-mono font-medium px-2 py-1 rounded-lg"
                        >
                          {seat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
        </div>
      </div>
    </div>
  )
}
