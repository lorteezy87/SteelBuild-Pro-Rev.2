import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LocalLoginForm({ onSubmit, isSubmitting, errorMessage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    await onSubmit({
      email: email.trim(),
      password,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/95 p-8 text-slate-100 shadow-2xl">
        <div className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-[0.25em] text-cyan-400">Local Development Login</p>
          <h1 className="mb-3 text-3xl font-semibold text-white">Sign in to SteelBuild Pro</h1>
          <p className="text-sm leading-6 text-slate-300">
            Localhost sign-in is handled directly in the app so we can avoid the broken hosted callback flow.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.15em] text-slate-400">
              Email
            </label>
            <Input
              autoComplete="email"
              className="h-11 border-slate-700 bg-slate-950 text-slate-100"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.15em] text-slate-400">
              Password
            </label>
            <Input
              autoComplete="current-password"
              className="h-11 border-slate-700 bg-slate-950 text-slate-100"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
          </div>

          {errorMessage ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <Button className="h-11 w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
