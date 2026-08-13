import { useState } from 'react'
import { regenerateNtfyTopic } from '@amc/shared'
import { supabase } from '../supabase'

/** Shared "set up seat alerts" instructions block — used by both Settings
 * (ongoing management) and Onboarding (first-run setup). */
export default function NtfySetup({ profile, onProfileChange }) {
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  async function copyTopic() {
    try {
      await navigator.clipboard.writeText(profile.ntfy_topic)
    } catch (e) {
      console.error('[ntfy-setup] clipboard write failed', e)
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
      console.error('[ntfy-setup] regenerate ntfy topic failed', e)
    } finally {
      setRegenerating(false)
    }
  }

  return (
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
  )
}
