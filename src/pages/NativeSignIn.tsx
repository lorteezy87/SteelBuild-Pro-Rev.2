import { useEffect, useRef, useState } from 'react';
import { NATIVE_BACK_EVENT } from '@/lib/native/navigation';

interface Props {
  onLogin: (credentials: { email: string; password: string }) => Promise<unknown>;
  onForgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  isSubmitting?: boolean;
  loginError?: string | null;
}

export default function NativeSignIn({ onLogin, onForgotPassword, isSubmitting = false, loginError }: Props) {
  const [mode, setMode] = useState<'signin' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const changeMode = (next: 'signin' | 'reset') => {
    if (pending.current || isSubmitting) return;
    setMode(next); setError(null); setSent(false); setPassword('');
  };
  useEffect(() => {
    const back = (event: Event) => {
      if (mode === 'reset' || pending.current || isSubmitting) {
        event.preventDefault();
        if (!pending.current && !isSubmitting) { setMode('signin'); setError(null); setSent(false); }
      }
    };
    window.addEventListener(NATIVE_BACK_EVENT, back);
    return () => window.removeEventListener(NATIVE_BACK_EVENT, back);
  }, [mode, isSubmitting]);

  const submit = async () => {
    if (pending.current || isSubmitting) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || (mode === 'signin' && !password)) {
      setError('Enter your work email' + (mode === 'signin' ? ' and password.' : '.')); return;
    }
    pending.current = true; setBusy(true); setError(null); setSent(false);
    try {
      if (mode === 'reset') {
        const result = await onForgotPassword(email.trim());
        if (result.success) setSent(true);
        else setError(result.error || 'Could not send the reset email. Please try again.');
      } else await onLogin({ email: email.trim(), password });
    } catch { setError(mode === 'reset' ? 'Could not send the reset email. Please try again.' : 'Unable to sign in. Check your connection and try again.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const disabled = busy || isSubmitting;
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))', background: 'var(--bg-page)' }}>
      <section aria-labelledby="native-auth-title" style={{ width: '100%', maxWidth: 420, padding: 24, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, color: 'var(--text-primary)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 12 }}>SteelBuild Pro</p>
        <h1 id="native-auth-title" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginBottom: 12 }}>{mode === 'reset' ? 'Reset your password' : 'Sign in to your workspace'}</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>{mode === 'reset' ? 'Open the reset email in your browser, choose a new password, then return here to sign in.' : 'Use the account your company invited to SteelBuild Pro.'}</p>
        <div style={{ display: 'grid', gap: 12 }} onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); void submit(); } }}>
          <label htmlFor="native-email">Work email</label>
          <input id="native-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} className="sbd-input" style={{ minHeight: 44, width: '100%' }} value={email} onChange={e => setEmail(e.target.value)} disabled={disabled} />
          {mode === 'signin' && <><label htmlFor="native-password">Password</label><input id="native-password" type="password" autoComplete="current-password" className="sbd-input" value={password} onChange={e => setPassword(e.target.value)} disabled={disabled} /></>}
          {(error || (mode === 'signin' && loginError)) && <p role="alert">{error || loginError}</p>}
          {sent && <p role="status">If an account exists for this email, you will receive a password reset link. If a link expires, request another here.</p>}
          <button type="button" className="sbd-btn sbd-btn-primary" style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 8, fontWeight: 700 }} disabled={disabled} onClick={() => { void submit(); }}>{disabled ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : 'Sign in'}</button>
          <button type="button" className="sbd-btn sbd-btn-ghost" style={{ minHeight: 44, border: '1px solid var(--border-default)', borderRadius: 8 }} disabled={disabled} onClick={() => changeMode(mode === 'reset' ? 'signin' : 'reset')}>{mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}</button>
          <a href="/privacy">Privacy policy</a>
        </div>
      </section>
    </main>
  );
}
