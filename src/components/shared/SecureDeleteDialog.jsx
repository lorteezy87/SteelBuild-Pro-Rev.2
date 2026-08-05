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

import React, { useState, useEffect, useContext } from 'react';
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { usePermissions } from "@/services/permissions";
import { AuthContext } from "@/lib/AuthContext";
import { useDestructiveAudit } from './useDestructiveAudit';
import { buildSecureDeleteStyles } from './secureDeleteDialogHelpers';

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
  const authCtx = useContext(AuthContext);
  const userEmail = authCtx?.user?.email ?? null;
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setTyped('');
      setConfirming(false);
    }
  }, [open]);

  if (!open) return null;

  const permAction = requireTyped ? 'delete_project' : 'delete';
  const allowed    = allowedOverride ?? can(permAction);
  const isOwner    = !record?.created_by || record.created_by === userEmail;
  const typeOk     = !requireTyped || typed.trim() === typedValue;
  const canConfirm = allowed && typeOk && !confirming;

  const handleConfirm = async () => {
    if (!canConfirm || confirming) return;
    logAction(permAction, {
      entityTitle: title,
      recordId:    record?.id,
      recordOwner: record?.created_by,
      typedValue:  requireTyped ? typedValue : undefined,
    });
    // Await the mutation so a failed archive cannot close the dialog and look
    // briefly deleted while the underlying row stays live.
    setConfirming(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && canConfirm) handleConfirm();
  };

  const S = buildSecureDeleteStyles({ isOwner, typed, typedValue, canConfirm });

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
            disabled={!canConfirm || confirming}
          >
            {confirming ? "WORKING…" : confirmLabel}
          </button>
        </div>

      </div>
    </div>
  );
}
