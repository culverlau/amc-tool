export function SignInScreen({ onSignIn }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">NYC Showtimes</h1>
        <p className="text-gray-500 text-sm mb-8">
          Sign in to follow theaters and get notified when good seats open up.
        </p>
        <button
          onClick={onSignIn}
          className="w-full flex items-center justify-center gap-2 bg-white text-gray-900 font-medium text-sm px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.67-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.9 10.9 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  )
}

export function WaitlistScreen({ onSignOut }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">You're on the list</h1>
        <p className="text-gray-500 text-sm mb-8">
          This is a small soft launch, so new accounts are waitlisted once the group fills up.
          Ask Culver for access, or hang tight.
        </p>
        <button
          onClick={onSignOut}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">
      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
    </div>
  )
}
