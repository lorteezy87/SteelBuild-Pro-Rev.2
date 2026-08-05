import { parseLength } from "@/utils/lengthMath";
/**
 * Pure helpers for Feet/Inches Calculator.
 */

export const OPS = { ADD: "+", SUB: "−", MUL: "×", DIV: "÷" } as const;

export function applyOp(
  aTicks: number,
  op: string,
  bTicksOrNumber: number,
): number | null {
  switch (op) {
    case OPS.ADD:
      return aTicks + bTicksOrNumber;
    case OPS.SUB:
      return aTicks - bTicksOrNumber;
    case OPS.MUL:
      return Math.round(aTicks * bTicksOrNumber);
    case OPS.DIV:
      if (!bTicksOrNumber) return null;
      return Math.round(aTicks / bTicksOrNumber);
    default:
      return bTicksOrNumber;
  }
}

export function fracLabel(den: number): string {
  return `1/${den}`;
}

/** Parse calculator entry: bare number in mul/div mode, otherwise a length. */
export function parseFeetInchesEntry(entry: string, mulDivMode: boolean): number | null {
  const s = (entry || "").trim();
  if (!s) return null;
  if (mulDivMode) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return parseLength(s);
}

