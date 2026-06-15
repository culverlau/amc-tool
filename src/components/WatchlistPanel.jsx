export default function WatchlistPanel({ items, movieNames = {}, onRemove, onClose }) {
  function parseLabel(name) {
    const parts = (name || '').split(' · ')
    // New format: movieName · theaterName · date · time · format (5 parts)
    // Old format: theaterName · date · time · format (4 parts)
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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">Watchlist</h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {items.length === 0 ? 'Nothing monitored' : `${items.length} showing${items.length !== 1 ? 's' : ''} monitored`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {items.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm">No showtimes being watched.</p>
              <p className="text-gray-600 text-xs mt-1">
                Star a Lincoln Square IMAX showing to start monitoring seats.
              </p>
            </div>
          ) : (
            items.map(item => {
              const parsed = parseLabel(item.name)
              const movieName = movieNames[String(item.showtimeId)] || parsed?.movieName || ''
              return (
                <div key={item.showtimeId} className="bg-gray-800 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {parsed ? (
                      <>
                        {movieName && (
                          <p className="text-white text-sm font-medium leading-tight">{movieName}</p>
                        )}
                        <p className={`text-xs mt-0.5 ${movieName ? 'text-gray-400' : 'text-white font-medium'}`}>
                          {parsed.theater} · {parsed.dateStr} · {parsed.timeStr} · {parsed.format}
                        </p>
                      </>
                    ) : (
                      <p className="text-gray-400 text-sm">Showing #{item.showtimeId}</p>
                    )}
                    <p className="text-gray-600 text-xs mt-1">
                      Rows {item.rowMin}–{item.rowMax} · Seats {item.seatMin}–{item.seatMax}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemove(item.showtimeId)}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors flex-shrink-0 mt-0.5 py-1 px-2 rounded hover:bg-gray-700"
                  >
                    Remove
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-800 flex-shrink-0">
          <p className="text-xs text-gray-600 text-center">
            Checked every 5 min · Notifications via ntfy.sh
          </p>
        </div>
      </div>
    </div>
  )
}
