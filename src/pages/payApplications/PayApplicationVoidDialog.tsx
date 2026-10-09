import { useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { toUserErrorMessage } from '@/lib/mutations/standardMutation';
import { buildVoidPayApplicationPatch } from './payApplicationStatus';

interface Props {
  applicationNumber: number;
  allowed: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<unknown>;
}
const button: CSSProperties = {
  border: '1px solid var(--border-default)', borderRadius: 4, padding: '9px 14px',
  background: 'var(--bg-surface-low)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
};

export default function PayApplicationVoidDialog({ applicationNumber, allowed, onCancel, onConfirm }: Props) {
  const id = useId();
  const trapRef = useFocusTrap(true);
  const inFlight = useRef(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failedRequest, setFailedRequest] = useState(false);
  const close = () => { if (!inFlight.current) onCancel(); };
  const confirm = async () => {
    if (!allowed || inFlight.current) return;
    let trimmed: string;
    try {
      trimmed = buildVoidPayApplicationPatch(reason).void_reason ?? '';
    } catch (cause) {
      setError(toUserErrorMessage(cause));
      return;
    }
    inFlight.current = true; setBusy(true); setError('');
    try {
      await onConfirm(trimmed);
    } catch (cause) {
      setFailedRequest(true);
      setError(`Void failed: ${toUserErrorMessage(cause)}`);
    } finally {
      inFlight.current = false; setBusy(false);
    }
  };
  return (
    <div onClick={event => { if (event.target === event.currentTarget) close(); }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--bg-void) 80%, transparent)' }}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={busy}
        style={{ width: 460, maxWidth: '100%', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', boxSizing: 'border-box', padding: 24, borderRadius: 8, background: 'var(--bg-surface-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}>
        <h2 id={`${id}-title`} style={{ margin: '0 0 12px', fontFamily: 'var(--font-display)', fontSize: 22 }}>Void Pay Application #{applicationNumber}</h2>
        <p id={`${id}-description`} style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)' }}>Explain why this application should be voided. The reason will remain with its billing record.</p>
        <label htmlFor={`${id}-reason`} style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 600, marginBottom: 8 }}>Reason for voiding</label>
        <textarea id={`${id}-reason`} value={reason} onChange={event => setReason(event.target.value)} required disabled={busy}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : `${id}-description`} data-autofocus
          style={{ boxSizing: 'border-box', width: '100%', minHeight: 108, resize: 'vertical', padding: 10, borderRadius: 4, border: '1px solid var(--border-default)', background: 'var(--bg-input, var(--bg-surface-low))', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 14 }} />
        {error && <p id={`${id}-error`} role="alert" style={{ color: 'var(--status-error)', fontSize: 13 }}>{error}</p>}
        {!allowed && <p role="alert" style={{ color: 'var(--status-warning)' }}>Voiding is unavailable for this application or your current project role.</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={button} disabled={busy} onClick={close}>Cancel</button>
          <button type="button" style={{ ...button, borderColor: 'var(--status-error)', color: 'var(--status-error)' }} disabled={busy || !allowed} onClick={() => { void confirm(); }}>{busy ? 'Voiding…' : failedRequest ? 'Retry void' : 'Void application'}</button>
        </div>
      </div>
    </div>
  );
}
