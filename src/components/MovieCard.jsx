import { useState } from 'react'

const THEATER_ORDER = [2116, 2120, 552, 2195]
const THEATER_SHORT = {
  2116: 'Lincoln Square 13',
  2120: '34th Street 14',
  552: 'Empire 25',
  2195: 'Kips Bay 15',
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDateLabel(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    short: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

function formatShort(fmt) {
  if (fmt.includes('IMAX')) return 'IMAX'
  if (fmt.includes('Dolby')) return 'Dolby'
  if (fmt.includes('Laser')) return 'Laser'
  if (fmt.includes('70mm')) return '70mm'
  if (fmt.includes('ScreenX')) return 'ScreenX'
  if (fmt.includes('4DX')) return '4DX'
  return null
}

function formatBadgeColor(fmt) {
  if (fmt.includes('IMAX')) return 'bg-blue-900/60 text-blue-300 border-blue-700/50'
  if (fmt.includes('Dolby')) return 'bg-purple-900/60 text-purple-300 border-purple-700/50'
  if (fmt.includes('70mm')) return 'bg-amber-900/60 text-amber-300 border-amber-700/50'
  if (fmt.includes('Laser')) return 'bg-cyan-900/60 text-cyan-300 border-cyan-700/50'
  return 'bg-gray-800 text-gray-400 border-gray-700/50'
}

function runtimeStr(minutes) {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function MovieCard({ movie, filters, watchlist, onToggleStar }) {
  // selection: null | { type: 'date', key: string } | { type: 'theater', key: number }
  const [selection, setSelection] = useState(null)
  const [imgError, setImgError] = useState(false)

  const byDate = {}
  for (const s of movie.screenings) {
    if (filters.theaters.length > 0 && !filters.theaters.includes(String(s.theaterId))) continue
    if (filters.formats.length > 0 && !filters.formats.includes(s.format)) continue
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  }

  const dates = Object.keys(byDate).sort()
  if (dates.length === 0) return null

  const theaterIds = THEATER_ORDER.filter(id =>
    Object.values(byDate).some(shows => shows.some(s => s.theaterId === id))
  )

  function handleDateClick(date) {
    setSelection(prev =>
      prev?.type === 'date' && prev.key === date ? null : { type: 'date', key: date }
    )
  }

  function handleTheaterClick(theaterId) {
    setSelection(prev =>
      prev?.type === 'theater' && prev.key === theaterId ? null : { type: 'theater', key: theaterId }
    )
  }

  function renderShowtime(s) {
    const fmtShort = formatShort(s.format)
    const isLincolnImax = s.theaterId === 2116 && s.format.includes('IMAX')
    const starred = isLincolnImax && watchlist?.has(String(s.showtimeId))
    const starBtn = isLincolnImax ? (
      <button
        key={`star-${s.showtimeId}`}
        onClick={() => onToggleStar?.({ ...s, movieName: movie.name })}
        title={starred ? 'Remove from sniper watchlist' : 'Add to sniper watchlist'}
        className={`text-base leading-none transition-colors ${starred ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}
      >
        {starred ? '★' : '☆'}
      </button>
    ) : null

    if (s.isSoldOut) {
      return (
        <div key={s.showtimeId} className="flex items-center gap-1">
          <span className="text-sm px-3 py-1.5 rounded-lg bg-gray-800/50 text-gray-600 line-through cursor-not-allowed inline-flex items-center gap-1.5">
            {formatTime(s.time)}
            {fmtShort && <span className="text-[10px] font-medium text-gray-700">{fmtShort}</span>}
          </span>
          {starBtn}
        </div>
      )
    }
    return (
      <div key={s.showtimeId} className="flex items-center gap-1">
        <a
          href={s.purchaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-sm px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 ${
            s.isAlmostSoldOut
              ? 'bg-orange-900/40 text-orange-300 border border-orange-800/60 hover:bg-orange-800/50'
              : 'bg-gray-800 text-white hover:bg-red-700 hover:shadow-md hover:shadow-red-900/30'
          }`}
        >
          {formatTime(s.time)}
          {fmtShort && (
            <span className={`text-[10px] font-medium ${s.isAlmostSoldOut ? 'text-orange-400' : 'text-gray-400'}`}>
              {fmtShort}
            </span>
          )}
          {s.isAlmostSoldOut && <span className="text-[10px] text-orange-400">!</span>}
        </a>
        {starBtn}
      </div>
    )
  }

  const activeDate = selection?.type === 'date' ? selection.key : null
  const activeTheater = selection?.type === 'theater' ? selection.key : null

  return (
    <article className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800/60 hover:border-gray-700 transition-colors">
      <div className="flex">
        {/* Poster */}
        <div className="flex-shrink-0 w-20 sm:w-28 bg-gray-800 self-stretch">
          {movie.poster && !imgError ? (
            <img
              src={movie.poster}
              alt={movie.name}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-2 min-h-[120px]">
              <span className="text-gray-600 text-xs text-center leading-tight">{movie.name}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base sm:text-lg font-bold text-white leading-tight">{movie.name}</h2>
            {movie.mpaaRating && (
              <span className="flex-shrink-0 text-xs border border-gray-600 px-1.5 py-0.5 text-gray-400 rounded">
                {movie.mpaaRating}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-gray-500">
            {movie.releaseYear && <span>{movie.releaseYear}</span>}
            {movie.genre && (
              <>
                {movie.releaseYear && <span>·</span>}
                <span>{movie.genre.charAt(0) + movie.genre.slice(1).toLowerCase()}</span>
              </>
            )}
            {runtimeStr(movie.runTime) && (
              <>
                {(movie.releaseYear || movie.genre) && <span>·</span>}
                <span>{runtimeStr(movie.runTime)}</span>
              </>
            )}
            {movie.scores?.rt != null && (
              <>
                <span>·</span>
                <span className={movie.scores.rt >= 60 ? 'text-red-400' : 'text-yellow-600'}>
                  🍅 {movie.scores.rt}%
                </span>
              </>
            )}
            <>
              <span>·</span>
              <a
                href={movie.scores?.rtSlug
                  ? `https://www.rottentomatoes.com${movie.scores.rtSlug}`
                  : `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-500 hover:text-red-400"
              >
                RT ↗
              </a>
            </>
            {movie.languages.length > 0 && !movie.languages.includes('English') && (
              <>
                <span>·</span>
                <span className="text-amber-500">{movie.languages.join(', ')}</span>
              </>
            )}
          </div>

          {/* Format badges */}
          <div className="flex flex-wrap gap-1 mt-2">
            {movie.formats.filter(f => f !== 'Standard').map(fmt => (
              <span
                key={fmt}
                className={`text-xs px-2 py-0.5 rounded border ${formatBadgeColor(fmt)}`}
              >
                {formatShort(fmt) || fmt}
              </span>
            ))}
            {movie.formats.includes('Standard') && (
              <span className="text-xs px-2 py-0.5 rounded border bg-gray-800 text-gray-500 border-gray-700/50">
                Standard
              </span>
            )}
          </div>

          {/* Date pills */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {dates.map(date => {
              const { weekday, short } = formatDateLabel(date)
              const count = byDate[date].length
              const isSelected = activeDate === date
              return (
                <button
                  key={date}
                  onClick={() => handleDateClick(date)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg transition-all font-medium ${
                    isSelected
                      ? 'bg-red-600 text-white shadow-lg shadow-red-900/40'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <span className="opacity-70">{weekday} </span>
                  {short}
                  <span className={`ml-1 text-[10px] ${isSelected ? 'text-red-200' : 'text-gray-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Theater pills */}
          {theaterIds.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {theaterIds.map(id => {
                const isSelected = activeTheater === id
                return (
                  <button
                    key={id}
                    onClick={() => handleTheaterClick(id)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg transition-all font-medium ${
                      isSelected
                        ? 'bg-blue-700 text-white shadow-lg shadow-blue-900/40'
                        : 'bg-gray-800/60 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
                    }`}
                  >
                    {THEATER_SHORT[id]}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Expanded: by date — shows theaters for that date */}
      {activeDate && (
        <div className="border-t border-gray-800 bg-gray-900/50 px-4 py-4">
          <div className="space-y-4">
            {THEATER_ORDER.map(theaterId => {
              const shows = byDate[activeDate]
                .filter(s => s.theaterId === theaterId)
                .sort((a, b) => a.time.localeCompare(b.time))
              if (shows.length === 0) return null
              return (
                <div key={theaterId}>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {THEATER_SHORT[theaterId]}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {shows.map(s => renderShowtime(s))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Expanded: by theater — shows all dates for that theater */}
      {activeTheater && (() => {
        const dateRows = dates
          .map(date => ({
            date,
            shows: byDate[date]
              .filter(s => s.theaterId === activeTheater)
              .sort((a, b) => a.time.localeCompare(b.time)),
          }))
          .filter(({ shows }) => shows.length > 0)

        return (
          <div className="border-t border-gray-800 bg-gray-900/50 px-4 py-4">
            <div className="space-y-3">
              {dateRows.map(({ date, shows }) => {
                const { weekday, short } = formatDateLabel(date)
                return (
                  <div key={date} className="flex gap-3 items-start">
                    <div className="text-xs text-gray-500 w-16 flex-shrink-0 pt-1.5 font-medium">
                      <span className="opacity-70">{weekday} </span>{short}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {shows.map(s => renderShowtime(s))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </article>
  )
}
