import { parseLength, TICKS_PER_FOOT } from "@/utils/lengthMath";
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

export type CommitInput = {
  entry: string;
  mulDivMode: boolean;
  accum: number;
  pendingOp: string | null;
  precision: number;
  nextOp: string | null | undefined;
  formatLength: (ticks: number, precision: number) => string;
};

export type CommitOk = {
  ok: true;
  nextAccum: number;
  pendingOp: string | null;
  mulDivMode: boolean;
  /** Tape row to push, or null if nothing to record. */
  tape: { expr: string; value: string; ticks: number } | null;
};

export type CommitErr = {
  ok: false;
  error: string;
};

/** Pure commit of current entry against pending op (desktop-calculator semantics). */
export function computeFeetInchesCommit(input: CommitInput): CommitOk | CommitErr {
  const { entry, mulDivMode, accum, pendingOp, precision, nextOp, formatLength } = input;
  const value = parseFeetInchesEntry(entry, mulDivMode);
  if (value == null && (entry || "").trim() !== "") {
    return { ok: false, error: "Couldn't parse that length." };
  }
  let nextAccum = accum;
  let exprLine = "";
  if (pendingOp && value != null) {
    const applied = applyOp(accum, pendingOp, value);
    if (applied == null) {
      return {
        ok: false,
        error: pendingOp === OPS.DIV ? "Divide by zero" : "Bad op",
      };
    }
    nextAccum = applied;
    const rhsText = mulDivMode ? String(value) : formatLength(value, precision);
    exprLine = `${formatLength(accum, precision)} ${pendingOp} ${rhsText}`;
  } else if (value != null) {
    nextAccum = value;
    exprLine = "load";
  }
  const resolvedNextOp = nextOp || null;
  return {
    ok: true,
    nextAccum,
    pendingOp: resolvedNextOp,
    mulDivMode: resolvedNextOp === OPS.MUL || resolvedNextOp === OPS.DIV,
    tape: exprLine
      ? {
          expr: exprLine,
          value: formatLength(nextAccum, precision),
          ticks: nextAccum,
        }
      : null,
  };
}

export function createEmptyFeetInchesState(): {
  accum: number;
  pendingOp: null;
  entry: string;
  mulDivMode: false;
} {
  return { accum: 0, pendingOp: null, entry: "", mulDivMode: false };
}

export const monoStyle = { fontFamily: "var(--font-mono)" } as const;

/** Stock length presets for the cut-list optimizer (20'/40'/60'). */
export const STOCK_PRESETS = [
  { label: "20'", ticks: 20 * TICKS_PER_FOOT },
  { label: "40'", ticks: 40 * TICKS_PER_FOOT },
  { label: "60'", ticks: 60 * TICKS_PER_FOOT },
] as const;

export const CUT_LIST_INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "var(--text-primary)",
  fontSize: 14,
  ...monoStyle,
  outline: "none",
  boxSizing: "border-box",
};

export const CUT_LIST_FIELD_LABEL: Record<string, string | number> = {
  ...monoStyle,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 4,
  display: "block",
};
