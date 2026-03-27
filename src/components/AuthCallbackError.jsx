import React from 'react';

const clearLocalAuthState = () => {
  try {
    window.localStorage.removeItem('base44_access_token');
    window.localStorage.removeItem('token');
    window.sessionStorage.removeItem('base44_login_attempted');
  } catch (error) {
    console.error('Failed to clear local auth state:', error);
  }
};

export default function AuthCallbackError({ authError, hasToken, onRetry }) {
  const handleReset = () => {
    clearLocalAuthState();
    window.location.assign('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/90 p-8 text-slate-100 shadow-2xl">
        <div className="mb-6">
          <p className="mb-3 text-xs uppercase tracking-[0.25em] text-amber-400">Auth Check Failed</p>
          <h1 className="mb-3 text-3xl font-semibold text-white">The login callback did not complete cleanly.</h1>
          <p className="text-sm leading-6 text-slate-300">
            The app stopped the redirect loop so we can see the actual post-login state.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-300">
          <div className="mb-2">
            <span className="font-medium text-slate-100">Auth reason:</span> {authError?.type || 'unknown'}
          </div>
          <div className="mb-2">
            <span className="font-medium text-slate-100">Message:</span> {authError?.message || 'No message returned'}
          </div>
          <div>
            <span className="font-medium text-slate-100">Access token present locally:</span> {hasToken ? 'yes' : 'no'}
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100">
          <p className="mb-2 font-medium">What this usually means</p>
          <p>
            If the token says <strong>no</strong>, the hosted Base44 login page likely authenticated you but did not send an
            `access_token` back to `localhost`. If it says <strong>yes</strong>, the token came back but the app backend rejected it or your
            app user record still needs attention.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-amber-300"
            onClick={onRetry}
          >
            Try Sign In Again
          </button>
          <button
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            onClick={handleReset}
          >
            Clear Local Session
          </button>
        </div>
      </div>
    </div>
  );
}
