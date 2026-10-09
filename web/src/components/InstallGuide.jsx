import { useEffect, useState } from 'react'
import {
  platform,
  isIosSafari,
  isStandalone,
  canPromptInstall,
  promptInstall,
  onInstallStateChange,
} from '../lib/pwa'

function Step({ n, children }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-800 text-gray-300 text-xs font-semibold flex items-center justify-center">
        {n}
      </span>
      <span className="text-sm text-gray-300 pt-0.5">{children}</span>
    </li>
  )
}

const ShareIcon = () => (
  <svg className="inline w-4 h-4 -mt-0.5 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0-12L8 7m4-4l4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </svg>
)

/** Platform-specific "add to home screen" instructions. Shared by the modal,
 * onboarding, and Settings so the wording never drifts. */
export function InstallSteps() {
  const p = platform()
  const [, force] = useState(0)
  useEffect(() => onInstallStateChange(() => force((n) => n + 1)), [])

  if (isStandalone()) {
    return (
      <p className="text-sm text-emerald-400">
        ✓ You're using the installed app — nothing more to do here.
      </p>
    )
  }

  if (p === 'ios' && !isIosSafari()) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-amber-300">
          Open this page in <strong>Safari</strong> to install it.
        </p>
        <p className="text-xs text-gray-500">
          On iPhone and iPad, only Safari can add this app to your Home Screen. Copy the
          address, open Safari, paste it, and follow the steps below.
        </p>
        <ol className="space-y-3 pt-2">
          <Step n={1}>Open this site in Safari.</Step>
          <Step n={2}>Tap the Share button <ShareIcon /> in the toolbar.</Step>
          <Step n={3}>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</Step>
          <Step n={4}>Open the app from its new <strong>Home Screen icon</strong>.</Step>
        </ol>
      </div>
    )
  }

  if (p === 'ios') {
    return (
      <ol className="space-y-3">
        <Step n={1}>Tap the Share button <ShareIcon /> at the bottom of Safari (top on iPad).</Step>
        <Step n={2}>Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</Step>
        <Step n={3}>
          Open the app from its new <strong>Home Screen icon</strong> — not from Safari. Alerts only
          work from the installed app.
        </Step>
      </ol>
    )
  }

  if (p === 'android') {
    return (
      <div className="space-y-3">
        {canPromptInstall() && (
          <button
            onClick={promptInstall}
            className="w-full text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-4 py-3 rounded-lg"
          >
            Install app
          </button>
        )}
        <ol className="space-y-3">
          <Step n={1}>Open the Chrome menu (⋮) in the top right.</Step>
          <Step n={2}>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</Step>
          <Step n={3}>Open the app from your home screen.</Step>
        </ol>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {canPromptInstall() && (
        <button
          onClick={promptInstall}
          className="w-full text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-4 py-3 rounded-lg"
        >
          Install app
        </button>
      )}
      <ol className="space-y-3">
        <Step n={1}>In Chrome or Edge, click the install icon at the right end of the address bar.</Step>
        <Step n={2}>Click <strong>Install</strong>. The app opens in its own window.</Step>
      </ol>
      <p className="text-xs text-gray-600">
        Safari on Mac: File → Add to Dock. Firefox doesn't support installing web apps.
      </p>
    </div>
  )
}

export function WhyInstall() {
  return (
    <p className="text-gray-500 text-sm">
      Install this site as an app to get <strong className="text-gray-300">seat alerts as push
      notifications</strong> and open it from your home screen. No app store — it takes a few seconds.
      {platform() === 'ios' && (
        <> On iPhone, notifications <strong className="text-gray-300">only work once it's added to your
        Home Screen</strong> (iOS 16.4 or later).</>
      )}
    </p>
  )
}

export default function InstallGuide({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-semibold text-base">Install the app</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-sm">Close</button>
        </div>
        <div className="mb-4"><WhyInstall /></div>
        <InstallSteps />
      </div>
    </div>
  )
}
