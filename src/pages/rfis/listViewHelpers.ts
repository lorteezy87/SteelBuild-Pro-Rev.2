/** Pure layout tokens for RFI ListView. */

export const RFI_LIST_GRID_COLS =
  "28px 80px 2fr 90px 100px 110px 72px 52px 52px 90px";

export const RFI_LIST_ACTION_BTN = {
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  borderRadius: 4,
  padding: "4px 8px",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 700,
  minHeight: 28,
  cursor: "pointer" as const,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
};
