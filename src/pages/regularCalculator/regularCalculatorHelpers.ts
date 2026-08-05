/** Pure math/display helpers for RegularCalculator. */

export const OPS = {
  ADD: "+",
  SUB: "−",
  MUL: "×",
  DIV: "÷",
} as const;

export type OpSymbol = (typeof OPS)[keyof typeof OPS];

export function applyOp(a: number, op: string | null | undefined, b: number): number | null {
  switch (op) {
    case OPS.ADD:
      return a + b;
    case OPS.SUB:
      return a - b;
    case OPS.MUL:
      return a * b;
    case OPS.DIV:
      return b === 0 ? null : a / b;
    default:
      return b;
  }
}

/** Format with up to 12 significant digits; group thousands on the integer half. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(6);
  const fixed = Number(n.toFixed(10)).toString();
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

export function computeDisplay(entry: string, accum: number): string {
  if (entry !== "") return entry;
  return formatNumber(accum);
}

export function computeAux(
  pendingOp: string | null | undefined,
  accum: number,
  entry: string,
): string {
  if (pendingOp) return `${formatNumber(accum)} ${pendingOp}`;
  if (entry === "" && accum !== 0) return "ANS";
  return "";
}

export function parseEntryString(entry: string): number | null {
  const s = (entry || "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
