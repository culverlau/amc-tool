/** Explains the icons/badges used throughout the app. Shared by the header
 * "Key" button and the last onboarding step, so the two never drift apart. */
export function LegendItems() {
  const rows = [
    { icon: <span className="text-yellow-400">★</span>, label: 'Starred (watching for seats)', desc: "You'll be alerted when a seat opens in your chosen zone." },
    { icon: <span className="text-gray-500">☆</span>, label: 'Not starred', desc: 'Tap to start watching this showtime for seats.' },
    { icon: <span className="text-orange-400 font-semibold">!</span>, label: 'Almost sold out', desc: 'Very few seats remain — expect this showing to sell out soon.' },
    { icon: <span className="text-emerald-300 font-semibold border border-emerald-700/60 bg-emerald-900/40 rounded px-1 text-[10px]">OC</span>, label: 'Open Caption', desc: 'Subtitles are burned onto the screen for everyone in the auditorium.' },
    { icon: <span className="text-red-400">🍅 82%</span>, label: 'Rotten Tomatoes score', desc: 'Red = Fresh (60%+), yellow = Rotten. "NR" means not yet rated.' },
    { icon: <span className="text-blue-300 border border-blue-700/50 bg-blue-900/60 rounded px-1 text-[10px]">IMAX</span>, label: 'Premium format badges', desc: 'IMAX, Dolby Cinema, 70mm, and Laser are color-coded; plain formats are unlabeled.' },
  ]
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="w-10 flex-shrink-0 text-center pt-0.5">{r.icon}</span>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium">{r.label}</p>
            <p className="text-gray-500 text-xs">{r.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LegendModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-base">What the icons mean</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-sm">
            Close
          </button>
        </div>
        <LegendItems />
      </div>
    </div>
  )
}
