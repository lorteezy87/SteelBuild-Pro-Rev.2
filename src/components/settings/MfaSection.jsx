import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

/**
 * MfaSection — TOTP enrollment/management for the signed-in user (H23).
 * Lives in Settings → Profile → Security. Flow:
 *   1. If no verified factor: "Enable two-factor" → enroll → render the QR +
 *      secret → user scans in their authenticator → enters a 6-digit code →
 *      verify → factor becomes verified.
 *   2. If a verified factor exists: show it with a "Remove" (unenroll) action.
 *
 * The QR is an SVG data URL returned by Supabase — no QR library needed.
 */
export default function MfaSection() {
  const { listMfaFactors, enrollMfa, verifyMfaFactor, unenrollMfa } = useAuth();
  const [factors, setFactors] = useState(null); // null = loading
  const [enroll, setEnroll] = useState(null);    // { factorId, qrCode, secret } while enrolling
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => setFactors(await listMfaFactors());
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const verified = (factors ?? []).filter((f) => f.status === 'verified');

  const startEnroll = async () => {
    setBusy(true);
    const res = await enrollMfa();
    setBusy(false);
    if (res.success) {
      setEnroll({ factorId: res.factorId, qrCode: res.qrCode, secret: res.secret });
      setCode('');
    } else {
      toast.error(res.error || 'Could not start enrollment');
    }
  };

  const confirmEnroll = async () => {
    const clean = code.replace(/\s/g, '');
    if (clean.length < 6) { toast.error('Enter the 6-digit code from your app.'); return; }
    setBusy(true);
    const res = await verifyMfaFactor(enroll.factorId, clean);
    setBusy(false);
    if (res.success) {
      toast.success('Two-factor authentication enabled');
      setEnroll(null);
      setCode('');
      refresh();
    } else {
      toast.error(res.error || 'That code was not accepted');
    }
  };

  const cancelEnroll = async () => {
    // Best-effort: drop the unverified factor so it doesn't linger.
    if (enroll?.factorId) { try { await unenrollMfa(enroll.factorId); } catch { /* ignore */ } }
    setEnroll(null);
    setCode('');
    refresh();
  };

  const remove = async (factorId) => {
    setBusy(true);
    const res = await unenrollMfa(factorId);
    setBusy(false);
    if (res.success) { toast.success('Two-factor authentication removed'); refresh(); }
    else toast.error(res.error || 'Could not remove authenticator');
  };

  if (factors === null) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading two-factor status…</div>;
  }

  // Mid-enrollment: show QR + secret + verify field.
  if (enroll) {
    return (
      <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
          Scan this QR code in your authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code to confirm.
        </div>
        {enroll.qrCode && (
          <img src={enroll.qrCode} alt="Two-factor QR code" width={180} height={180} style={{ background: '#fff', borderRadius: 8, padding: 8, alignSelf: 'start' }} />
        )}
        {enroll.secret && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            Or enter this key manually: <span style={{ color: 'var(--text-secondary)' }}>{enroll.secret}</span>
          </div>
        )}
        <div>
          <label htmlFor="mfa-enroll-code" style={LBL}>Verification code</label>
          <input id="mfa-enroll-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" style={{ ...INP, letterSpacing: '0.2em', maxWidth: 160 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={confirmEnroll} disabled={busy} style={BTN_PRIMARY(busy)}>{busy ? 'Verifying…' : 'Confirm & enable'}</button>
          <button onClick={cancelEnroll} disabled={busy} style={BTN_GHOST}>Cancel</button>
        </div>
      </div>
    );
  }

  // Enrolled: show verified factors + remove.
  if (verified.length > 0) {
    return (
      <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 12 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>● Enabled</span>
          <span>Two-factor authentication is protecting this account.</span>
        </div>
        {verified.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-surface-low)', border: '1px solid var(--border-default)', borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.friendlyName || 'Authenticator app'}</span>
            <button onClick={() => remove(f.id)} disabled={busy} style={BTN_GHOST}>Remove</button>
          </div>
        ))}
      </div>
    );
  }

  // Not enrolled.
  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5 }}>
        Add a second factor (a code from an authenticator app) so a stolen password alone can't access your account.
      </div>
      <button onClick={startEnroll} disabled={busy} style={BTN_PRIMARY(busy)}>{busy ? 'Starting…' : 'Enable two-factor'}</button>
    </div>
  );
}

const LBL = { fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 5 };
const INP = { width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const BTN_PRIMARY = (busy) => ({ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: busy ? 0.6 : 1 });
const BTN_GHOST = { background: 'var(--bg-surface-low)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' };
