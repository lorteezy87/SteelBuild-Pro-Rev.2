/**
 * FeetInchesCalculator.jsx
 *
 * Construction-style feet + inches + fractions calculator. Works in the
 * same units a field guy or detailer does: 12'-6 1/2", 8' - 11 3/16",
 * etc. All math happens in 32nd-of-an-inch ticks to avoid float drift,
 * then the display formatter rounds to the user-selected precision
 * (default 1/16").
 *
 * Features:
 *   - Parse flexible input:  12'6 1/2"   12 6 1/2   12-6-1/2   150.5 in
 *   - Four ops: + − × ÷   (× and ÷ take a plain number, not a length)
 *   - Memory keys: M+, M−, MR, MC
 *   - Precision selector: 1/4 · 1/8 · 1/16 · 1/32
 *   - Tape history (last 20 ops, localStorage-persistent), click to copy
 *   - Decimal-feet ↔ ft-in conversion panel (reference)
 *   - Cut-List & Stock Optimizer (parts-per-stick / sticks / waste %)
 *
 * The tactile keycap chrome (display + keypad + tape) comes from the
 * shared SteelBuild calculator device kit in
 * src/components/calculators/. The math itself lives in
 * src/utils/lengthMath.js and src/utils/cutListOptimizer.js.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  parseLength,
  formatLength,
  ticksToDecimalFeet,
  ticksToDecimalInches,
} from "@/utils/lengthMath";
import CalcDisplay from "@/components/calculators/CalcDisplay";
import CalcKeypad from "@/components/calculators/CalcKeypad";
import CalcKey from "@/components/calculators/CalcKey";
import CalcTape from "@/components/calculators/CalcTape";
import useCalcTape from "@/components/calculators/useCalcTape";
import "@/components/calculators/calc.css";
import {
  OPS,
  fracLabel,
  computeFeetInchesCommit,
  createEmptyFeetInchesState,
} from "./feetInchesCalculator/feetInchesCalculatorHelpers";
import {
  CutListOptimizerPanel,
  ConversionRow,
} from "./feetInchesCalculator/FeetInchesCalculatorUi";
import {
  monoStyle as mono,
} from "./feetInchesCalculator/feetInchesCalculatorHelpers";


// ── Component ───────────────────────────────────────────────────────
export default function FeetInchesCalculator() {
  const [accum, setAccum] = useState(0);          // running total, in ticks
  const [pendingOp, setPendingOp] = useState(null);
  const [entry, setEntry] = useState("");
  const [precision, setPrecision] = useState(16);
  const [memory, setMemory] = useState(0);
  const [mulDivMode, setMulDivMode] = useState(false); // when true, entry is a bare number
  const entryRef = useRef(null);

  // Tape history — localStorage-persistent device-kit tape (last 20).
  const { rows: tape, push: pushTape, clear: clearTape } = useCalcTape("calc:feetinches", 20);

  useEffect(() => { entryRef.current?.focus(); }, []);

  const accumStr = useMemo(() => formatLength(accum, precision), [accum, precision]);

  // Also compute decimal forms for the side panel
  const accumDecFt = useMemo(() => ticksToDecimalFeet(accum), [accum]);
  const accumDecIn = useMemo(() => ticksToDecimalInches(accum), [accum]);

  // ── Entry parsing ─────────
  // When pendingOp is × or ÷, we expect a bare number.
  const commit = (nextOp /* optional; if set, op continues */) => {
    const result = computeFeetInchesCommit({
      entry,
      mulDivMode,
      accum,
      pendingOp,
      precision,
      nextOp,
      formatLength,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.tape) pushTape(result.tape);
    setAccum(result.nextAccum);
    setEntry("");
    setPendingOp(result.pendingOp);
    setMulDivMode(result.mulDivMode);
  };

  const equals = () => commit(null);

  const clear = () => {
    const empty = createEmptyFeetInchesState();
    setAccum(empty.accum);
    setPendingOp(empty.pendingOp);
    setEntry(empty.entry);
    setMulDivMode(empty.mulDivMode);
  };

  const clearEntry = () => setEntry("");

  // Memory ops
  const mPlus  = () => setMemory((m) => m + accum);
  const mMinus = () => setMemory((m) => m - accum);
  const mRecall = () => setEntry(formatLength(memory, precision));
  const mClear  = () => setMemory(0);

  // Copy helpers
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  // Entry-builder helpers (keypad fraction / mark keys)
  const appendEntry = (frag) => setEntry((s) => s + frag);

  // Tape recall — click a row to copy that result to the clipboard.
  const recallRow = (row) => {
    const text = row && row.ticks != null
      ? formatLength(row.ticks, precision)
      : (row && row.value != null ? row.value : String(row));
    copy(text);
  };

  // Keyboard support — handles ops even while typing in the entry
  // input. Operator keys (+, -, *, /) commit the current entry as the
  // LHS and queue the op, mirroring how a desktop calculator works
  // ("12'-6 + " advances to "Enter RHS"). Plain - is allowed inside
  // the entry as a separator (12-6-1/2) so we only treat it as the
  // subtraction op when the entry already parses to a length AND the
  // last character isn't itself a separator.
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === "=") { e.preventDefault(); equals(); return; }
    if (e.key === "Escape") { e.preventDefault(); clearEntry(); return; }

    // Op shortcuts. Each commits the current entry then queues the op.
    if (e.key === "+") {
      // Plus inside fraction sums shouldn't ever happen — '+' isn't a
      // valid character inside a length token. Treat as op.
      e.preventDefault(); commit(OPS.ADD); return;
    }
    if (e.key === "*" || e.key === "x" || e.key === "X") {
      e.preventDefault(); commit(OPS.MUL); return;
    }
    if (e.key === "/") {
      // Slash is part of fractions ("1/2"). If the entry already has a
      // digit and a slash IS being typed mid-fraction, we want to keep
      // it. So only fire ÷ when the user holds Shift or the entry
      // looks like a finished length already (parses cleanly + no
      // trailing fraction char).
      const looksLikeFinishedLength = !mulDivMode && parseLength(entry.trim()) != null;
      const trailingPartial = /\d\/?$/.test(entry.trim()); // ends in digit or "12/"
      if (e.shiftKey || (looksLikeFinishedLength && !trailingPartial)) {
        e.preventDefault(); commit(OPS.DIV); return;
      }
    }
    if (e.key === "-") {
      // Same treatment — '-' is a valid in-token separator ("12-6-1/2").
      // Treat as op only when Shift is held OR the existing entry looks
      // like a finished length.
      const looksLikeFinishedLength = !mulDivMode && parseLength(entry.trim()) != null;
      if (e.shiftKey || looksLikeFinishedLength) {
        e.preventDefault(); commit(OPS.SUB); return;
      }
    }
    // Memory shortcuts (Alt/Meta + key, mirrors RegularCalculator).
    if ((e.metaKey || e.altKey) && (e.key === "p" || e.key === "P")) { e.preventDefault(); mPlus();  return; }
    if ((e.metaKey || e.altKey) && (e.key === "m" || e.key === "M")) { e.preventDefault(); mMinus(); return; }
    if ((e.metaKey || e.altKey) && (e.key === "r" || e.key === "R")) { e.preventDefault(); mRecall();return; }
    if ((e.metaKey || e.altKey) && (e.key === "c" || e.key === "C")) { e.preventDefault(); mClear(); return; }
  };

  const auxLine = `${accumDecFt.toFixed(4)} ft · ${accumDecIn.toFixed(3)} in${pendingOp ? `   ·   pending ${pendingOp}` : ""}`;

  return (
    <div className="sb-dashboard-reference-page" style={{ padding: 24, background: "var(--bg-page)", minHeight: "calc(100vh - 92px)" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 22, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
            Feet &amp; Inches Calculator
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 4 }}>
            Jobsite-style: 12'-6 1/2" · math in 1/32" ticks · round to {fracLabel(precision)}
          </div>
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
          {/* ── Left: calc pad ─────────────────────────── */}
          <div className="sbd-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Device display */}
            <CalcDisplay
              value={accumStr}
              aux={auxLine}
              memoryActive={memory !== 0}
              onCopy={() => copy(accumStr)}
            />

            {/* Entry */}
            <div>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                {mulDivMode ? "Enter number" : "Enter length"}
              </div>
              <input
                ref={entryRef}
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={onKey}
                placeholder={mulDivMode ? "e.g. 2.5" : `e.g. 12'-6 1/2"   or   8 4 3/16`}
                style={{
                  width: "100%",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  padding: "10px 12px",
                  color: "var(--text-primary)",
                  fontSize: 16,
                  ...mono,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
                Accepts: <code>12'6 1/2"</code>, <code>12-6-1/2</code>, <code>6.5"</code>, <code>150</code> (→ inches), <code>8.25ft</code>
              </div>
            </div>

            {/* Device keypad */}
            <CalcKeypad columns={4}>
              <CalcKey label="AC" variant="danger" onPress={clear} ariaLabel="All clear" />
              <CalcKey label="CE" variant="fn" onPress={clearEntry} ariaLabel="Clear entry" />
              <CalcKey label="COPY" variant="fn" onPress={() => copy(accumStr)} ariaLabel="Copy running total" />
              <CalcKey label="÷" variant="op" onPress={() => commit(OPS.DIV)} ariaLabel="Divide by number" />

              <CalcKey label="MR" variant="fn" onPress={mRecall} ariaLabel="Memory recall" />
              <CalcKey label="M+" variant="fn" onPress={mPlus} ariaLabel="Memory add" />
              <CalcKey label="M−" variant="fn" onPress={mMinus} ariaLabel="Memory subtract" />
              <CalcKey label="×" variant="op" onPress={() => commit(OPS.MUL)} ariaLabel="Multiply by number" />

              <CalcKey label="MC" variant="fn" onPress={mClear} ariaLabel="Memory clear" />
              <CalcKey label="'" secondary="ft" onPress={() => appendEntry("'")} ariaLabel="Feet mark" />
              <CalcKey label={'"'} secondary="in" onPress={() => appendEntry('"')} ariaLabel="Inch mark" />
              <CalcKey label="−" variant="op" onPress={() => commit(OPS.SUB)} ariaLabel="Subtract" />

              <CalcKey label="1/2" variant="fn" onPress={() => appendEntry(" 1/2")} ariaLabel="Add one half inch" />
              <CalcKey label="1/4" variant="fn" onPress={() => appendEntry(" 1/4")} ariaLabel="Add one quarter inch" />
              <CalcKey label="1/8" variant="fn" onPress={() => appendEntry(" 1/8")} ariaLabel="Add one eighth inch" />
              <CalcKey label="+" variant="op" onPress={() => commit(OPS.ADD)} ariaLabel="Add" />

              <CalcKey label="1/16" variant="fn" onPress={() => appendEntry(" 1/16")} ariaLabel="Add one sixteenth inch" />
              <CalcKey label="3/16" variant="fn" onPress={() => appendEntry(" 3/16")} ariaLabel="Add three sixteenths inch" />
              <CalcKey label="3/8" variant="fn" onPress={() => appendEntry(" 3/8")} ariaLabel="Add three eighths inch" />
              <CalcKey label="=" variant="accent" onPress={equals} ariaLabel="Equals" />
            </CalcKeypad>

            {/* Precision row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Round to
              </span>
              {[4, 8, 16, 32].map((p) => (
                <button
                  key={p}
                  onClick={() => setPrecision(p)}
                  style={{
                    background: precision === p ? "var(--accent)" : "var(--bg-surface)",
                    color: precision === p ? "var(--accent-text)" : "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 4,
                    padding: "4px 10px",
                    ...mono,
                    fontSize: 9,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  1/{p}
                </button>
              ))}
            </div>
          </div>

          {/* ── Right: tape + memory + conversions ──────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="sbd-card" style={{ padding: "10px 14px" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                Memory
              </div>
              <div style={{ ...mono, fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                {formatLength(memory, precision)}
              </div>
            </div>

            {/* Device tape */}
            <CalcTape rows={tape} onRecall={recallRow} onClear={clearTape} />

            {/* Conversion reference */}
            <div className="sbd-card" style={{ padding: "10px 14px" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                Conversions
              </div>
              <ConversionRow label="Decimal feet" value={accumDecFt.toFixed(4)} onCopy={() => copy(accumDecFt.toFixed(4))} />
              <ConversionRow label="Decimal inches" value={accumDecIn.toFixed(3)} onCopy={() => copy(accumDecIn.toFixed(3))} />
              <ConversionRow label="Millimeters" value={(accumDecIn * 25.4).toFixed(1)} onCopy={() => copy((accumDecIn * 25.4).toFixed(1))} />
            </div>
          </div>
        </div>

        {/* Cut-List & Stock Optimizer */}
        <CutListOptimizerPanel precision={precision} onCopy={copy} />

        {/* Tips */}
        <div className="sbd-card" style={{ marginTop: 16, padding: "12px 16px" }}>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>Tips</div>
          <ul style={{ ...mono, fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
            <li>Press <b>Enter</b> to evaluate, <b>Esc</b> to clear the entry.</li>
            <li>Multiply/divide take a plain number (e.g. <code>× 2.5</code> to scale a length).</li>
            <li>Typing a bare number like <code>150</code> is treated as inches. Use <code>150ft</code> or add a foot mark for feet.</li>
            <li>Click any tape row to copy that result to the clipboard.</li>
            <li>Open the <b>Cut-List Optimizer</b> below to plan parts per stick and total drop.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
