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

/** Full calculator working state (pure machine). */
export type CalcState = {
  accum: number;
  pendingOp: string | null;
  entry: string;
  justEvaluated: boolean;
};

export type TapeRow = { expr: string; value: number };

export type CalcStepResult = {
  state: CalcState;
  /** Present when op/equals would divide by zero or unary fails. */
  error?: "divide_by_zero" | "sqrt_negative";
  /** Completed binary op to push onto the tape (optional). */
  tape?: TapeRow;
};

export function createInitialCalcState(): CalcState {
  return { accum: 0, pendingOp: null, entry: "", justEvaluated: false };
}

function withTape(
  state: CalcState,
  a: number,
  op: string,
  b: number,
  result: number,
): CalcStepResult {
  return {
    state,
    tape: {
      expr: `${formatNumber(a)} ${op} ${formatNumber(b)} =`,
      value: result,
    },
  };
}

/** Digit or decimal-point entry (including post-equals restart). */
export function applyDigit(state: CalcState, d: string): CalcState {
  if (state.justEvaluated) {
    return {
      accum: 0,
      pendingOp: null,
      entry: d === "." ? "0." : d,
      justEvaluated: false,
    };
  }
  if (d === ".") {
    if (state.entry.includes(".")) return state;
    return {
      ...state,
      entry: state.entry === "" ? "0." : state.entry + ".",
    };
  }
  // Replace a leading zero unless followed by "." (so 0.5 still works).
  if (state.entry === "0") return { ...state, entry: d };
  return { ...state, entry: state.entry + d };
}

/** Bind a binary operator; may evaluate a pending op first. */
export function applyBinaryOp(state: CalcState, op: string): CalcStepResult {
  const justCleared: CalcState = { ...state, justEvaluated: false };
  const value = parseEntryString(justCleared.entry);

  if (value == null && justCleared.pendingOp == null) {
    return { state: { ...justCleared, pendingOp: op } };
  }

  if (justCleared.pendingOp && value != null) {
    const next = applyOp(justCleared.accum, justCleared.pendingOp, value);
    if (next == null) {
      return { state: justCleared, error: "divide_by_zero" };
    }
    return withTape(
      {
        accum: next,
        pendingOp: op,
        entry: "",
        justEvaluated: false,
      },
      justCleared.accum,
      justCleared.pendingOp,
      value,
      next,
    );
  }

  if (value != null) {
    return {
      state: {
        accum: value,
        pendingOp: op,
        entry: "",
        justEvaluated: false,
      },
    };
  }

  return {
    state: {
      ...justCleared,
      entry: "",
      pendingOp: op,
    },
  };
}

/** Evaluate pending binary op (=). */
export function applyEquals(state: CalcState): CalcStepResult {
  const value = parseEntryString(state.entry);
  if (state.pendingOp && value != null) {
    const next = applyOp(state.accum, state.pendingOp, value);
    if (next == null) {
      return { state, error: "divide_by_zero" };
    }
    return withTape(
      {
        accum: next,
        pendingOp: null,
        entry: "",
        justEvaluated: true,
      },
      state.accum,
      state.pendingOp,
      value,
      next,
    );
  }
  if (value != null) {
    return {
      state: {
        accum: value,
        pendingOp: null,
        entry: "",
        justEvaluated: true,
      },
    };
  }
  return { state };
}

export function applyClearAll(_state: CalcState): CalcState {
  return createInitialCalcState();
}

export function applyClearEntry(state: CalcState): CalcState {
  return { ...state, entry: "" };
}

export function applyBackspace(state: CalcState): CalcState {
  if (state.entry === "") {
    // Backspace on a blank entry edits the accumulator instead.
    const s = formatNumber(state.accum).replace(/,/g, "");
    const next = s.length > 1 ? s.slice(0, -1) : "0";
    const n = Number(next);
    return { ...state, accum: Number.isFinite(n) ? n : 0 };
  }
  return { ...state, entry: state.entry.slice(0, -1) };
}

export function applyToggleSign(state: CalcState): CalcState {
  if (state.entry !== "") {
    return {
      ...state,
      entry: state.entry.startsWith("-")
        ? state.entry.slice(1)
        : "-" + state.entry,
    };
  }
  return { ...state, accum: -state.accum };
}

export function applyPercent(state: CalcState): CalcState {
  const value = parseEntryString(state.entry);
  if (value != null) {
    const pct = state.pendingOp ? (state.accum * value) / 100 : value / 100;
    return { ...state, entry: String(pct) };
  }
  return { ...state, accum: state.accum / 100 };
}

export function applyReciprocal(state: CalcState): CalcStepResult {
  const value = parseEntryString(state.entry);
  const target = value != null ? value : state.accum;
  if (target === 0) return { state, error: "divide_by_zero" };
  const r = 1 / target;
  if (state.entry !== "") return { state: { ...state, entry: String(r) } };
  return { state: { ...state, accum: r } };
}

export function applySquare(state: CalcState): CalcState {
  const value = parseEntryString(state.entry);
  const target = value != null ? value : state.accum;
  const sq = target * target;
  if (state.entry !== "") return { ...state, entry: String(sq) };
  return { ...state, accum: sq };
}

export function applySqrt(state: CalcState): CalcStepResult {
  const value = parseEntryString(state.entry);
  const target = value != null ? value : state.accum;
  if (target < 0) return { state, error: "sqrt_negative" };
  const r = Math.sqrt(target);
  if (state.entry !== "") return { state: { ...state, entry: String(r) } };
  return { state: { ...state, accum: r } };
}

/** Displayed value for memory ops: entry if typing, else accum. */
export function displayedValue(state: CalcState): number {
  const v = parseEntryString(state.entry);
  return v != null ? v : state.accum;
}

export function applyMemoryRecall(state: CalcState, memory: number): CalcState {
  return {
    ...state,
    entry: String(memory),
    justEvaluated: false,
  };
}

export function applyMemoryStoreToEntry(
  state: CalcState,
  memory: number,
): CalcState {
  return {
    ...state,
    entry: formatNumber(memory),
    justEvaluated: false,
  };
}

/** Recall a tape row value into entry. */
export function applyTapeRecall(
  state: CalcState,
  row: { value?: number } | number | null | undefined,
): CalcState {
  const value =
    row && typeof row === "object" && row.value != null ? row.value : row;
  return {
    ...state,
    entry: String(value),
    justEvaluated: false,
  };
}

export const monoStyle = { fontFamily: "var(--font-mono)" } as const;
