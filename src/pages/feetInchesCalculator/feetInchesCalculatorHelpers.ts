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
