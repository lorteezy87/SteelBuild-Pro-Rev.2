import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

/**
 * DeleteAccountZone — permanent, self-service deletion of the SIGNED-IN user's
 * own account. Required by Apple App Store Guideline 5.1.1(v): any user who can
 * create an account must be able to delete it from within the app.
 *
 * Unlike DangerZone (owner-only WORKSPACE deletion), this is available to every
 * authenticated user regardless of role, and is NOT gated behind a feature flag.
 * It calls the `account-delete` edge function in `mode: 'account'`, which erases
 * the caller's account and PII, removes them from their workspaces, and — per
 * product policy — permanently deletes any workspace the caller SOLELY owns
 * (taking its projects, files, and other members' access with it). On success
 * the user is signed out.
 */
export default function DeleteAccountZone() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  // Type-to-confirm on the account's email (falls back to the literal word
  // DELETE if the session somehow has no email).
  const confirmTarget = user.email || 'DELETE';
  const canConfirm = confirmText.trim().toLowerCase() === confirmTarget.toLowerCase() && !busy;

  const handleDelete = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('account-delete', {
        body: { mode: 'account' },
      });
      if (error || !data?.ok) {
        throw new Error(data?.detail || error?.message || 'Deletion failed');
      }
      toast.success('Your account has been permanently deleted. Signing you out…');
      setTimeout(() => { logout(); }, 1500);
    } catch (err) {
      toast.error(err?.message || 'Could not delete your account. Please contact support.');
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 28, paddingTop: 22, borderTop: '1px solid var(--divider)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--danger, #b42318)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>
        Danger Zone
      </div>
      <div style={{ border: '1px solid var(--danger, #b42318)', borderRadius: 10, padding: 16, background: 'color-mix(in srgb, var(--danger, #b42318) 6%, transparent)' }}>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14, marginBottom: 4 }}>
          Delete my account
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 12px', maxWidth: 620 }}>
          Permanently deletes your account and personal data and removes you from every workspace.
          <strong> Any workspace where you are the only owner is permanently deleted for all of its
          members</strong> — including every project, drawing, file, and financial record. This
          <strong> cannot be undone</strong>. Export anything you need first.
        </p>
        <button
          onClick={() => { setOpen(true); setConfirmText(''); }}
          style={{ background: 'var(--danger, #b42318)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          Delete my account…
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm account deletion"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="sbd-card-strong"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460, width: '100%', padding: 24, borderRadius: 14, background: 'var(--bg-surface, #111A2B)', border: '1px solid var(--danger, #b42318)' }}
          >
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: 18, fontWeight: 800 }}>
              This is permanent
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55, margin: '0 0 14px' }}>
              To confirm, type your email <strong>{confirmTarget}</strong> below. Your account will be
              erased immediately and irreversibly, along with any workspace you solely own.
            </p>
            <label htmlFor="delete-account-confirm" style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>
              Your email
            </label>
            <input
              id="delete-account-confirm"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmTarget}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} disabled={busy} style={{ background: 'var(--bg-surface-low)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '9px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={!canConfirm} style={{ background: canConfirm ? 'var(--danger, #b42318)' : 'var(--bg-surface-low)', color: canConfirm ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: canConfirm ? 'pointer' : 'not-allowed', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {busy ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
