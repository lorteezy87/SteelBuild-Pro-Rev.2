/**
 * Pure chrome styles for BulkCreateFoldersModal.
 */

export const BULK_FOLDER_OVERLAY_STYLE: Record<string, string | number> = {
  position: "fixed",
  inset: 0,
  background: "color-mix(in srgb, var(--bg-page) 70%, transparent)",
  zIndex: 2000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const BULK_FOLDER_DIALOG_STYLE: Record<string, string | number> = {
  background: "var(--bg-surface-secondary)",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  width: "min(580px, 92vw)",
  maxHeight: "min(720px, 90vh)",
  display: "flex",
  flexDirection: "column",
};

export const BULK_FOLDER_HEADER_STYLE: Record<string, string | number> = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--border-default)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexShrink: 0,
};

export const BULK_FOLDER_BODY_STYLE: Record<string, string | number> = {
  padding: 16,
  flex: 1,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

export const BULK_FOLDER_FOOTER_STYLE: Record<string, string | number> = {
  padding: "12px 16px",
  borderTop: "1px solid var(--border-default)",
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  flexShrink: 0,
};

export function bulkFolderBtnStyle(
  variant: "primary" | "secondary" = "secondary",
  disabled = false,
): Record<string, string | number> {
  return {
    padding: "8px 14px",
    borderRadius: 6,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    border: variant === "primary" ? "1px solid var(--accent)" : "1px solid var(--border-default)",
    background: variant === "primary" ? "var(--accent)" : "transparent",
    color: variant === "primary" ? "var(--bg-base)" : "var(--text-primary)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}
