import { useCallback, useEffect, useState } from 'react'
import {
  saveWebPushSubscription,
  listWebPushSubscriptions,
  removeWebPushSubscription,
} from '@amc/shared'
import { supabase } from '../supabase'
import {
  platform,
  isStandalone,
  pushSupported,
  getPushSubscription,
  subscribeToPush,
  showLocalTestNotification,
  VAPID_PUBLIC_KEY,
} from '../lib/pwa'
import { InstallSteps } from './InstallGuide'

/** Enable/disable push notifications on this device, with a state-aware status.
 * Used by Settings and the onboarding alerts step. */
export default function WebPushSetup({ onEnabledChange }) {
  const [subscribed, setSubscribed] = useState(null) // null = still checking
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [tested, setTested] = useState(false)

  const permission = pushSupported() ? Notification.permission : 'unsupported'
  const needsInstall = platform() === 'ios' && !isStandalone()

  const refresh = useCallback(async () => {
    try {
      const sub = await getPushSubscription()
      const on = !!sub && Notification.permission === 'granted'
      setSubscribed(on)
      onEnabledChange?.(on)
    } catch {
      setSubscribed(false)
    }
  }, [onEnabledChange])

  useEffect(() => { if (!needsInstall && pushSupported()) refresh(); else setSubscribed(false) }, [needsInstall, refresh])

  async function enable() {
    setBusy(true)
    setError(null)
    try {
      const sub = await subscribeToPush()
      await saveWebPushSubscription(supabase, sub.toJSON(), { userAgent: navigator.userAgent })
      await refresh()
    } catch (e) {
      if (e.message === 'permission-denied') {
        setError('Notifications were blocked. Allow them for this app in your device settings, then try again.')
      } else {
        console.error('[web-push] enable failed', e)
        setError(e.message || 'Could not turn on notifications.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setError(null)
    try {
      const sub = await getPushSubscription()
      if (sub) {
        const rows = await listWebPushSubscriptions(supabase)
        const row = rows.find((r) => r.endpoint === sub.endpoint)
        if (row) await removeWebPushSubscription(supabase, row.id)
        await sub.unsubscribe()
      }
      await refresh()
    } catch (e) {
      console.error('[web-push] disable failed', e)
      setError('Could not turn off notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setError(null)
    try {
      await showLocalTestNotification()
      setTested(true)
    } catch (e) {
      console.error('[web-push] test failed', e)
      setError('Could not show a test notification.')
    }
  }

  const card = 'bg-gray-900 border border-gray-800 rounded-xl p-4'

  if (needsInstall) {
    return (
      <div className={card}>
        <p className="text-sm text-white font-medium mb-1">Install the app first</p>
        <p className="text-gray-500 text-xs mb-4">
          iPhone only allows push notifications for apps added to the Home Screen. Do that, then
          open the app and come back here.
        </p>
        <InstallSteps />
      </div>
    )
  }

  if (!pushSupported()) {
    return (
      <div className={card}>
        <p className="text-sm text-gray-300">Push notifications aren't supported in this browser.</p>
        <p className="text-gray-600 text-xs mt-1">
          Try Chrome, Edge, Firefox, or Safari 16.4+ — or use the ntfy option below.
        </p>
      </div>
    )
  }

  if (!VAPID_PUBLIC_KEY) {
    return (
      <div className={card}>
        <p className="text-sm text-gray-400">Push notifications aren't configured on this deployment yet.</p>
      </div>
    )
  }

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white font-medium">
            {subscribed ? '✓ Notifications are on' : 'Push notifications'}
          </p>
          <p className="text-gray-500 text-xs mt-0.5">
            {subscribed
              ? "This device will be alerted when a seat opens in your zone."
              : permission === 'denied'
                ? 'Blocked — allow notifications for this app in your device or browser settings.'
                : 'Get an alert on this device the moment a seat opens up.'}
          </p>
        </div>
        {subscribed === false && permission !== 'denied' && (
          <button
            onClick={enable}
            disabled={busy}
            className="flex-shrink-0 text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-3 py-2 rounded-lg disabled:opacity-50"
          >
            {busy ? 'Enabling...' : 'Enable'}
          </button>
        )}
        {subscribed && (
          <button
            onClick={disable}
            disabled={busy}
            className="flex-shrink-0 text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1 disabled:opacity-50"
          >
            Turn off
          </button>
        )}
      </div>
      {subscribed && (
        <button onClick={test} className="mt-3 text-xs text-blue-400 underline">
          {tested ? 'Sent — did it show up?' : 'Send a test notification'}
        </button>
      )}
      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
    </div>
  )
}
