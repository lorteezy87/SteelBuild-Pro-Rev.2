/**
 * SecureDeleteDialog.jsx
 * Enhanced delete confirmation for SteelBuild Pro.
 *
 * Features:
 * - Shows record ownership with owner/not-owner callout
 * - Blocks delete button if user lacks permission
 * - Typed confirmation for project-level deletes (requireTyped)
 * - Logs all confirmed deletes to the audit trail
 */

import React, { useState, useEffect } from 'react';
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { usePermissions } from "@/services/permissions";
import { useDestructiveAudit } from './useDestructiveAudit';

export default function SecureDeleteDialog({
  open,
  onClose,
  onConfirm,
  title        = 'Delete Record',
  description  = 'This action cannot be undone.',
  record       = null,
  requireTyped = false,
  typedValue   = 'DELETE',
  allowedOverride = null,
  confirmLabel = 'DELETE',
}) {
  const trapRef = useFocusTrap(open);
  const { can } = usePermissions();
  const { logAction } = useDestructiveAudit();
  const userEmail = typeof window !== 'undefined' ? localStorage.getItem('current_user_email') : null;
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  if (!open) return null;

  const permAction = requireTyped ? 'delete_project' : 'delete';
  const allowed    = allowedOverride ?? can(permAction);
  const isOwner    = !record?.created_by || record.created_by === userEmail;
  const typeOk     = !requireTyped || typed.trim() === typedValue;
  const canConfirm = allowed && typeOk;

  const handleConfirm = () => {
    if (!canConfirm) return;
    logAction(permAction, {
      entityTitle: title,
      recordId:    record?.id,
      recordOwner: record?.created_by,
      typedValue:  requireTyped ? typedValue : undefined,
    });
    onConfirm();
    onClose();
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && canConfirm) handleConfirm();
  };

  const S = {
    overlay: {
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.70)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    },
    dialog: {
      background: 'var(--bg-surface-secondary)',
      border: '1px solid var(--danger-border)',
      borderLeft: '4px solid var(--status-error)',
      borderRadius: 12,
      padding: '24px 28px',
      width: 420,
      maxWidth: '100%',
      boxShadow: 'var(--shadow-lg)',
    },
    header: {
      display: 'flex', alignItems: 'center',
      gap: 10, marginBottom: 14,
    },
    headerText: {
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
      letterSpacing: '0.10em', color: 'var(--status-error)',
      textTransform: 'uppercase',
    },
    desc: {
      fontFamily: 'var(--font-body)', fontSize: 13,
      color: 'var(--text-secondary)',
      lineHeight: 1.5, marginBottom: 14,
    },
    ownerBox: {
      background: 'var(--hover-bg)',
      border: '1px solid var(--border-default)',
      borderRadius: 6, padding: '8px 12px',
      marginBottom: 14,
    },
    ownerLabel: {
      fontFamily: 'var(--font-mono)', fontSize: 8,
      color: 'var(--text-muted)', letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
    ownerValue: {
      fontFamily: 'var(--font-body)', fontSize: 12, marginTop: 3,
      color: isOwner ? 'var(--status-success)' : 'var(--status-warning)',
    },
    blockBox: {
      background: 'var(--danger-muted)',
      border: '1px solid var(--danger-border)',
      borderRadius: 6, padding: '8px 12px',
      marginBottom: 14,
    },
    blockText: {
      fontFamily: 'var(--font-body)', fontSize: 12,
      color: 'var(--status-error)', lineHeight: 1.45,
    },
    typeLabel: {
      fontFamily: 'var(--font-mono)', fontSize: 8,
      color: 'var(--text-muted)', letterSpacing: '0.08em',
      textTransform: 'uppercase', marginBottom: 6, display: 'block',
    },
    typeInput: {
      width: '100%', boxSizing: 'border-box',
      background: 'var(--bg-input)',
      border: `1px solid ${typed === typedValue
        ? 'var(--success-border)'
        : 'var(--border-default)'}`,
      borderRadius: 6, padding: '8px 12px',
      fontFamily: 'var(--font-mono)', fontSize: 12,
      color: 'var(--text-primary)', outline: 'none',
      transition: 'border-color 0.15s',
    },
    actions: {
      display: 'flex', gap: 10,
      justifyContent: 'flex-end', marginTop: 20,
    },
    cancelBtn: {
      background: 'var(--hover-bg)',
      border: '1px solid var(--border-default)',
      borderRadius: 6, padding: '8px 18px',
      fontFamily: 'var(--font-body)', fontSize: 12,
      color: 'var(--text-secondary)',
      cursor: 'pointer',
    },
    deleteBtn: {
      background: canConfirm
        ? 'var(--status-error)'
        : 'var(--hover-bg)',
      border: 'none',
      borderRadius: 6, padding: '8px 20px',
      fontFamily: 'var(--font-mono)', fontSize: 10,
      fontWeight: 700, letterSpacing: '0.08em',
      color: canConfirm
        ? 'white'
        : 'var(--text-muted)',
      cursor: canConfirm ? 'pointer' : 'not-allowed',
      transition: 'background 0.15s',
    },
  };

  return (
    <div style={S.overlay} onClick={onClose} onKeyDown={handleKey}>
      <div ref={trapRef} className="sbd-card-strong" role="alertdialog" aria-modal="true" style={S.dialog} onClick={e => e.stopPropagation()}>

        <div style={S.header}>
          <span style={{ fontSize: 18, color: 'var(--status-error)', lineHeight: 1 }}>⚠</span>
          <span style={S.headerText}>{title}</span>
        </div>

        <p style={S.desc}>{description}</p>

        {record?.created_by && (
          <div style={S.ownerBox}>
            <div style={S.ownerLabel}>Created By</div>
            <div style={S.ownerValue}>
              {record.created_by}
              {isOwner ? ' (you)' : ' — not your record'}
            </div>
          </div>
        )}

        {!allowed && (
          <div style={S.blockBox}>
            <span style={S.blockText}>
              ⊘&nbsp;
              {requireTyped
                ? 'Only admins can delete projects. Contact your system administrator.'
                : 'You don\'t have permission to delete this record. Contact your project manager.'}
            </span>
          </div>
        )}

        {requireTyped && allowed && (
          <div style={{ marginBottom: 4 }}>
            <span style={S.typeLabel}>
              Type &quot;{typedValue}&quot; to confirm
            </span>
            <input
              autoFocus
              style={S.typeInput}
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
              placeholder={typedValue}
            />
          </div>
        )}

        <div style={S.actions}>
          <button className="sbd-btn-ghost" style={S.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            className="sbd-btn"
            style={S.deleteBtn}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </button>
        </div>

      </div>
    </div>
  );
}
