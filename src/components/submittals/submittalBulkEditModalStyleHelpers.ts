/**
 * Pure surface styles for SubmittalBulkEditModal.
 */

export const modalSurfaceStyle: Record<string, string | number> = {
  background:
    "linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface-low) 100%)",
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  boxShadow:
    "0 32px 80px color-mix(in srgb, var(--bg-base) 55%, transparent), 0 0 0 1px var(--bg-hover) inset",
  color: "var(--text-primary)",
};

export const controlSurfaceStyle: Record<string, string | number> = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 12,
  background: "var(--bg-hover)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  boxShadow: "0 1px 0 var(--hover-bg) inset",
  colorScheme: "dark",
};
