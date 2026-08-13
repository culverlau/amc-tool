import { useEffect, useState } from 'react'
import { getAlertHistory } from '@amc/shared'
import { supabase } from '../supabase'

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function AlertHistory() {
  const [history, setHistory] = useState(null)

  useEffect(() => {
    getAlertHistory(supabase).then(setHistory).catch(() => setHistory([]))
  }, [])

  return (
    <section>
      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Alert history</h3>
      <p className="text-gray-600 text-xs mb-3">Last 30 days.</p>
      {history === null ? (
        <p className="text-gray-600 text-sm">Loading...</p>
      ) : history.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">No alerts yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((h) => (
            <div key={h.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-gray-200 text-sm font-medium truncate">{h.movie_name}</p>
                <p className="text-gray-600 text-xs flex-shrink-0">{timeAgo(h.sent_at)}</p>
              </div>
              <p className="text-gray-500 text-xs mt-1 font-mono">{(h.seats || []).join(' ')}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
