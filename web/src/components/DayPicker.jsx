// Day filter: a plain native <select> of the days that have showtimes. The OS renders its
// own picker (wheel on iOS, menu on desktop), so there's no custom popup to position or break.
// Dates are 'YYYY-MM-DD' strings in theater-local time; never go through UTC.
function formatDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function CalendarIcon() {
  return (
    <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
    </svg>
  )
}

// dates: sorted list of days that have showtimes
export default function DayPicker({ dates, value, onChange }) {
  if (dates.length === 0) return null

  return (
    <div className="relative">
      <CalendarIcon />
      <select
        aria-label="Day"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // text-base on phones (16px) stops iOS zooming the page when the picker opens
        className={`appearance-none pl-9 pr-3 py-2 rounded-lg text-base sm:text-sm font-medium cursor-pointer focus:outline-none ${
          value ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
      >
        <option value="">Any day</option>
        {dates.map((d) => <option key={d} value={d}>{formatDay(d)}</option>)}
      </select>
    </div>
  )
}
