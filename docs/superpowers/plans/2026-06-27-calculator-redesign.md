# Construction Calculator Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the 5-calculator suite into one cohesive, tactile "construction calculator" (device shell + keypad + LCD display) on SteelBuild Dark, preserving every feature and adding fab/estimation tools (cut-list optimizer, steel cost, unit conversions, takeoff export), reusing all existing tested math.

**Architecture:** New shared device kit in `src/components/calculators/` (Shell/Display/Key/Keypad/Tape + `useCalcTape` localStorage hook + `calc.css`). Pure engines in `src/utils/` — extract `lengthMath.js` from the FeetInches page, add `cutListOptimizer.js`, `steelCost.js`, `unitConversions.js` (all TDD). Keep `fractionConversion.js`, `riggingCalculations.js`, `aiscShapes.js`. The 5 page components become thin tool views consuming the shell; routes + `?calc_tab=` preserved.

**Tech Stack:** Vite + React, Vitest (node + jsdom), SteelBuild Dark CSS tokens, no new dependencies. Sonner for toasts (existing).

**Spec:** `docs/superpowers/specs/2026-06-27-calculator-redesign-design.md`

**Branch:** `claude/calculator-redesign` (already checked out — commit here; do NOT push or deploy; the owner reviews the running result before any merge).

**Shared facts:**
- Ft-in math (currently in `src/pages/FeetInchesCalculator.jsx`): `TICKS_PER_INCH=32`, `TICKS_PER_FOOT=384`; exports `parseLength(raw)->ticks|null`, `formatLength(ticks, precisionDen=16)->string`, `ticksToDecimalFeet/ticksToDecimalInches/decimalFeetToTicks`. `SteelWeightCalculator` imports these FROM the page today (fragile — this plan fixes that).
- AISC data (`src/data/aiscShapes.js`): `SHAPE_FAMILIES`, `findShape(designation)->{designation,weightPerFoot,family,familyLabel}|null`, `computeDynamicLbPerFt(kind,dims)->number|null`, density constants.
- Hub: `src/pages/CalculatorsHub.jsx` — `TABS` array, `?calc_tab=` URL param, lazy + Suspense. Routes in `src/config/routes.js` (CalculatorsHub/Calculator/FeetInchesCalculator/SteelWeightCalculator/CranePickCalculator/DecimalFractionConverter).
- Run on Windows with `npx vitest run --maxWorkers=2` for a reliable full-suite signal.

---

# PHASE A — Pure engines (TDD)

## Task 1: Extract `lengthMath.js`

**Files:**
- Create: `src/utils/lengthMath.js`, `src/utils/__tests__/lengthMath.test.js`
- Modify: `src/pages/FeetInchesCalculator.jsx` (import from the util, keep thin re-exports), `src/pages/SteelWeightCalculator.jsx` (import from the util)

- [ ] **Step 1: Write the test**

Create `src/utils/__tests__/lengthMath.test.js`:
```javascript
import { describe, it, expect } from "vitest";
import {
  TICKS_PER_INCH, TICKS_PER_FOOT,
  parseLength, formatLength, ticksToDecimalFeet, ticksToDecimalInches, decimalFeetToTicks,
} from "../lengthMath";

describe("lengthMath constants", () => {
  it("uses 32nd-inch ticks", () => {
    expect(TICKS_PER_INCH).toBe(32);
    expect(TICKS_PER_FOOT).toBe(384);
  });
});

describe("parseLength", () => {
  it("parses ft-in-fraction forms to ticks", () => {
    expect(parseLength(`12'6 1/2"`)).toBe(12 * 384 + 6 * 32 + 16); // 4816
    expect(parseLength("12-6-1/2")).toBe(4816);
    expect(parseLength("12 6 1/2")).toBe(4816);
  });
  it("parses a bare decimal as inches", () => {
    expect(parseLength("150")).toBe(Math.round(150 * 32));
    expect(parseLength(`6.5"`)).toBe(Math.round(6.5 * 32));
  });
  it("parses decimal feet with a ft suffix", () => {
    expect(parseLength("8.25ft")).toBe(Math.round(8.25 * 384));
  });
  it("returns null for garbage", () => {
    expect(parseLength("abc")).toBeNull();
    expect(parseLength("")).toBeNull();
  });
});

describe("formatLength", () => {
  it("formats ticks back to ft-in-fraction at the requested precision", () => {
    expect(formatLength(4816, 16)).toContain("12'");
    expect(formatLength(4816, 16)).toContain(`6 1/2"`);
  });
  it("rounds to the precision denominator", () => {
    // 1/32" over 6" at 1/16 precision rounds down to 6"
    expect(formatLength(6 * 32 + 1, 16)).toContain(`6"`);
  });
});

describe("tick<->decimal", () => {
  it("round-trips decimal feet", () => {
    expect(ticksToDecimalFeet(384)).toBe(1);
    expect(decimalFeetToTicks(1)).toBe(384);
    expect(ticksToDecimalInches(32)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it — FAIL** (`npx vitest run src/utils/__tests__/lengthMath.test.js`) — cannot resolve `../lengthMath`.

- [ ] **Step 3: Create `src/utils/lengthMath.js`** by MOVING the relevant code from `src/pages/FeetInchesCalculator.jsx` **verbatim**: `TICKS_PER_INCH`, `TICKS_PER_FOOT`, `parseLength`, `formatLength`, `ticksToDecimalFeet`, `ticksToDecimalInches`, `decimalFeetToTicks` (lines ~28-29 and 49-203). Export each. Do not change the logic — copy byte-for-byte, only relocate. Add a top comment: `// lengthMath.js — 32nd-inch tick math for ft-in-fraction lengths (extracted from FeetInchesCalculator).`

- [ ] **Step 4:** In `FeetInchesCalculator.jsx`, REMOVE the moved definitions and instead `import { TICKS_PER_INCH, TICKS_PER_FOOT, parseLength, formatLength, ticksToDecimalFeet, ticksToDecimalInches, decimalFeetToTicks } from "@/utils/lengthMath";`. Keep `export { parseLength, formatLength, ticksToDecimalFeet }` re-exports at the bottom **only if** other files import them from the page (grep `from "@/pages/FeetInchesCalculator"` — `SteelWeightCalculator` does). Better: update `SteelWeightCalculator.jsx` to import directly from `@/utils/lengthMath` and drop the page re-exports.

- [ ] **Step 5: Run** `npx vitest run src/utils/__tests__/lengthMath.test.js` (PASS), then `npm test 2>&1 | tail -20` — the existing FeetInches/SteelWeight behavior must be unchanged. Build: `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -6` EXIT 0.

- [ ] **Step 6: Commit**
```bash
git add src/utils/lengthMath.js src/utils/__tests__/lengthMath.test.js src/pages/FeetInchesCalculator.jsx src/pages/SteelWeightCalculator.jsx
git commit -m "refactor(calc): extract tested lengthMath util from FeetInches page"
```

## Task 2: `cutListOptimizer.js`

**Files:** Create `src/utils/cutListOptimizer.js`, `src/utils/__tests__/cutListOptimizer.test.js`

- [ ] **Step 1: Test**
```javascript
import { describe, it, expect } from "vitest";
import { optimizeCutList } from "../cutListOptimizer";

// All lengths in 32nd-inch ticks. 20 ft = 7680 ticks; 10 ft = 3840.
describe("optimizeCutList", () => {
  it("computes pieces per stick, sticks needed, drop and waste% (exact fit)", () => {
    // 10ft parts, qty 4, 20ft stock, no kerf -> 2 per stick, 2 sticks, 0 drop
    const r = optimizeCutList({ partTicks: 3840, qty: 4, stockTicks: 7680, kerfTicks: 0 });
    expect(r.perStick).toBe(2);
    expect(r.sticksNeeded).toBe(2);
    expect(r.totalStockTicks).toBe(2 * 7680);
    expect(r.usedTicks).toBe(4 * 3840);
    expect(r.dropTicks).toBe(0);
    expect(r.wastePct).toBe(0);
  });
  it("computes drop + waste when parts don't fill the stick", () => {
    // 7ft parts (2688), qty 3, 20ft stock (7680) -> floor(7680/2688)=2 per stick, ceil(3/2)=2 sticks
    const r = optimizeCutList({ partTicks: 2688, qty: 3, stockTicks: 7680, kerfTicks: 0 });
    expect(r.perStick).toBe(2);
    expect(r.sticksNeeded).toBe(2);
    expect(r.usedTicks).toBe(3 * 2688);
    expect(r.dropTicks).toBe(2 * 7680 - 3 * 2688);
    expect(r.wastePct).toBeCloseTo((r.dropTicks / r.totalStockTicks) * 100, 4);
  });
  it("accounts for saw kerf between cuts", () => {
    // part 3840, kerf 32 (1in): each cut consumes 3840+32 except the last per stick.
    // perStick = floor((stock + kerf) / (part + kerf)); (7680+32)/(3872)=1 -> 1 per stick
    const r = optimizeCutList({ partTicks: 3840, qty: 2, stockTicks: 7680, kerfTicks: 32 });
    expect(r.perStick).toBe(1);
    expect(r.sticksNeeded).toBe(2);
  });
  it("returns null/zeroed result for invalid input", () => {
    expect(optimizeCutList({ partTicks: 0, qty: 1, stockTicks: 7680 })).toBeNull();
    expect(optimizeCutList({ partTicks: 100, qty: 0, stockTicks: 7680 })).toBeNull();
    expect(optimizeCutList({ partTicks: 8000, qty: 1, stockTicks: 7680 })).toBeNull(); // part longer than stock
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement `src/utils/cutListOptimizer.js`**
```javascript
// cutListOptimizer.js — how many stock sticks to cut N parts of a given length,
// with saw kerf, plus drop/waste. All lengths are 32nd-inch ticks (see lengthMath).
/**
 * @param {{partTicks:number, qty:number, stockTicks:number, kerfTicks?:number}} input
 * @returns {{perStick:number, sticksNeeded:number, totalStockTicks:number,
 *            usedTicks:number, dropTicks:number, wastePct:number} | null}
 */
export function optimizeCutList({ partTicks, qty, stockTicks, kerfTicks = 0 }) {
  const p = Number(partTicks), n = Number(qty), s = Number(stockTicks), k = Math.max(0, Number(kerfTicks) || 0);
  if (!Number.isFinite(p) || !Number.isFinite(n) || !Number.isFinite(s)) return null;
  if (p <= 0 || n <= 0 || s <= 0) return null;
  if (p > s) return null; // a single part doesn't fit a stick
  // With kerf between cuts: m parts need m*p + (m-1)*k <= s  =>  m <= (s + k)/(p + k)
  const perStick = Math.max(1, Math.floor((s + k) / (p + k)));
  const sticksNeeded = Math.ceil(n / perStick);
  const totalStockTicks = sticksNeeded * s;
  const usedTicks = n * p; // material that becomes parts (kerf is waste)
  const dropTicks = totalStockTicks - usedTicks;
  const wastePct = totalStockTicks > 0 ? (dropTicks / totalStockTicks) * 100 : 0;
  return { perStick, sticksNeeded, totalStockTicks, usedTicks, dropTicks, wastePct };
}
```

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit**
```bash
git add src/utils/cutListOptimizer.js src/utils/__tests__/cutListOptimizer.test.js
git commit -m "feat(calc): cut-list / stock-length optimizer engine"
```

## Task 3: `steelCost.js`

**Files:** Create `src/utils/steelCost.js`, `src/utils/__tests__/steelCost.test.js`

- [ ] **Step 1: Test**
```javascript
import { describe, it, expect } from "vitest";
import { pieceCost, rollupCost, COST_UNITS } from "../steelCost";

describe("pieceCost", () => {
  it("prices per lb", () => { expect(pieceCost(1000, 0.85, "/lb")).toBeCloseTo(850, 6); });
  it("prices per cwt (hundredweight = 100 lb)", () => { expect(pieceCost(1000, 65, "/cwt")).toBeCloseTo(650, 6); });
  it("prices per ton (2000 lb)", () => { expect(pieceCost(1000, 1200, "/ton")).toBeCloseTo(600, 6); });
  it("returns 0 for a blank/zero rate or weight", () => {
    expect(pieceCost(1000, 0, "/lb")).toBe(0);
    expect(pieceCost(0, 0.85, "/lb")).toBe(0);
    expect(pieceCost(1000, NaN, "/lb")).toBe(0);
  });
  it("exposes the unit list", () => { expect(COST_UNITS).toEqual(["/lb", "/cwt", "/ton"]); });
});

describe("rollupCost", () => {
  it("sums piece costs", () => {
    expect(rollupCost([{ cost: 850 }, { cost: 600 }, { cost: 0 }])).toBeCloseTo(1450, 6);
    expect(rollupCost([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement `src/utils/steelCost.js`**
```javascript
// steelCost.js — turn a steel weight (lb) into $ at a $/lb, $/cwt, or $/ton rate.
export const COST_UNITS = ["/lb", "/cwt", "/ton"];
const LB_PER_UNIT = { "/lb": 1, "/cwt": 100, "/ton": 2000 };
/** Cost of one piece: weightLb at the given rate/unit. Blank/invalid -> 0. */
export function pieceCost(weightLb, rate, unit) {
  const w = Number(weightLb), r = Number(rate), per = LB_PER_UNIT[unit];
  if (!per || !Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return 0;
  return (w / per) * r;
}
/** Sum of row.cost over a running-total list. */
export function rollupCost(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, r) => sum + (Number(r?.cost) || 0), 0);
}
```

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit**
```bash
git add src/utils/steelCost.js src/utils/__tests__/steelCost.test.js
git commit -m "feat(calc): steel cost engine ($/lb, $/cwt, $/ton)"
```

## Task 4: `unitConversions.js`

**Files:** Create `src/utils/unitConversions.js`, `src/utils/__tests__/unitConversions.test.js`

- [ ] **Step 1: Test**
```javascript
import { describe, it, expect } from "vitest";
import { convert, CONVERSIONS } from "../unitConversions";

describe("convert", () => {
  it("length in<->mm", () => {
    expect(convert(1, "in", "mm")).toBeCloseTo(25.4, 6);
    expect(convert(25.4, "mm", "in")).toBeCloseTo(1, 6);
  });
  it("length ft<->m", () => { expect(convert(1, "ft", "m")).toBeCloseTo(0.3048, 6); });
  it("weight lb<->kg", () => { expect(convert(1, "lb", "kg")).toBeCloseTo(0.45359237, 6); });
  it("weight ton<->tonne", () => { expect(convert(1, "ton", "tonne")).toBeCloseTo(0.90718474, 6); });
  it("linear density lb/ft<->kg/m", () => { expect(convert(1, "lb/ft", "kg/m")).toBeCloseTo(1.48816394, 6); });
  it("stress ksi<->MPa", () => { expect(convert(1, "ksi", "MPa")).toBeCloseTo(6.89475729, 6); });
  it("temperature F<->C (affine)", () => {
    expect(convert(32, "degF", "degC")).toBeCloseTo(0, 6);
    expect(convert(212, "degF", "degC")).toBeCloseTo(100, 6);
    expect(convert(0, "degC", "degF")).toBeCloseTo(32, 6);
  });
  it("returns null across incompatible categories", () => {
    expect(convert(1, "in", "kg")).toBeNull();
  });
  it("exposes categories for the UI", () => {
    expect(CONVERSIONS.length).toBeGreaterThan(0);
    expect(CONVERSIONS.find((c) => c.id === "length").units).toContain("mm");
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement `src/utils/unitConversions.js`**
```javascript
// unitConversions.js — imperial<->metric conversions common to steel work.
// Linear units convert via a base factor (to a category base); temperature is affine.
const LINEAR = {
  length: { base: "mm", units: { mm: 1, in: 25.4, ft: 304.8, m: 1000 } },
  weight: { base: "kg", units: { kg: 1, lb: 0.45359237, ton: 907.18474, tonne: 1000 } },
  lindensity: { base: "kg/m", units: { "kg/m": 1, "lb/ft": 1.48816394 } },
  stress: { base: "MPa", units: { MPa: 1, ksi: 6.89475729 } },
};
const TEMP = { degF: "degF", degC: "degC" };

export function convert(value, from, to) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (from === to) return v;
  // temperature (affine, its own category)
  if (TEMP[from] && TEMP[to]) {
    if (from === "degF" && to === "degC") return (v - 32) * (5 / 9);
    if (from === "degC" && to === "degF") return v * (9 / 5) + 32;
    return v;
  }
  for (const cat of Object.values(LINEAR)) {
    if (from in cat.units && to in cat.units) {
      return (v * cat.units[from]) / cat.units[to];
    }
  }
  return null; // incompatible / unknown
}

// UI-facing category list (label + selectable units, base first for sensible defaults).
export const CONVERSIONS = [
  { id: "length", label: "Length", units: ["in", "mm", "ft", "m"] },
  { id: "weight", label: "Weight", units: ["lb", "kg", "ton", "tonne"] },
  { id: "lindensity", label: "Weight / Length", units: ["lb/ft", "kg/m"] },
  { id: "stress", label: "Stress", units: ["ksi", "MPa"] },
  { id: "temp", label: "Temperature", units: ["degF", "degC"] },
];
```

- [ ] **Step 4: Run — PASS.** (Note: the `temp` UI category maps to `degF`/`degC` keys handled by the affine branch.)

- [ ] **Step 5: Commit**
```bash
git add src/utils/unitConversions.js src/utils/__tests__/unitConversions.test.js
git commit -m "feat(calc): steel/imperial-metric unit conversion engine"
```

---

# PHASE B — Shared device kit

## Task 5: `calc.css` + `CalcKey`

**Files:** Create `src/components/calculators/calc.css`, `src/components/calculators/CalcKey.jsx`, `src/components/calculators/__tests__/CalcKey.test.jsx`

- [ ] **Step 1: Failing jsdom test**
```jsx
// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CalcKey from "../CalcKey";

describe("CalcKey", () => {
  it("renders primary + secondary labels and fires onPress", () => {
    const onPress = vi.fn();
    render(<CalcKey label="7" secondary="" onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: /7/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it("shows the secondary/shift label when given", () => {
    render(<CalcKey label="x²" secondary="q" onPress={() => {}} />);
    expect(screen.getByText("q")).toBeInTheDocument();
  });
  it("applies the variant class and disabled state", () => {
    const onPress = vi.fn();
    render(<CalcKey label="÷" variant="op" disabled onPress={onPress} />);
    const btn = screen.getByRole("button", { name: /÷/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onPress).not.toHaveBeenCalled();
    expect(btn.className).toMatch(/sbd-calc-key--op/);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** `calc.css` (tokens only — keycap face/edge/press, display, shell; e.g. `.sbd-calc-key` min-height 48px, `background: var(--bg-surface)`, `border:1px solid var(--border-strong)`, `box-shadow: 0 1px 0 var(--border-strong), inset 0 1px 0 rgba(255,255,255,0.04)`, `:active{ transform: translateY(1px); }`; `--op` → accent text/border; `--fn` muted; `--accent` filled accent; `--danger` error; `.sbd-calc-key__sec` small top-right). `CalcKey.jsx`:
```jsx
import "./calc.css";
/** A tactile calculator key. variant: digit|op|fn|accent|danger. */
export default function CalcKey({ label, secondary = "", onPress, variant = "digit", disabled = false, wide = false, ariaLabel }) {
  return (
    <button type="button" disabled={disabled} onClick={disabled ? undefined : onPress}
      aria-label={ariaLabel || String(label)}
      className={`sbd-calc-key sbd-calc-key--${variant}${wide ? " sbd-calc-key--wide" : ""}`}>
      {secondary ? <span className="sbd-calc-key__sec">{secondary}</span> : null}
      <span className="sbd-calc-key__label">{label}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run — PASS.** Build EXIT 0.
- [ ] **Step 5: Commit** `feat(calc): tactile CalcKey + keycap styles`.

## Task 6: `CalcDisplay` + `CalcKeypad`

**Files:** Create `CalcDisplay.jsx`, `CalcKeypad.jsx`, `__tests__/CalcDisplay.test.jsx`

- [ ] **Step 1: Test** — `CalcDisplay` shows the primary value (mono, large), an optional `aux` line (e.g. pending op / decimal conversion), and a memory indicator dot when `memoryActive`. `CalcKeypad` renders children in a responsive CSS grid (`role="group"`). Write jsdom tests asserting: the primary value text renders; `aux` renders when passed; the memory chip appears only when `memoryActive`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** both, tokens only. `CalcDisplay({ value, aux, memoryActive, onCopy })` — clicking the value calls `onCopy` (copy-to-clipboard pattern from the existing calculators). `CalcKeypad({ columns=4, children })` — `display:grid; gridTemplateColumns: repeat(columns, 1fr); gap:8px;` with a class that drops to fewer columns under ~360px.
- [ ] **Step 4: PASS.** Build EXIT 0.
- [ ] **Step 5: Commit** `feat(calc): CalcDisplay + CalcKeypad primitives`.

## Task 7: `useCalcTape` + `CalcTape`

**Files:** Create `useCalcTape.js`, `CalcTape.jsx`, `__tests__/useCalcTape.test.js`

- [ ] **Step 1: Test** (node env; mock localStorage) — `useCalcTape("calc:standard", 30)` returns `{ rows, push, clear }`; `push(entry)` prepends and caps at the limit; rows persist to `localStorage` under the key and re-hydrate on init; `clear()` empties and clears storage. Use `@testing-library/react`'s `renderHook` (jsdom) OR test a pure `tapeReducer`/`loadTape`/`saveTape` helper module in node. PREFER extracting pure `tapeStore.js` (`load(key)`, `save(key, rows)`, `pushRow(rows, entry, limit)`) and unit-testing that in node; the hook is a thin wrapper.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** `tapeStore.js` (pure, tested) + `useCalcTape.js` (wraps it with `useState` + `useEffect` persistence, guards `try/catch` around localStorage for SSR/quota) + `CalcTape.jsx` (renders rows with click-to-recall via `onRecall(row)` and a clear button; matches the existing tape styling).
- [ ] **Step 4: PASS.** Build EXIT 0.
- [ ] **Step 5: Commit** `feat(calc): persistent tape (useCalcTape + tapeStore)`.

## Task 8: `CalculatorShell`

**Files:** Create `CalculatorShell.jsx`, `__tests__/CalculatorShell.test.jsx`

- [ ] **Step 1: Test** (jsdom) — `CalculatorShell({ tools, activeTool, onSelect, children })` renders a tool rail with one button per tool, marks the active one (`aria-pressed`/active class), fires `onSelect(id)` on click, and renders `children` in the body. Assert: all tool labels render; clicking a tool calls `onSelect` with its id; active tool has the active treatment.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — the device frame: a header (title), a segmented **tool rail** (keyboard-navigable: arrow keys move focus, Enter selects; each button ≥44px), and a `.sbd-card` body wrapping `children`. Tokens only; the rail uses accent for the active tool. No routing inside the shell — it's controlled (`activeTool`/`onSelect`).
- [ ] **Step 4: PASS.** Build EXIT 0.
- [ ] **Step 5: Commit** `feat(calc): CalculatorShell device frame + tool rail`.

---

# PHASE C — Per-tool reskin (reuse all math; preserve every feature)

> For each tool: READ the existing page first. Preserve EVERY feature listed. Swap the chrome to the shared kit (CalcKey/CalcDisplay/CalcKeypad/CalcTape inside the shell), keep the state machine + math imports intact, and run the existing tests after. Each tool keeps its route + default export; the Hub (Task 14) mounts them in the shell.

## Task 9: Standard calculator → device

**File:** Modify `src/pages/RegularCalculator.jsx`

- [ ] **Step 1:** READ the page. Keep its full state machine + all handlers (digit/op/=/AC/CE/⌫/±/%/1/x/x²/√/memory/copy/tape) and ALL keyboard shortcuts. Replace the bespoke display + button grid with `CalcDisplay` (value + memory chip) over `CalcKeypad` of `CalcKey`s — one key per existing button, same labels, `variant="op"` for ÷×−+=, `variant="accent"` for `=`, `variant="fn"` for MC/MR/M±/sci, `variant="danger"` for AC. Secondary labels = the existing keyboard shortcut hints. Wire the tape to `useCalcTape("calc:standard", 30)` (persistent) with recall.
- [ ] **Step 2:** Verify every prior feature works: `npx vitest run src/pages` (if a RegularCalculator test exists, keep it green; if not, add a jsdom smoke test: press `7 × 8 =` → display shows `56`; M+ then MR recalls; tape has a row). lint/typecheck/build EXIT 0.
- [ ] **Step 3: Commit** `feat(calc): Standard calculator reskinned to the device keypad`.

## Task 10: Feet-Inches → device + cut-list optimizer

**File:** Modify `src/pages/FeetInchesCalculator.jsx`

- [ ] **Step 1:** READ the page. Keep the state machine, parsing/formatting (now from `@/utils/lengthMath`), precision selector, memory, tape, decimal-ft/in/mm conversion strip, fraction quick-keys, `'`/`"` keys, and ALL keyboard handling (incl. the context-aware `-`/`/`). Reskin to `CalcDisplay` (running total + pending-op + the decimal conversion as `aux`) over a `CalcKeypad` with digit keys + dedicated **Feet**, **Inch**, **/** keys + fraction quick-keys + ÷×−+= + memory. Tape via `useCalcTape("calc:feetinches", 20)`.
- [ ] **Step 2: ADD the Cut-List & Stock Optimizer** as a collapsible panel (or a sub-mode toggle) within the tool. Inputs: part length (an ft-in input reusing `parseLength`), quantity, stock length (preset chips 20'/40'/60' + custom ft-in), optional kerf (default 0, e.g. 1/8"). On change, call `optimizeCutList({ partTicks, qty, stockTicks, kerfTicks })` and render: pieces per stick, sticks needed, total stock (`formatLength`), total drop (`formatLength`), waste % (1 decimal). Guard the null result (part>stock or invalid) with a friendly message. Representative result render:
```jsx
{cut && (
  <div className="sbd-card" style={{ /* tokens */ }}>
    <Row label="Pieces / stick" value={cut.perStick} />
    <Row label="Sticks needed" value={cut.sticksNeeded} />
    <Row label="Total stock" value={formatLength(cut.totalStockTicks, precisionDen)} />
    <Row label="Total drop" value={formatLength(cut.dropTicks, precisionDen)} />
    <Row label="Waste" value={`${cut.wastePct.toFixed(1)}%`} />
  </div>
)}
```
- [ ] **Step 3:** Verify: existing ft-in behavior intact (add two lengths, precision change). Add a jsdom smoke test for the optimizer panel (enter 10ft × 4 in 20ft stock → "2 sticks", "0.0%"). lint/typecheck/build EXIT 0.
- [ ] **Step 4: Commit** `feat(calc): Feet-Inches reskin + cut-list / stock optimizer`.

## Task 11: Steel Weight → reskin + cost + export + persistence

**File:** Modify `src/pages/SteelWeightCalculator.jsx`

- [ ] **Step 1:** READ the page. Keep the shape/stock pickers, length modes (now `@/utils/lengthMath`), quantity, calculate, result card, running-total table (per-row delete + grand total lb/tons), copy/clear. Reskin action buttons to `CalcKey`/keycap styling inside the shell chrome (keep the table — it's the right control for a takeoff).
- [ ] **Step 2: ADD cost.** A rate input + unit toggle (`$/lb · $/cwt · $/ton`, persisted to `localStorage`). On calculate, compute `pieceCost(totalWeightLb, rate, unit)`; show piece cost in the result card and a **Cost** column + grand-total cost in the running table (via `rollupCost`). Format as USD (`Intl.NumberFormat`).
- [ ] **Step 3: ADD export + persistence.** "Copy takeoff (CSV)" button on the running-total header → builds CSV (`shape,qty,length,lb_per_ft,weight_lb,cost`) and copies to clipboard (toast). Persist the running-total rows + the rate/unit to `localStorage` (key `calc:steelweight:rows` / `:rate`) so a reload doesn't lose an in-progress takeoff; rehydrate on mount.
- [ ] **Step 4:** Verify: weight math unchanged (compute a W-shape weight); cost computes (1000 lb @ $0.85/lb = $850); CSV copy contains the row; reload keeps rows (jsdom: mount, add row, remount, row persists). lint/typecheck/build EXIT 0.
- [ ] **Step 5: Commit** `feat(calc): Steel Weight reskin + cost estimation + CSV takeoff export + persistence`.

## Task 12: Crane Pick → reskin

**File:** Modify `src/pages/CranePickCalculator.jsx`

- [ ] **Step 1:** READ the page. Keep ALL rigging math (`@/utils/riggingCalculations`), the live results, status pills, utilization bar, warnings, Pick Summary modal (copy/print), the PLANNING-TOOL-ONLY disclaimer + ASME/OSHA references VERBATIM, and the Clear button. Reskin the input cards + action buttons to the shell chrome + keycap-styled buttons; keep the structured form (it's not a keypad tool). Leave the disabled "Save to Project" stub with its note.
- [ ] **Step 2:** Verify: a known pick still computes the same LAF/tension/utilization (keep any existing test green; add a jsdom smoke test: piece 10000 lb, 2 legs, 60° → utilization + tension render). lint/typecheck/build EXIT 0.
- [ ] **Step 3: Commit** `feat(calc): Crane Pick reskinned to the device chrome`.

## Task 13: Convert → reskin + Units mode

**File:** Modify `src/pages/DecimalFractionConverter.jsx`

- [ ] **Step 1:** READ the page. Keep both Decimal↔Fraction panels (all features, `@/utils/fractionConversion`). Reskin to the shell chrome.
- [ ] **Step 2: ADD a third mode "Units"** (a sub-tab within Convert): a category picker (`CONVERSIONS` from `@/utils/unitConversions`), from/to unit selectors, a value input, and a live converted output (copyable). On any change, call `convert(value, from, to)`; show "—" for null. Default each category to its first two units.
- [ ] **Step 3:** Verify: existing conversions intact; Units mode converts (1 in → 25.4 mm; 1 ft → 0.3048 m; 32°F → 0°C). lint/typecheck/build EXIT 0.
- [ ] **Step 4: Commit** `feat(calc): Convert reskin + steel unit conversions mode`.

## Task 14: Hub hosts the shell

**File:** Modify `src/pages/CalculatorsHub.jsx`

- [ ] **Step 1:** Replace the bespoke tab bar with `CalculatorShell`: pass `tools` (the existing TABS: Standard/Ft-In/Steel Wt/Crane/Convert), drive `activeTool` from the `?calc_tab=` param (preserve the exact keys + deep-link behavior + lazy `Suspense` mounting of each tool inside the shell body), and `onSelect` updates the param. The 5 tool pages still each have their own route (unchanged) AND render inside the hub shell here.
- [ ] **Step 2:** Verify: `?calc_tab=feetinches` opens Ft-In; switching tools updates the URL; each tool mounts. lint/typecheck/build EXIT 0. Add a jsdom smoke test for the hub (renders the rail; default tool mounts).
- [ ] **Step 3: Commit** `feat(calc): CalculatorsHub hosts the unified device shell`.

---

# PHASE D — Validation

## Task 15: Full ladder + field-verify

- [ ] **Step 1: Full ladder**
```powershell
npm run lint; npm run typecheck; npm run typecheck:js; npm run typecheck:strict; npm run typecheck:noimplicitany
npx vitest run --maxWorkers=2
node ./node_modules/vite/bin/vite.js build
```
All EXIT 0; ratchet ignore lists not grown.

- [ ] **Step 2: Field-verify checklist** (`npm run dev`, open Calculators):
  - Looks like a tactile construction calculator on the SteelBuild Dark theme; keys are big/legible on a phone width.
  - Standard: arithmetic + memory + tape (persists across reload) + keyboard.
  - Feet-Inches: add `12'6" + 3'8"`; precision change; cut-list (10ft × 4 in 20ft → 2 sticks, 0% waste; a non-fitting case shows drop/waste).
  - Steel Weight: a W-shape weight + tons; cost at a rate; CSV copy; running total persists across reload.
  - Crane Pick: a pick computes; Pick Summary copy/print; disclaimer present.
  - Convert: decimal↔fraction both ways; Units (in→mm, ksi→MPa, °F→°C).
  - Deep-links (`?calc_tab=`) still work.

- [ ] **Step 3: Report** (CLAUDE.md format), label verification level (unit/build vs field). **Do NOT push/deploy** — the owner reviews the running result and decides the merge.

---

## Self-review notes (author)
- **Spec coverage:** shell/keypad/display/tape kit (T5-8) ✓; lengthMath extraction (T1) ✓; cut-list (T2,T10) ✓; steel cost (T3,T11) ✓; unit conversions (T4,T13) ✓; persistence (T7,T11) ✓; all 5 tools reskinned preserving features (T9-13) ✓; hub (T14) ✓; routes/`?calc_tab=` preserved (T14) ✓; validation + field-verify + no-deploy gate (T15) ✓.
- **Engine signatures (consistent across tasks):** `optimizeCutList({partTicks,qty,stockTicks,kerfTicks?})→{perStick,sticksNeeded,totalStockTicks,usedTicks,dropTicks,wastePct}|null`; `pieceCost(weightLb,rate,unit)`, `rollupCost(rows)`, `COST_UNITS`; `convert(value,from,to)`, `CONVERSIONS`; `lengthMath` exports as listed. Kit props: `CalcKey{label,secondary,onPress,variant,disabled,wide}`, `CalcDisplay{value,aux,memoryActive,onCopy}`, `CalcKeypad{columns,children}`, `CalculatorShell{tools,activeTool,onSelect,children}`, `useCalcTape(key,limit)→{rows,push,clear}`.
- **Known risk:** the 5 pages are 535-862 lines; reskins must preserve every listed feature — locate handlers by name, keep the math/state, swap only chrome. Run the existing suite after each. Crane Pick's compliance text must stay verbatim.
