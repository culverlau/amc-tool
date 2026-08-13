import { useEffect, useState } from 'react'
import { searchTheaters, followTheater, completeOnboarding } from '@amc/shared'
import { supabase } from '../supabase'
import NtfySetup from './NtfySetup'

const STEPS = ['welcome', 'theater', 'alerts']

export default function Onboarding({ profile: initialProfile, onDone }) {
  const [profile, setProfile] = useState(initialProfile)
  const [step, setStep] = useState(0)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function finish() {
    setFinishing(true)
    try {
      const updated = await completeOnboarding(supabase)
      onDone(updated)
    } catch (e) {
      console.error('[onboarding] complete failed', e)
      setFinishing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col">
      <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 w-6 rounded-full transition-colors ${i <= step ? 'bg-red-600' : 'bg-gray-800'}`}
            />
          ))}
        </div>
        <button
          onClick={finish}
          disabled={finishing}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
        >
          Skip for now
        </button>
      </header>

      <div className="overflow-y-auto overscroll-contain flex-1 min-h-0">
        <div className="max-w-md mx-auto w-full p-6">
          {step === 0 && <WelcomeStep onNext={() => setStep(1)} />}
          {step === 1 && <TheaterStep onNext={() => setStep(2)} />}
          {step === 2 && <AlertsStep profile={profile} onProfileChange={setProfile} finishing={finishing} onFinish={finish} />}
        </div>
      </div>
    </div>
  )
}

function WelcomeStep({ onNext }) {
  return (
    <div className="text-center pt-12">
      <h1 className="text-2xl font-bold text-white tracking-tight mb-3">Welcome to NYC Showtimes</h1>
      <p className="text-gray-400 text-sm mb-8">
        Follow AMC theaters nationwide, star a showing you want good seats for, and get
        alerted the moment a seat in your zone opens up. Let's get you set up — takes about
        a minute.
      </p>
      <button
        onClick={onNext}
        className="w-full text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-4 py-3 rounded-lg"
      >
        Get started
      </button>
    </div>
  )
}

function TheaterStep({ onNext }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [followedIds, setFollowedIds] = useState(new Set())
  const [pending, setPending] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    searchTheaters(supabase, query)
      .then((r) => { if (!cancelled) setResults(r) })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [query])

  async function follow(theater) {
    setPending(theater.amc_id)
    try {
      await followTheater(supabase, theater.amc_id)
      setFollowedIds((prev) => new Set(prev).add(theater.amc_id))
    } catch (e) {
      console.error('[onboarding] follow failed', e)
    } finally {
      setPending(null)
    }
  }

  return (
    <div>
      <h2 className="text-white font-semibold text-lg mb-1">Follow a theater</h2>
      <p className="text-gray-500 text-sm mb-4">
        Search by theater name, city, or state. You can follow more (or unfollow) any time
        from Theaters.
      </p>
      <input
        type="text"
        autoFocus
        placeholder="Search by theater, city, or state..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full bg-gray-800 text-sm text-gray-200 placeholder-gray-500 px-3 py-2.5 rounded-lg border border-transparent focus:border-gray-600 focus:outline-none mb-4"
      />
      <div className="space-y-1.5 max-h-72 overflow-y-auto mb-6">
        {loading && results.length === 0 && (
          <p className="text-center text-gray-600 text-sm py-6">Searching...</p>
        )}
        {!loading && results.length === 0 && (
          <p className="text-center text-gray-600 text-sm py-6">No theaters found.</p>
        )}
        {results.map((t) => {
          const isFollowed = followedIds.has(t.amc_id)
          return (
            <button
              key={t.amc_id}
              onClick={() => !isFollowed && follow(t)}
              disabled={pending === t.amc_id || isFollowed}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                isFollowed ? 'bg-red-900/20 border border-red-800/40' : 'bg-gray-900 border border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{t.name}</p>
                <p className="text-gray-500 text-xs">{[t.city, t.state].filter(Boolean).join(', ')}</p>
              </div>
              <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg ${isFollowed ? 'text-red-300' : 'text-gray-500'}`}>
                {isFollowed ? 'Following' : 'Follow'}
              </span>
            </button>
          )
        })}
      </div>
      <button
        onClick={onNext}
        disabled={followedIds.size === 0}
        className="w-full text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-4 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  )
}

function AlertsStep({ profile, onProfileChange, finishing, onFinish }) {
  return (
    <div>
      <h2 className="text-white font-semibold text-lg mb-1">Set up seat alerts</h2>
      <p className="text-gray-500 text-sm mb-4">
        One more step — this is how you'll actually hear about open seats.
      </p>
      <NtfySetup profile={profile} onProfileChange={onProfileChange} />
      <button
        onClick={onFinish}
        disabled={finishing}
        className="w-full mt-6 text-sm text-white bg-red-700 hover:bg-red-600 transition-colors font-medium px-4 py-3 rounded-lg disabled:opacity-50"
      >
        {finishing ? 'Finishing...' : 'Finish'}
      </button>
    </div>
  )
}
