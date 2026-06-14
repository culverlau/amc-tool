import { useState } from 'react'

function formatShowtimeLabel(s) {
  const [y, mo, d] = s.date.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const [h, m] = s.time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  const timeStr = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
  const theater = s.theaterName.replace(/^AMC /, '')
  return { theater, dateStr, timeStr, format: s.format.replace(' at AMC', '') }
}

export default function StarDialog({ showtime, onConfirm, onCancel }) {
  const [rowMin, setRowMin] = useState('E')
  const [rowMax, setRowMax] = useState('L')
  const [seatMin, setSeatMin] = useState(7)
  const [seatMax, setSeatMax] = useState(36)

  const { theater, dateStr, timeStr, format } = formatShowtimeLabel(showtime)

  function handleConfirm() {
    onConfirm({ rowMin: rowMin.toUpperCase(), rowMax: rowMax.toUpperCase(), seatMin: Number(seatMin), seatMax: Number(seatMax) })
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-white font-semibold text-base mb-0.5">Watch for seats</h3>
        <p className="text-gray-400 text-sm mb-5">
          {theater} · {dateStr} · {timeStr} · {format}
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Row range</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={rowMin}
                onChange={e => setRowMin(e.target.value.replace(/[^a-zA-Z]/, '').toUpperCase())}
                maxLength={1}
                className="w-14 bg-gray-800 text-white text-center rounded-lg px-2 py-2 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
              />
              <span className="text-gray-600 text-sm">to</span>
              <input
                type="text"
                value={rowMax}
                onChange={e => setRowMax(e.target.value.replace(/[^a-zA-Z]/, '').toUpperCase())}
                maxLength={1}
                className="w-14 bg-gray-800 text-white text-center rounded-lg px-2 py-2 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Seat numbers</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={seatMin}
                onChange={e => setSeatMin(e.target.value)}
                min={1}
                max={99}
                className="w-20 bg-gray-800 text-white text-center rounded-lg px-2 py-2 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
              />
              <span className="text-gray-600 text-sm">to</span>
              <input
                type="number"
                value={seatMax}
                onChange={e => setSeatMax(e.target.value)}
                min={1}
                max={99}
                className="w-20 bg-gray-800 text-white text-center rounded-lg px-2 py-2 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-600 mt-4">
          You'll be notified when seats open in this zone.
        </p>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 rounded-lg text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium"
          >
            Watch
          </button>
        </div>
      </div>
    </div>
  )
}
