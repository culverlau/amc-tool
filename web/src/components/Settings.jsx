import { useEffect, useState } from 'react'
import { updateSeatZoneDefaults, listPushTokens, removePushToken, regenerateNtfyTopic } from '@amc/shared'
import { supabase } from '../supabase'

export default function Settings({ profile, onProfileChange, onClose, onSignOut }) {
  const [zone, setZone] = useState({
    row_min: profile.row_min, row_max: profile.row_max,
    seat_min: profile.seat_min, seat_max: profile.seat_max,
  })
  const [saving, setSaving] = useState(false)
  const [tokens, setTokens] = useState(null)
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    listPushTokens(supabase).then(setTokens).catch(() => setTokens([]))
  }, [])

  async function saveZone() {
    setSaving(true)
    try {
      const updated = await updateSeatZoneDefaults(supabase, zone)
      onProfileChange(updated)
    } catch (e) {
      console.error('[settings] save zone failed', e)
    } finally {
      setSaving(false)
    }
  }

  async function revoke(id) {
    await removePushToken(supabase, id)
    setTokens((prev) => prev.filter((t) => t.id !== id))
  }

  async function copyTopic() {
    try {
      await navigator.clipboard.writeText(profile.ntfy_topic)
    } catch (e) {
      console.error('[settings] clipboard write failed', e)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function regenerate() {
    if (!confirm('Get a new alert code? Your old one will stop working, so re-add it in the ntfy app afterward.')) return
    setRegenerating(true)
    try {
      const updated = await regenerateNtfyTopic(supabase)
      onProfileChange(updated)
    } catch (e) {
      console.error('[settings] regenerate ntfy topic failed', e)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      <header className="flex items-center gap-4 px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm transition-colors">
          ← Back
        </button>
        <h2 className="text-white font-semibold text-base flex-1">Settings</h2>
      </header>

      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
        <div className="max-w-2xl mx-auto w-full p-4 space-y-6">
          <div>
            <p className="text-sm text-gray-400">{profile.email}</p>
          </div>

          <section>
            <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Default seat zone</h3>
            <p className="text-gray-600 text-xs mb-3">
              Applied when you star a new showtime — you can still adjust it per showtime.
            </p>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text" maxLength={1} value={zone.row_min}
                onChange={(e) => setZone((z) => ({ ...z, row_min: e.target.value.replace(/[^a-zA-Z]/, '').toUpperCase() }))}
                className="w-14 bg-gray-800 text-white text-center rounded-lg px-2 py-2 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
              />
              <span className="text-gray-600 text-sm">to</span>
              <input
                type="text" maxLength={1} value={zone.row_max}
                onChange={(e) => setZone((z) => ({ ...z, row_max: e.target.value.replace(/[^a-zA-Z]/, '').toUpperCase() }))}
                className="w-14 bg-gray-800 text-white text-center rounded-lg px-2 py-2 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
              />
              <span className="text-gray-600 text-xs ml-2">rows</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} max={99} value={zone.seat_min}
                onChange={(e) => setZone((z) => ({ ...z, seat_min: Number(e.target.value) }))}
                className="w-20 bg-gray-800 text-white text-center rounded-lg px-2 py-2 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
              />
              <span className="text-gray-600 text-sm">to</span>
              <input
                type="number" min={1} max={99} value={zone.seat_max}
                onChange={(e) => setZone((z) => ({ ...z, seat_max: Number(e.target.value) }))}
                className="w-20 bg-gray-800 text-white text-center rounded-lg px-2 py-2 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
              />
              <span className="text-gray-600 text-xs ml-2">seats</span>
            </div>
            <button
              onClick={saveZone}
              disabled={saving}
              className="mt-4 text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </section>

          <section>
            <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Seat alerts</h3>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <p className="text-gray-400 text-sm">
                Our app isn't out yet, so seat alerts are sent through a free app called{' '}
                <strong className="text-gray-200">ntfy</strong>. Takes 2 minutes to set up:
              </p>
              <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
                <li>
                  Download <strong className="text-gray-200">ntfy</strong> from the{' '}
                  <a href="https://ntfy.sh" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                    App Store or Google Play
                  </a>{' '}
                  (search "ntfy") and open it.
                </li>
                <li>Tap the <strong className="text-gray-200">+</strong> button (bottom right) to add a subscription.</li>
                <li>
                  Enter this exact code as the topic name, then tap Subscribe:
                </li>
              </ol>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono truncate">
                  {profile.ntfy_topic}
                </code>
                <button
                  onClick={copyTopic}
                  className="text-sm text-white bg-gray-700 hover:bg-gray-600 transition-colors font-medium px-3 py-2 rounded-lg flex-shrink-0"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-gray-600 text-xs">
                That's it — alerts will show up as notifications on your phone. Anyone who has this
                code could see your alerts too, so don't share it.
              </p>
              <button
                onClick={regenerate}
                disabled={regenerating}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                {regenerating ? 'Generating...' : "Code compromised? Get a new one"}
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Devices</h3>
            {tokens === null ? (
              <p className="text-gray-600 text-sm">Loading...</p>
            ) : tokens.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-sm">No devices registered.</p>
                <p className="text-gray-600 text-xs mt-1">
                  Install the AMC Sniper app and sign in to get push notifications when seats open.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {tokens.map((t) => (
                  <div key={t.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div>
                      <p className="text-gray-200 text-sm">{t.device_label || t.platform || 'Device'}</p>
                      <p className="text-gray-600 text-xs">Added {new Date(t.created_at).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => revoke(t.id)}
                      className="text-xs text-gray-600 hover:text-red-400 transition-colors px-2 py-1"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <button
            onClick={onSignOut}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
