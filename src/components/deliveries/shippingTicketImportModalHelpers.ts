/** Pure chrome atoms for ShippingTicketImportModal. */

export const monoStyle = { fontFamily: "var(--font-mono)" } as const;
export const displayStyle = {
  fontFamily: "'Space Grotesk', var(--font-display)",
} as const;
export const AI_ACCENT = "var(--ai-accent, #22D3EE)";

export const IMPORT_BTN_PRIMARY: Record<string, string | number> = {
  padding: "8px 22px",
  background: AI_ACCENT,
  color: "var(--on-accent)",
  border: "none",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const IMPORT_BTN_GHOST: Record<string, string | number> = {
  padding: "8px 18px",
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};
