/**
 * Pure style objects for RfiLogImportModal chrome.
 */

export const AI = "var(--ai-accent, var(--status-info))";

export const mono: Record<string, string> = { fontFamily: "var(--font-mono)" };
export const display: Record<string, string> = {
  fontFamily: "'Space Grotesk', var(--font-display)",
};

export const btnPrimary: Record<string, string | number> = {
  padding: "8px 22px",
  background: AI,
  color: "var(--bg-base)",
  border: "none",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const btnGhost: Record<string, string | number> = {
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

export const projectSelectButtonStyle: Record<string, string | number> = {
  width: "100%",
  minHeight: 36,
  padding: "7px 10px",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textAlign: "left",
  cursor: "pointer",
};

export const projectSelectMenuStyle: Record<string, string | number> = {
  position: "absolute",
  zIndex: 4000,
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  maxHeight: 240,
  overflowY: "auto",
  padding: 4,
  background: "var(--bg-surface-secondary)",
  border: `1px solid color-mix(in srgb, ${AI} 38%, var(--border-default))`,
  borderRadius: 8,
  boxShadow:
    "0 18px 46px color-mix(in srgb, var(--bg-base) 74%, transparent), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 6%, transparent)",
};

export function projectSelectOptionStyle(
  active: boolean,
): Record<string, string | number> {
  return {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid transparent",
    borderRadius: 6,
    background: active ? `color-mix(in srgb, ${AI} 14%, transparent)` : "transparent",
    color: active ? AI : "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontWeight: active ? 800 : 600,
    textAlign: "left",
    cursor: "pointer",
  };
}
