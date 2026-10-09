import { useState } from 'react'
import { isMobile, isStandalone, lsGet, lsSet } from '../lib/pwa'
import InstallGuide from './InstallGuide'

const DISMISS_KEY = 'install-banner-dismissed'

/** Dismissible nudge on mobile browsers that haven't installed the app yet. */
export default function InstallBanner() {
  const [dismissed, setDismissed] = useState(() => lsGet(DISMISS_KEY) === '1')
  const [open, setOpen] = useState(false)

  if (dismissed || isStandalone() || !isMobile()) return null

  function dismiss() {
    lsSet(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 pt-3">
        <div className="flex items-center gap-3 bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3">
          <p className="flex-1 text-sm text-gray-300">
            Install this as an app to get <strong className="text-white">seat alerts</strong> on your phone.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="flex-shrink-0 text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-3 py-1.5 rounded-lg"
          >
            How
          </button>
          <button onClick={dismiss} aria-label="Dismiss" className="flex-shrink-0 text-gray-500 hover:text-gray-300 text-lg leading-none">
            ×
          </button>
        </div>
      </div>
      {open && <InstallGuide onClose={() => setOpen(false)} />}
    </>
  )
}
