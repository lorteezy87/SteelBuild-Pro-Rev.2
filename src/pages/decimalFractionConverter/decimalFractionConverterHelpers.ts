/**
 * Pure helpers for Decimal/Fraction Converter.
 */
const mono = { fontFamily: "var(--font-mono)" };

// Keep mode keys in sync with page DECIMAL_MODES.
export const DECIMAL_MODE_FEET = "feet";
export const DECIMAL_MODE_INCHES = "inches";

export function toggleStyle(active: boolean): Record<string, unknown> {
  return {
    ...mono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: "6px 12px",
    borderRadius: 4,
    cursor: "pointer",
    background: active ? "var(--accent)" : "var(--bg-surface-low)",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
    textTransform: "uppercase",
  };
}

export function deltaDisplay(delta: number, mode: string): string {
  const abs = Math.abs(delta);
  if (mode === DECIMAL_MODE_FEET || mode === "feet") return `${abs.toFixed(5)} ft`;
  return `${abs.toFixed(4)}"`;
}

export function numOrZero(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n = parseFloat(String(raw));
  return Number.isFinite(n) ? n : 0;
}

/** Format a converted number cleanly: trim trailing zeros, up to 6 decimals. */
export function trimNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const fixed = n.toFixed(6);
  return fixed.replace(/\.?0+$/, "");
}
