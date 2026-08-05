/**
 * Pure helpers for Decimal/Fraction Converter.
 */

export const mono: Record<string, string> = { fontFamily: "var(--font-mono)" };

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

export const resultCardStyle: Record<string, string | number> = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--divider)",
  borderRadius: 6,
  padding: "14px 16px",
};

export const deltaLineStyle: Record<string, string | number> = {
  ...mono,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.08em",
  marginTop: 6,
};

export const inlineErrorStyle: Record<string, string | number> = {
  ...mono,
  fontSize: 11,
  fontWeight: 600,
  color: "var(--status-review)",
  background: "var(--status-review-muted, rgba(249,115,22,0.12))",
  border: "1px solid var(--status-review-border, rgba(249,115,22,0.40))",
  padding: "6px 10px",
  borderRadius: 4,
  marginTop: 6,
};

export const DECIMAL_MODES = {
  FEET: "feet",
  INCHES: "inches",
} as const;

export const SUB_MODES = {
  DEC_FRAC: "dec_frac",
  FRAC_DEC: "frac_dec",
  UNITS: "units",
} as const;

export const SUB_MODE_TABS = [
  { key: SUB_MODES.DEC_FRAC, label: "Dec → Frac" },
  { key: SUB_MODES.FRAC_DEC, label: "Frac → Dec" },
  { key: SUB_MODES.UNITS, label: "Units" },
] as const;

export const COMMON_FRACTIONS = [
  { num: 0, den: 1 },
  { num: 1, den: 16 },
  { num: 1, den: 8 },
  { num: 3, den: 16 },
  { num: 1, den: 4 },
  { num: 5, den: 16 },
  { num: 3, den: 8 },
  { num: 7, den: 16 },
  { num: 1, den: 2 },
  { num: 9, den: 16 },
  { num: 5, den: 8 },
  { num: 11, den: 16 },
  { num: 3, den: 4 },
  { num: 13, den: 16 },
  { num: 7, den: 8 },
  { num: 15, den: 16 },
] as const;
