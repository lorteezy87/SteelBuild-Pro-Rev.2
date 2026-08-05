# Construction Calculator Suite — Redesign

**Date:** 2026-06-27
**Status:** Approved-by-delegation (owner said "use your best judgment," driving) — build on a branch, do NOT deploy without owner review.
**Area:** Tools / Calculators (`CalculatorsHub` + 5 calculators)

---

## 1. Problem & Goals

The 5 calculators (Standard, Feet-Inches, Steel Weight, Crane Pick, Decimal/Fraction) already use the SteelBuild Dark design system and have correct, mostly-tested math — but they're **form-based**, not what a steel hand expects from a "construction calculator." The owner wants the suite (1) to **look and feel like a real construction calculator** (tactile keypad + LCD display, à la Construction Master Pro), (2) to fit the app, (3) to be **functionally easier to use** (field-first, phone/tablet), (4) to **keep every existing feature**, and (5) to **add steel-fabrication/estimation features** that genuinely help.

**This is a UI/UX overhaul + targeted feature additions — NOT a math rewrite.** The calculation engines (`fractionConversion.js`, `riggingCalculations.js`, `aiscShapes.js`, the 32nd-tick length math, the rigging math) are correct and tested; they are reused, not replaced.

### Goals

- A cohesive **device-style shell** (display + tactile keypad) shared across the tools, with a clear tool selector.
- Big touch targets (≥44px), full keyboard support, persistent tape/history (survives reload).
- Every feature in the inventory preserved (see `docs/superpowers/specs/2026-06-27-calculator-redesign-design.md` companion inventory below / the audit baseline).
- New fab/estimation tools: cut-list/stock optimizer, steel cost, steel unit conversions, takeoff export.

### Non-goals (YAGNI)

- Saving calculator results into a specific project's data (project integration).
- Completing the AISC catalog to exhaustive coverage.
- Asymmetric/tandem rigging or spreader-bar geometry.
- Any backend/schema/RLS change (calculators are client-only, global, not project-scoped).

---

## 2. Feature baseline (must all survive)

**Standard:** 4-function, full keyboard, memory (M+/M−/MR/MC), 30-row tape with recall, %, ±, 1/x, x², √, copy result, 12-sig-fig formatting.
**Feet-Inches:** flexible ft-in-fraction parsing, 32nd-tick math, ×/÷ by scalar, precision selector (¼/⅛/1⁄16/1⁄32), memory, 20-row tape, decimal-ft/in/mm conversion panel, fraction quick-keys, `'`/`"` keys.
**Steel Weight:** AISC shape families (W/HSS-rect/HSS-round/C/MC/L) + dynamic stock (plate/round/square/flat bar), designation picker with lb/ft, ft-in OR decimal-ft length mode, quantity, piece + total weight (lb & tons), running-total table with per-row delete + grand total, copy/clear.
**Crane Pick:** piece+rigging weight, 1/2/4 legs, angle by degrees OR height/span, LAF, per-leg tension, capacity utilization + colored bar, status pills, warnings, Pick Summary modal (copy/print), clear. (ASME/OSHA references + PLANNING-TOOL-ONLY disclaimer retained verbatim.)
**Decimal/Fraction:** decimal→fraction (ft or in modes, precision, rounding-delta) and fraction→decimal (ft/in/fraction incl. custom), live, copy.

---

## 3. Architecture

```
src/components/calculators/            (NEW shared device kit)
  CalculatorShell.jsx     device frame: tool rail + display slot + keypad slot; owns layout + responsive
  CalcDisplay.jsx         LCD-style display (primary value + secondary/aux line + pending-op + memory indicator)
  CalcKey.jsx             one tactile key: primary label + optional shift/secondary label, variant (digit/op/fn/accent/danger), size, onClick, keycap styling
  CalcKeypad.jsx          grid wrapper for keys (responsive columns, gap, equal touch targets)
  CalcTape.jsx            history list (rows, recall, clear), fed by useCalcTape
  useCalcTape.js          tape state hook with localStorage persistence (per-tool key) + recall
  calc.css                .sbd-calc-* keycap/display/shell styles (tokens only)

src/utils/                              (engines — pure, tested)
  lengthMath.js           EXTRACTED from FeetInchesCalculator: parseLength, formatLength, ticks<->decimalFeet/inches/mm, TICKS_PER_INCH/FOOT  (+ tests)
  cutListOptimizer.js     NEW: optimize(partTicks, qty, stockTicks, kerfTicks?) -> { perStick, sticksNeeded, totalLengthTicks, dropTicks, wastePct }  (+ tests)
  steelCost.js            NEW: pieceCost(weightLb, rate, unit) where unit in {"/lb","/cwt","/ton"}; rollupCost(rows)  (+ tests)
  unitConversions.js      NEW: steel/imperial-metric conversions (lb<->kg, ft<->m, in<->mm, ksi<->MPa, degF<->degC, lb/ft<->kg/m)  (+ tests)
  fractionConversion.js   KEEP (tested)
  riggingCalculations.js  KEEP (tested)
src/data/aiscShapes.js    KEEP (tested via SteelWeight)

src/pages/                              (thin tool views, consume the shell + engines)
  CalculatorsHub.jsx      reworked: hosts the shell + tool rail; ?calc_tab= preserved
  RegularCalculator.jsx, FeetInchesCalculator.jsx, SteelWeightCalculator.jsx,
  CranePickCalculator.jsx, DecimalFractionConverter.jsx   (reskinned; math reused; routes unchanged)
```

**Key boundary fix:** today `SteelWeightCalculator` imports `parseLength`/`ticksToDecimalFeet`/`formatLength` from the *FeetInchesCalculator page* — fragile. Extract that math to `src/utils/lengthMath.js` (byte-faithful), unit-test it, and have FeetInches, SteelWeight, and the new cut-list all import from there. The page keeps a thin re-export shim only if needed for back-compat.

**The device shell.** `CalculatorShell` renders a single "calculator body": a top **tool rail** (segmented control: `Standard · Ft-In · Steel Wt · Crane · Convert`, keyboard-navigable, `?calc_tab=` synced), then a **display** region, then a **keypad/work** region. Standard + Feet-Inches are keypad-driven (display on top, tactile grid below). Steel Weight / Crane Pick / Convert keep structured inputs but inside the same shell chrome (same header, card, fonts, key styling for their action buttons) so the suite reads as one device. Routes and the `CalculatorsHub` tab model are preserved; only the chrome + per-tool internals change.

**Keycap aesthetic (tokens only).** Raised keys via `var(--bg-surface)` face + `var(--border-strong)` edge + subtle inset/`box-shadow` for depth + `:active` press transform; digits neutral, operators `var(--accent)`, functions muted, danger `var(--status-error)`. Primary label large (mono), secondary/shift label small top-right. All keys ≥44×44px; keypad is a CSS grid that reflows 1-col-friendly on narrow widths. No images, no new fonts, no new deps.

---

## 4. Per-tool redesign + additions

### 4.1 Standard
Device layout: `CalcDisplay` (value + memory chip + history glimpse) over a 4×5 `CalcKeypad`. Keep MC/MR/M+/M−/MS, AC/CE/⌫, ±, %, ÷×−+=, and the sci functions (1/x, x², √) as a labeled secondary row (no hidden shift needed — there's room). Tape via `CalcTape` (persistent). All existing keyboard shortcuts retained.

### 4.2 Feet-Inches (the centerpiece)
Construction-calc keypad: digit keys + dedicated **`Feet`**, **`Inch`**, **`/`(fraction)** keys + fraction quick-keys (½ ¼ ⅛ 1⁄16 3⁄16 ⅜), precision selector, ÷×−+=, memory, persistent tape, and the decimal-ft/in/mm conversion strip. Parsing/formatting via `lengthMath.js`.
**ADD — Cut-list & stock optimizer** (a panel/mode within the tool): inputs = part length (ft-in), quantity, stock length (presets 20'/40'/60' + custom), optional kerf/saw-loss. Outputs via `cutListOptimizer`: pieces per stick, sticks required, total stock length, total drop, **waste %**. Optionally accumulate multiple part rows → a mini cut-list with totals. This is the single highest-value fab-estimation addition.

### 4.3 Steel Weight
Keep the full shape/stock picker, length modes, quantity, running-total table. Reskin action buttons to keycaps.
**ADD — Cost:** a rate input + unit toggle (`$/lb · $/cwt · $/ton`) → piece cost and a grand-total **cost** column alongside tonnage (via `steelCost`). Rate persists (localStorage).
**ADD — Export:** "Copy as CSV" / "Copy takeoff" on the running total (shape, qty, length, lb/ft, weight, cost) so an estimator can paste into a spreadsheet/takeoff. Persist the running total to localStorage so a reload doesn't wipe a takeoff in progress.

### 4.4 Crane Pick
Math + Pick Summary + print + disclaimer unchanged (correct + compliance-sensitive). Reskin to the shell chrome; convert action buttons to keycaps; keep status pills/utilization bar. (The disabled "Save to Project" stays a labeled future stub.)

### 4.5 Convert
Keep both Decimal↔Fraction panels. **ADD a third mode "Units":** steel/imperial-metric conversions via `unitConversions` — length (ft/in/mm/m), weight (lb/kg/ton/tonne), lb/ft↔kg/m, stress (ksi↔MPa), temperature (°F↔°C for preheat/PWHT). Live, copyable, same chrome.

---

## 5. Testing

- **Unit (pure engines):** `lengthMath` (parse all input forms, format at each precision, tick↔decimal round-trips — port/extend the existing ft-in cases), `cutListOptimizer` (exact-fit, remainder/drop, kerf, zero/invalid, waste%), `steelCost` (each unit, rollup, zero/blank rate), `unitConversions` (each pair, round-trip, edge values). Keep `fractionConversion`/`riggingCalculations` tests.
- **Component (jsdom):** `CalcKey`/`CalcDisplay`/`CalcKeypad` render + press; `useCalcTape` persistence + recall; one smoke test per reskinned tool asserting its core feature still works (e.g. Ft-In adds two lengths; Steel Weight computes a W-shape weight + cost; Cut-list returns sticks/waste).
- **Full ladder:** lint · typecheck · typecheck:js · typecheck:strict · typecheck:noimplicitany · `npm test` (use `--maxWorkers=2` on Windows) · production build — all green; ratchet ignore lists not grown.
- **Field verification (owner):** the suite runs on the dev server; owner reviews the look + exercises each tool before any deploy. Per CLAUDE.md §32, build-green is not "done" for this UI work.

---

## 6. Rollout / safety

- Built entirely on `claude/calculator-redesign`. **Not deployed** until the owner reviews the running result and approves the merge. Behind no flag (calculators are low-risk, global, non-project tools), but the deploy gate is the owner's review.
- Routes, route keys, and the `?calc_tab=` deep-link model are preserved (no broken bookmarks).
- Incremental, reviewable commits: shared kit first, then engine extraction + new engines (TDD), then per-tool reskin, then the additions, then validation.
