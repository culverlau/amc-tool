export default function WatchlistPanel({ items, movieNames = {}, onRemove, onClose }) {
  function parseLabel(name) {
    const parts = (name || '').split(' · ')
    const offset = parts.length >= 5 ? 1 : 0
    if (parts.length >= 4) {
      const movieName = offset ? parts[0] : ''
      const theater = parts[offset].replace(/^AMC /, '')
      const [y, mo, d] = parts[offset + 1].split('-').map(Number)
      const date = new Date(y, mo - 1, d)
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const [h, m] = parts[offset + 2].split(':').map(Number)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const h12 = h % 12 || 12
      const timeStr = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
      const format = parts[offset + 3].replace(' at AMC', '')
      return { movieName, theater, dateStr, timeStr, format }
    }
    return null
  }

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

      {/* Items */}
      <div className="overflow-y-auto flex-1 p-4 max-w-2xl mx-auto w-full space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-sm">No showtimes being watched.</p>
            <p className="text-gray-600 text-xs mt-1">
              Star a Lincoln Square IMAX showing to start monitoring seats.
            </p>
          </div>
        ) : (
          items.map(item => {
            const parsed = parseLabel(item.name)
            const movieName = movieNames[String(item.showtimeId)] || parsed?.movieName || ''
            const seats = item.availableSeats != null
              ? item.availableSeats.split(',').map(s => s.trim()).filter(Boolean)
              : null

            return (
              <div key={item.showtimeId} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {movieName && (
                      <p className="text-white font-semibold text-base leading-tight">{movieName}</p>
                    )}
                    {parsed && (
                      <p className="text-gray-400 text-sm mt-0.5">
                        {parsed.theater} · {parsed.dateStr} · {parsed.timeStr} · {parsed.format}
                      </p>
                    )}
                    {!movieName && !parsed && (
                      <p className="text-gray-400 text-sm">Showing #{item.showtimeId}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onRemove(item.showtimeId)}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors flex-shrink-0 py-1 px-2 rounded hover:bg-gray-800"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-2">
                    Zone: rows {item.rowMin}–{item.rowMax} · seats {item.seatMin}–{item.seatMax}
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
  )
}
