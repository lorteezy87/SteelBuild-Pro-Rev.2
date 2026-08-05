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

export type FractionParts = { num: number; den: number };

export function resolveFractionParts(
  customMode: boolean,
  customNum: string,
  customDen: string,
  common: FractionParts,
): FractionParts {
  if (customMode) {
    return { num: parseFloat(customNum) || 0, den: parseFloat(customDen) || 1 };
  }
  return common;
}

export function validateFractionToDecimalInputs(opts: {
  feet: unknown;
  inches: unknown;
  customMode: boolean;
  customNum: string;
  customDen: string;
  numOrZero: (raw: unknown) => number;
}): string[] {
  const e: string[] = [];
  const f = opts.numOrZero(opts.feet);
  const i = opts.numOrZero(opts.inches);
  if (f < 0 || i < 0) e.push("Negative feet / inches are not allowed.");
  if (opts.customMode) {
    const cn = parseFloat(opts.customNum);
    const cd = parseFloat(opts.customDen);
    if (opts.customNum !== "" && (!Number.isFinite(cn) || cn < 0)) e.push("Numerator must be non-negative.");
    if (!Number.isFinite(cd) || cd <= 0) e.push("Denominator must be a positive number.");
  }
  return e;
}

export function formatFeetInchesPreview(
  feet: unknown,
  inches: unknown,
  fraction: FractionParts,
  numOrZero: (raw: unknown) => number,
): string {
  const f = numOrZero(feet);
  const i = numOrZero(inches);
  const frac = (fraction.num > 0 && fraction.den > 0)
    ? `${fraction.num}/${fraction.den}`
    : "";
  const inchPart = frac
    ? (i > 0 ? `${i} ${frac}"` : `${frac}"`)
    : `${i}"`;
  return `${f}'-${inchPart}`;
}
