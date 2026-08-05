/**
 * Pure chrome for AutoLinkSuggestions chips.
 */

export const AUTO_LINK_CHIP_STYLE: Record<string, string | number> = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 8px",
  borderRadius: 6,
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  cursor: "pointer",
  border: "1px solid rgba(200,155,32,0.3)",
  background: "rgba(200,155,32,0.08)",
  color: "var(--accent)",
  transition: "all 0.15s ease",
};
