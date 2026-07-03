import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/components/shared/OrgContext';
import { useAuth } from '@/lib/AuthContext';
import { useFlag } from '@/hooks/useFeatureFlag';
import { toast } from 'sonner';

/**
 * DangerZone — permanent workspace (organization) deletion. H11 right-to-erasure.
 *
 * Guarded three ways: (1) the `account_deletion` feature flag (OFF by default —
 * enable per-owner or globally only when ready), (2) org OWNER only, (3) a
 * type-the-name confirmation. Calls the `account-delete` edge function, which
 * erases DB rows, Storage objects, and orphaned auth users, then signs out.
 */
export default function DangerZone() {
  const enabled = useFlag('account_deletion');
  const { currentOrg, currentRole } = useOrg();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  // Only an org owner, and only when the flag is on, ever sees this.
  if (!enabled || currentRole !== 'owner' || !currentOrg) return null;

  const orgName = currentOrg.name || 'this workspace';
  const canConfirm = confirmText.trim() === orgName.trim() && !busy;

  const handleDelete = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('account-delete', {
        body: { org_id: currentOrg.id },
      });
      if (error || !data?.ok) {
        throw new Error(data?.detail || error?.message || 'Deletion failed');
      }
      toast.success('Workspace permanently deleted. Signing you out…');
      setTimeout(() => { logout(); }, 1500);
    } catch (err) {
      toast.error(err?.message || 'Could not delete the workspace. Please contact support.');
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
          Delete this workspace
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.55, margin: '0 0 12px', maxWidth: 620 }}>
          Permanently erases <strong>{orgName}</strong> — every project, drawing, submittal, RFI,
          financial record, uploaded file, and team membership. This <strong>cannot be undone</strong>
          and is not recoverable from backups after the retention window. Export your data first if you
          need a copy.
        </p>
        <button
          onClick={() => { setOpen(true); setConfirmText(''); }}
          style={{ background: 'var(--danger, #b42318)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          Delete workspace…
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm workspace deletion"
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
              To confirm, type the workspace name <strong>{orgName}</strong> below. Everything it owns
              will be erased immediately and irreversibly.
            </p>
            <label htmlFor="delete-confirm" style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>
              Workspace name
            </label>
            <input
              id="delete-confirm"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={orgName}
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
