/**
 * Pure chrome tokens for ModelElementImportModal.
 */

export const mono: Record<string, string> = { fontFamily: "var(--font-mono)" };
export const display: Record<string, string> = {
  fontFamily: "'Space Grotesk', var(--font-display)",
};
export const ACCENT = "var(--accent, #3B82F6)";

export const MATCH_BADGE: Record<string, { label: string; color: string }> = {
  matched: { label: "linked", color: "var(--status-success)" },
  ambiguous: { label: "ambiguous", color: "var(--status-warning)" },
  none: { label: "—", color: "var(--text-muted)" },
};
