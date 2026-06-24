import { useState, useRef, useEffect } from 'react'

// options: array of strings OR {value, label} objects
function getVal(opt) { return typeof opt === 'string' ? opt : opt.value }
function getLabel(opt) { return typeof opt === 'string' ? opt : opt.label }

function Dropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const count = selected.length
  const buttonLabel = count === 0 ? label : `${label} (${count})`

  function toggle(value) {
    onChange(
      selected.includes(value)
        ? selected.filter(v => v !== value)
        : [...selected, value]
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          count > 0
            ? 'bg-red-700 text-white'
            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`}
      >
        {buttonLabel}
        <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 min-w-max">
          {count > 0 && (
            <button
              onClick={() => { onChange([]); setOpen(false) }}
              className="w-full text-left px-4 py-2 text-xs text-gray-400 hover:text-white border-b border-gray-700 transition-colors"
            >
              Clear selection
            </button>
          )}
          {options.map(opt => {
            const val = getVal(opt)
            const lbl = getLabel(opt)
            return (
              <label
                key={val}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-700 cursor-pointer transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(val)}
                  onChange={() => toggle(val)}
                  className="accent-red-600 w-4 h-4 cursor-pointer"
                />
                <span className="text-sm text-gray-200">{lbl}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}


export default function FilterBar({ theaters, formats, languages, filters, onChange }) {
  const theaterOptions = Object.entries(theaters).map(([id, name]) => ({
    value: id,
    label: name.replace(/^AMC /, ''),
  }))

  return (
    <div className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-3">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-2">
        <Dropdown
          label="Theater"
          options={theaterOptions}
          selected={filters.theaters}
          onChange={v => onChange({ ...filters, theaters: v })}
        />

        <Dropdown
          label="Format"
          options={formats}
          selected={filters.formats}
          onChange={v => onChange({ ...filters, formats: v })}
        />

        <Dropdown
          label="Language"
          options={languages}
          selected={filters.languages}
          onChange={v => onChange({ ...filters, languages: v })}
        />

        <div className="flex-1 min-w-[160px]">
          <input
            type="text"
            placeholder="Search movies..."
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            className="w-full bg-gray-800 text-sm text-gray-200 placeholder-gray-500 px-3 py-2 rounded-lg border border-transparent focus:border-gray-600 focus:outline-none"
          />
        </div>

        {(filters.theaters.length > 0 || filters.formats.length > 0 || filters.languages.length > 0 || filters.search) && (
          <button
            onClick={() => onChange({ theaters: [], formats: [], languages: [], search: '' })}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
