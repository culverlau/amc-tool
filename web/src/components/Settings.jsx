import { useEffect, useState } from 'react'
import { updateSeatZoneDefaults, listPushTokens, removePushToken, restartOnboarding } from '@amc/shared'
import { supabase } from '../supabase'
import NtfySetup from './NtfySetup'
import AlertHistory from './AlertHistory'
import WebPushSetup from './WebPushSetup'
import { InstallSteps, WhyInstall } from './InstallGuide'
import { isStandalone, platform } from '../lib/pwa'

export default function Settings({ profile, onProfileChange, onClose, onSignOut, onRestartOnboarding }) {
  const [zone, setZone] = useState({
    row_min: profile.row_min, row_max: profile.row_max,
    seat_min: profile.seat_min, seat_max: profile.seat_max,
  })
  const [saving, setSaving] = useState(false)
  const [tokens, setTokens] = useState(null)
  const [restarting, setRestarting] = useState(false)

  async function replayOnboarding() {
    setRestarting(true)
    try {
      const updated = await restartOnboarding(supabase)
      onRestartOnboarding(updated)
    } catch (e) {
      console.error('[settings] restart onboarding failed', e)
      setRestarting(false)
    }
  }

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
            {!isStandalone() && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-3">
                <p className="text-sm text-white font-medium mb-2">Install the app</p>
                <div className="mb-4"><WhyInstall /></div>
                <InstallSteps />
              </div>
            )}
            <WebPushSetup />
            <details className="mt-4">
              <summary className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer select-none">
                Other option: ntfy.sh app
              </summary>
              <div className="mt-3">
                <NtfySetup profile={profile} onProfileChange={onProfileChange} />
              </div>
            </details>
            <details className="mt-3">
              <summary className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer select-none">
                Notifications not working?
              </summary>
              <ul className="mt-3 space-y-2 text-xs text-gray-500 list-disc pl-5">
                {platform() === 'ios' && (
                  <li>On iPhone/iPad you need iOS 16.4+, and the app must be opened from its Home Screen icon — not from Safari.</li>
                )}
                <li>Tap Enable and choose Allow when asked. If you tapped Block, re-enable notifications for this app in your device or browser settings.</li>
                <li>Turn off Focus / Do Not Disturb, or allow this app through it.</li>
                <li>Alerts only fire for showtimes you've starred (★) at a followed theater.</li>
                <li>Use "Send a test notification" above to check this device.</li>
              </ul>
            </details>
          </section>

          <AlertHistory />

          <section>
            <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Devices</h3>
            {tokens === null ? (
              <p className="text-gray-600 text-sm">Loading...</p>
            ) : tokens.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-400 text-sm">No devices registered.</p>
                <p className="text-gray-600 text-xs mt-1">
                  Install this site as an app and enable notifications above to get alerts when seats open.
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

          <section className="flex items-center justify-between">
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-1">Help</h3>
              <p className="text-gray-600 text-xs">Replay the welcome tour — theater setup, alerts, and icon key.</p>
            </div>
            <button
              onClick={replayOnboarding}
              disabled={restarting}
              className="flex-shrink-0 text-sm text-white bg-gray-800 hover:bg-gray-700 transition-colors font-medium px-3 py-2 rounded-lg disabled:opacity-50"
            >
              {restarting ? 'Loading...' : 'Replay onboarding'}
            </button>
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
