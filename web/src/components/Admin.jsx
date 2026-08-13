import { useEffect, useState } from 'react'
import {
  listAllProfiles,
  updateUserStatus,
  updateUserSnipeCap,
  getAppSettings,
  updateAppSettings,
} from '@amc/shared'
import { supabase } from '../supabase'

const REPO = 'culverlau/amc-tool'
const WORKFLOWS = ['fetch-showtimes.yml', 'sniper.yml', 'sync-theaters.yml', 'refresh-rt.yml']

export default function Admin({ onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      <header className="flex items-center gap-4 px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <button onClick={onClose} className="text-gray-400 hover:text-white flex items-center gap-1.5 text-sm transition-colors">
          ← Back
        </button>
        <h2 className="text-white font-semibold text-base flex-1">Admin</h2>
      </header>
      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
        <div className="max-w-2xl mx-auto w-full p-4 space-y-6">
          <PipelineHealth />
          <AppSettingsSection />
          <UsersSection />
        </div>
      </div>
    </div>
  )
}

function PipelineHealth() {
  const [runs, setRuns] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all(
      WORKFLOWS.map((wf) =>
        fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${wf}/runs?per_page=1`)
          .then((r) => r.json())
          .then((d) => ({ wf, run: d.workflow_runs?.[0] || null }))
          .catch(() => ({ wf, run: null }))
      )
    )
      .then(setRuns)
      .catch(() => setError(true))
  }, [])

  return (
    <section>
      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Pipeline health</h3>
      {error && <p className="text-red-400 text-sm">Could not load workflow status.</p>}
      {!error && runs === null && <p className="text-gray-600 text-sm">Loading...</p>}
      {runs && (
        <div className="space-y-2">
          {runs.map(({ wf, run }) => {
            const ok = run?.conclusion === 'success'
            const bad = run && run.conclusion && run.conclusion !== 'success'
            return (
              <a
                key={wf}
                href={run?.html_url || `https://github.com/${REPO}/actions/workflows/${wf}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3 hover:border-gray-700 transition-colors"
              >
                <span className="text-gray-200 text-sm font-mono">{wf}</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-lg ${
                  ok ? 'text-green-400' : bad ? 'text-red-400' : 'text-gray-500'
                }`}>
                  {run ? (run.conclusion || run.status) : 'no runs'}
                </span>
              </a>
            )
          })}
        </div>
      )}
    </section>
  )
}

function AppSettingsSection() {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getAppSettings(supabase).then(setSettings).catch(() => setSettings(null))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const updated = await updateAppSettings(supabase, {
        max_active_users: Number(settings.max_active_users),
        default_snipe_cap: Number(settings.default_snipe_cap),
      })
      setSettings(updated)
    } catch (e) {
      console.error('[admin] save app settings failed', e)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return null

  return (
    <section>
      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">App settings</h3>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <label className="flex items-center justify-between gap-3">
          <span className="text-gray-400 text-sm">Max active users</span>
          <input
            type="number" min={0} value={settings.max_active_users}
            onChange={(e) => setSettings((s) => ({ ...s, max_active_users: e.target.value }))}
            className="w-24 bg-gray-800 text-white text-center rounded-lg px-2 py-1.5 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-gray-400 text-sm">Default snipe cap</span>
          <input
            type="number" min={0} value={settings.default_snipe_cap}
            onChange={(e) => setSettings((s) => ({ ...s, default_snipe_cap: e.target.value }))}
            className="w-24 bg-gray-800 text-white text-center rounded-lg px-2 py-1.5 text-sm font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
          />
        </label>
        <button
          onClick={save}
          disabled={saving}
          className="text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </section>
  )
}

function UsersSection() {
  const [profiles, setProfiles] = useState(null)
  const [pending, setPending] = useState(null)

  function load() {
    listAllProfiles(supabase).then(setProfiles).catch(() => setProfiles([]))
  }

  useEffect(load, [])

  async function promote(userId) {
    setPending(userId)
    try {
      await updateUserStatus(supabase, userId, 'active')
      load()
    } catch (e) {
      console.error('[admin] promote failed', e)
    } finally {
      setPending(null)
    }
  }

  async function changeSnipeCap(userId, value) {
    try {
      await updateUserSnipeCap(supabase, userId, Number(value))
      setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, snipe_cap: Number(value) } : p)))
    } catch (e) {
      console.error('[admin] snipe cap update failed', e)
    }
  }

  if (profiles === null) return <p className="text-gray-600 text-sm">Loading users...</p>

  const waitlisted = profiles.filter((p) => p.status === 'waitlisted')

  return (
    <>
      {waitlisted.length > 0 && (
        <section>
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Waitlist</h3>
          <div className="space-y-2">
            {waitlisted.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3">
                <div className="min-w-0">
                  <p className="text-gray-200 text-sm truncate">{p.display_name || p.email}</p>
                  <p className="text-gray-600 text-xs">{p.email}</p>
                </div>
                <button
                  onClick={() => promote(p.id)}
                  disabled={pending === p.id}
                  className="text-xs text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 flex-shrink-0"
                >
                  {pending === p.id ? 'Promoting...' : 'Promote'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">All users ({profiles.length})</h3>
        <div className="space-y-2">
          {profiles.map((p) => (
            <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-gray-200 text-sm truncate">{p.display_name || p.email}</p>
                  <p className="text-gray-600 text-xs">{p.email} · {p.status} · joined {new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <label className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-gray-600 text-xs">cap</span>
                  <input
                    type="number" min={0} defaultValue={p.snipe_cap}
                    onBlur={(e) => changeSnipeCap(p.id, e.target.value)}
                    className="w-16 bg-gray-800 text-white text-center rounded-lg px-1.5 py-1 text-xs font-mono border border-gray-700 focus:border-gray-500 focus:outline-none"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
