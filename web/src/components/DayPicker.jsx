import { useState, useRef, useEffect } from 'react'

// Dates are 'YYYY-MM-DD' strings in theater-local time, so everything here
// works on those strings / local Date parts — never UTC (toISOString would shift days).
const pad = (n) => String(n).padStart(2, '0')
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function CalendarIcon() {
  return (
    <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
    </svg>
  )
}

function Chevron({ dir }) {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={dir === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}

// dates: sorted list of days that have showtimes; picking is limited to its range.
export default function DayPicker({ dates, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const min = dates[0]
  const max = dates[dates.length - 1]
  const today = toStr(new Date())

  const [month, setMonth] = useState(() => parse(value || min || today))

  useEffect(() => {
    if (!open) return
    setMonth(parse(value || (min && min > today ? min : today)))
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!min) return null

  const inRange = (s) => s >= min && s <= max
  const year = month.getFullYear()
  const mo = month.getMonth()
  const firstDow = new Date(year, mo, 1).getDay()
  const daysInMonth = new Date(year, mo + 1, 0).getDate()
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const canPrev = toStr(new Date(year, mo, 0)) >= min
  const canNext = toStr(new Date(year, mo + 1, 1)) <= max

  const tomorrow = toStr(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1))
  const now = new Date()
  const toSat = (6 - now.getDay() + 7) % 7
  const saturday = toStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + toSat))
  const shortcuts = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: tomorrow },
    { label: 'Saturday', date: saturday },
  ].filter((s) => inRange(s.date))

  function pick(s) { onChange(s); setOpen(false) }

  const label = value
    ? parse(value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Any day'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          value ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
      >
        <CalendarIcon />
        {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 sm:hidden" />
          <div
            role="dialog"
            aria-label="Choose a day"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-gray-900 border-t border-gray-700 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]
                       sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1.5 sm:w-80 sm:rounded-xl sm:border sm:shadow-2xl"
          >
            {shortcuts.length > 0 && (
              <div className="flex gap-2 mb-3">
                {shortcuts.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => pick(s.date)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      value === s.date ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setMonth(new Date(year, mo - 1, 1))}
                disabled={!canPrev}
                aria-label="Previous month"
                className="w-10 h-10 flex items-center justify-center rounded-full text-gray-300 hover:bg-gray-800 disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <Chevron dir="left" />
              </button>
              <div className="text-sm font-semibold text-gray-100">
                {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <button
                onClick={() => setMonth(new Date(year, mo + 1, 1))}
                disabled={!canNext}
                aria-label="Next month"
                className="w-10 h-10 flex items-center justify-center rounded-full text-gray-300 hover:bg-gray-800 disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <Chevron dir="right" />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-xs text-gray-500 mb-1">
              {WEEKDAYS.map((d, i) => <div key={i} className="py-1">{d}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center">
              {cells.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />
                const s = `${year}-${pad(mo + 1)}-${pad(day)}`
                const enabled = inRange(s)
                const selected = s === value
                return (
                  <button
                    key={s}
                    onClick={() => pick(s)}
                    disabled={!enabled}
                    aria-pressed={selected}
                    className={`mx-auto w-10 h-10 rounded-full text-sm transition-colors ${
                      selected
                        ? 'bg-red-700 text-white font-semibold'
                        : enabled
                          ? `text-gray-100 hover:bg-gray-800 ${s === today ? 'ring-1 ring-gray-500' : ''}`
                          : 'text-gray-700 cursor-default'
                    }`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>

            {value && (
              <button
                onClick={() => pick('')}
                className="mt-3 w-full text-center text-xs text-gray-400 hover:text-white py-2"
              >
                Clear day
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
