/**
 * Pure chrome style builders for SecureDeleteDialog.
 */

export const SECURE_DELETE_OVERLAY_STYLE: Record<string, string | number> = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0,0,0,0.70)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

export const SECURE_DELETE_DIALOG_STYLE: Record<string, string | number> = {
  background: "var(--bg-surface-secondary)",
  border: "1px solid var(--danger-border)",
  borderLeft: "4px solid var(--status-error)",
  borderRadius: 12,
  padding: "24px 28px",
  width: 420,
  maxWidth: "100%",
  boxShadow: "var(--shadow-lg)",
};

export const SECURE_DELETE_HEADER_STYLE: Record<string, string | number> = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 14,
};

export const SECURE_DELETE_HEADER_TEXT_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.10em",
  color: "var(--status-error)",
  textTransform: "uppercase",
};

export const SECURE_DELETE_DESC_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--text-secondary)",
  lineHeight: 1.5,
  marginBottom: 14,
};

export const SECURE_DELETE_OWNER_BOX_STYLE: Record<string, string | number> = {
  background: "var(--hover-bg)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "8px 12px",
  marginBottom: 14,
};

export const SECURE_DELETE_OWNER_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  color: "var(--text-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

export function secureDeleteOwnerValueStyle(isOwner: boolean): Record<string, string | number> {
  return {
    fontFamily: "var(--font-body)",
    fontSize: 12,
    marginTop: 3,
    color: isOwner ? "var(--status-success)" : "var(--status-warning)",
  };
}

export const SECURE_DELETE_BLOCK_BOX_STYLE: Record<string, string | number> = {
  background: "var(--danger-muted)",
  border: "1px solid var(--danger-border)",
  borderRadius: 6,
  padding: "8px 12px",
  marginBottom: 14,
};

export const SECURE_DELETE_BLOCK_TEXT_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--status-error)",
  lineHeight: 1.45,
};

export const SECURE_DELETE_TYPE_LABEL_STYLE: Record<string, string | number> = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  color: "var(--text-muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 6,
  display: "block",
};

export function secureDeleteTypeInputStyle(
  typed: string,
  typedValue: string,
): Record<string, string | number> {
  return {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--bg-input)",
    border: `1px solid ${
      typed === typedValue ? "var(--success-border)" : "var(--border-default)"
    }`,
    borderRadius: 6,
    padding: "8px 12px",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-primary)",
    outline: "none",
    transition: "border-color 0.15s",
  };
}

export const SECURE_DELETE_ACTIONS_STYLE: Record<string, string | number> = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 20,
};

export const SECURE_DELETE_CANCEL_BTN_STYLE: Record<string, string | number> = {
  background: "var(--hover-bg)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "8px 18px",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-secondary)",
  cursor: "pointer",
};

export function secureDeleteConfirmBtnStyle(
  canConfirm: boolean,
): Record<string, string | number> {
  return {
    background: canConfirm ? "var(--status-error)" : "var(--hover-bg)",
    border: "none",
    borderRadius: 6,
    padding: "8px 20px",
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: canConfirm ? "white" : "var(--text-muted)",
    cursor: canConfirm ? "pointer" : "not-allowed",
    transition: "background 0.15s",
  };
}

/** Bundle matching the original `S` map shape for drop-in wiring. */
export function buildSecureDeleteStyles(opts: {
  isOwner: boolean;
  typed: string;
  typedValue: string;
  canConfirm: boolean;
}) {
  return {
    overlay: SECURE_DELETE_OVERLAY_STYLE,
    dialog: SECURE_DELETE_DIALOG_STYLE,
    header: SECURE_DELETE_HEADER_STYLE,
    headerText: SECURE_DELETE_HEADER_TEXT_STYLE,
    desc: SECURE_DELETE_DESC_STYLE,
    ownerBox: SECURE_DELETE_OWNER_BOX_STYLE,
    ownerLabel: SECURE_DELETE_OWNER_LABEL_STYLE,
    ownerValue: secureDeleteOwnerValueStyle(opts.isOwner),
    blockBox: SECURE_DELETE_BLOCK_BOX_STYLE,
    blockText: SECURE_DELETE_BLOCK_TEXT_STYLE,
    typeLabel: SECURE_DELETE_TYPE_LABEL_STYLE,
    typeInput: secureDeleteTypeInputStyle(opts.typed, opts.typedValue),
    actions: SECURE_DELETE_ACTIONS_STYLE,
    cancelBtn: SECURE_DELETE_CANCEL_BTN_STYLE,
    deleteBtn: secureDeleteConfirmBtnStyle(opts.canConfirm),
  };
}
