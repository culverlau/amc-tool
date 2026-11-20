// Day filter: a styled button (icon + label) with a real, native <input type="date">
// stretched invisibly over it. A tap lands on the actual input, so the OS opens its own
// calendar — on every platform, with no JS positioning — while we control how it looks.
// Dates are 'YYYY-MM-DD' strings in theater-local time; never go through UTC.
function CalendarIcon() {
  return (
    <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
    </svg>
  )
}

function formatDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// dates: sorted list of days that have showtimes; picking is limited to its range.
export default function DayPicker({ dates, value, onChange }) {
  const min = dates[0]
  const max = dates[dates.length - 1]
  if (!min) return null

  return (
    <div className="flex items-center gap-1">
      <div
        className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          value ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
      >
        <CalendarIcon />
        {value ? formatDay(value) : 'Any day'}
        <input
          type="date"
          aria-label="Choose a day"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          // text-base (16px) stops iOS from zooming the page when the picker opens
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-base"
        />
      </div>
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear day"
          className="text-gray-500 hover:text-gray-300 w-8 h-8 text-lg leading-none"
        >
          ×
        </button>
      )}
    </div>
  )
}
