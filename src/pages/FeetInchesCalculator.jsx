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
  TICKS_PER_FOOT,
  parseLength,
  formatLength,
  ticksToDecimalFeet,
  ticksToDecimalInches,
} from "@/utils/lengthMath";
import { optimizeCutList } from "@/utils/cutListOptimizer";
import CalcDisplay from "@/components/calculators/CalcDisplay";
import CalcKeypad from "@/components/calculators/CalcKeypad";
import CalcKey from "@/components/calculators/CalcKey";
import CalcTape from "@/components/calculators/CalcTape";
import useCalcTape from "@/components/calculators/useCalcTape";
import "@/components/calculators/calc.css";

const mono = { fontFamily: "var(--font-mono)" };

// ── Component ───────────────────────────────────────────────────────
const OPS = { ADD: "+", SUB: "−", MUL: "×", DIV: "÷" };

function applyOp(aTicks, op, bTicksOrNumber) {
  switch (op) {
    case OPS.ADD: return aTicks + bTicksOrNumber;
    case OPS.SUB: return aTicks - bTicksOrNumber;
    case OPS.MUL: return Math.round(aTicks * bTicksOrNumber);
    case OPS.DIV:
      if (!bTicksOrNumber) return null;
      return Math.round(aTicks / bTicksOrNumber);
    default: return bTicksOrNumber;
  }
}

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
  const parseEntry = () => {
    const s = entry.trim();
    if (!s) return null;
    if (mulDivMode) {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    }
    return parseLength(s);
  };

  const commit = (nextOp /* optional; if set, op continues */) => {
    const value = parseEntry();
    if (value == null && entry.trim() !== "") {
      toast.error("Couldn't parse that length.");
      return;
    }
    let nextAccum = accum;
    let exprLine = "";
    if (pendingOp && value != null) {
      nextAccum = applyOp(accum, pendingOp, value);
      if (nextAccum == null) {
        toast.error(pendingOp === OPS.DIV ? "Divide by zero" : "Bad op");
        return;
      }
      const rhsText = mulDivMode ? String(value) : formatLength(value, precision);
      exprLine = `${formatLength(accum, precision)} ${pendingOp} ${rhsText}`;
    } else if (value != null) {
      // First entry — just load the value
      nextAccum = value;
      exprLine = "load";
    }
    if (exprLine) {
      pushTape({ expr: exprLine, value: formatLength(nextAccum, precision), ticks: nextAccum });
    }
    setAccum(nextAccum);
    setEntry("");
    setPendingOp(nextOp || null);
    setMulDivMode(nextOp === OPS.MUL || nextOp === OPS.DIV);
  };

  const equals = () => commit(null);

  const clear = () => {
    setAccum(0);
    setPendingOp(null);
    setEntry("");
    setMulDivMode(false);
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
    <div style={{ padding: 24, background: "var(--bg-page)", minHeight: "calc(100vh - 92px)" }}>
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

function fracLabel(den) {
  return `1/${den}"`;
}

// ── Cut-List & Stock Optimizer ──────────────────────────────────────
// Collapsible sub-tool: parse a part length (ft-in), a quantity, and a
// stock length (preset chips 20'/40'/60' + custom ft-in), with optional
// kerf. Runs the deterministic optimizeCutList engine and reports
// pieces/stick, sticks needed, total stock, total drop, and waste %.
const STOCK_PRESETS = [
  { label: "20'", ticks: 20 * TICKS_PER_FOOT },
  { label: "40'", ticks: 40 * TICKS_PER_FOOT },
  { label: "60'", ticks: 60 * TICKS_PER_FOOT },
];

function CutListOptimizerPanel({ precision, onCopy }) {
  const [open, setOpen] = useState(false);
  const [partStr, setPartStr] = useState("");
  const [qtyStr, setQtyStr] = useState("");
  const [stockTicks, setStockTicks] = useState(STOCK_PRESETS[0].ticks);
  const [customStockStr, setCustomStockStr] = useState("");
  const [useCustomStock, setUseCustomStock] = useState(false);
  const [kerfStr, setKerfStr] = useState("");

  const partTicks = useMemo(() => parseLength(partStr.trim()), [partStr]);
  const qty = useMemo(() => {
    const n = parseInt(qtyStr.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }, [qtyStr]);
  const effectiveStockTicks = useMemo(() => {
    if (useCustomStock) return parseLength(customStockStr.trim());
    return stockTicks;
  }, [useCustomStock, customStockStr, stockTicks]);
  const kerfTicks = useMemo(() => {
    const s = kerfStr.trim();
    if (!s) return 0;
    const t = parseLength(s);
    return t == null ? null : t;
  }, [kerfStr]);

  // Run the engine only when every input is present + valid.
  const result = useMemo(() => {
    if (partTicks == null || qty == null || effectiveStockTicks == null || kerfTicks == null) return null;
    return optimizeCutList({ partTicks, qty, stockTicks: effectiveStockTicks, kerfTicks });
  }, [partTicks, qty, effectiveStockTicks, kerfTicks]);

  // Distinguish "nothing entered yet" from "entered but the engine
  // rejected it" (part > stock / invalid) so we can show a friendly hint.
  const hasAllInputs =
    partTicks != null && qty != null && effectiveStockTicks != null && kerfTicks != null;
  const showRejected = hasAllInputs && result == null;

  const inputStyle = {
    width: "100%",
    background: "var(--bg-input)",
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    padding: "8px 10px",
    color: "var(--text-primary)",
    fontSize: 14,
    ...mono,
    outline: "none",
    boxSizing: "border-box",
  };
  const fieldLabel = {
    ...mono,
    fontSize: 9,
    color: "var(--text-muted)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    marginBottom: 4,
    display: "block",
  };

  return (
    <div className="sbd-card" style={{ marginTop: 16, padding: open ? 16 : "12px 16px" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          color: "var(--text-primary)",
        }}
      >
        <span style={{ ...mono, fontSize: 11, fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--accent)" }}>
          Cut-List &amp; Stock Optimizer
        </span>
        <span style={{ ...mono, fontSize: 12, color: "var(--text-muted)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {/* Inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={fieldLabel}>Part length (ft-in)</label>
              <input
                value={partStr}
                onChange={(e) => setPartStr(e.target.value)}
                placeholder={`e.g. 8'-4 1/2"`}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={fieldLabel}>Quantity</label>
              <input
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
                placeholder="e.g. 12"
                inputMode="numeric"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Stock length — presets + custom */}
          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabel}>Stock length</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {STOCK_PRESETS.map((preset) => {
                const active = !useCustomStock && stockTicks === preset.ticks;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => { setUseCustomStock(false); setStockTicks(preset.ticks); }}
                    style={{
                      background: active ? "var(--accent)" : "var(--bg-surface)",
                      color: active ? "var(--accent-text)" : "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 4,
                      padding: "6px 14px",
                      ...mono,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setUseCustomStock(true)}
                style={{
                  background: useCustomStock ? "var(--accent)" : "var(--bg-surface)",
                  color: useCustomStock ? "var(--accent-text)" : "var(--text-secondary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 4,
                  padding: "6px 14px",
                  ...mono,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Custom
              </button>
              {useCustomStock && (
                <input
                  value={customStockStr}
                  onChange={(e) => setCustomStockStr(e.target.value)}
                  placeholder={`e.g. 24'-0"`}
                  style={{ ...inputStyle, width: 140, padding: "6px 10px" }}
                />
              )}
            </div>
          </div>

          {/* Kerf (optional) */}
          <div style={{ marginBottom: 14, maxWidth: 240 }}>
            <label style={fieldLabel}>Kerf / saw gap (optional)</label>
            <input
              value={kerfStr}
              onChange={(e) => setKerfStr(e.target.value)}
              placeholder={`default 0  ·  e.g. 1/8"`}
              style={inputStyle}
            />
          </div>

          {/* Results */}
          {result ? (
            <div style={{ background: "var(--bg-surface-low)", border: "1px solid var(--divider)", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                <ResultStat label="Pieces / stick" value={String(result.perStick)} />
                <ResultStat
                  label="Sticks needed"
                  value={String(result.sticksNeeded)}
                  emphasis
                  onCopy={() => onCopy(String(result.sticksNeeded))}
                />
                <ResultStat
                  label="Total stock"
                  value={formatLength(result.totalStockTicks, precision)}
                  onCopy={() => onCopy(formatLength(result.totalStockTicks, precision))}
                />
                <ResultStat
                  label="Total drop / waste"
                  value={formatLength(result.dropTicks, precision)}
                  onCopy={() => onCopy(formatLength(result.dropTicks, precision))}
                />
                <ResultStat
                  label="Waste %"
                  value={`${result.wastePct.toFixed(1)}%`}
                  emphasis
                />
              </div>
            </div>
          ) : showRejected ? (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-error)", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 8, padding: "10px 12px" }}>
              Can't optimize that — check the part fits inside the stock length and that the quantity is a positive whole number.
            </div>
          ) : (
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
              Enter a part length, quantity, and stock length to see the cut plan.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultStat({ label, value, emphasis, onCopy }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <button
        type="button"
        onClick={onCopy}
        disabled={!onCopy}
        title={onCopy ? "Click to copy" : undefined}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          ...mono,
          fontSize: emphasis ? 20 : 16,
          fontWeight: 800,
          color: emphasis ? "var(--accent)" : "var(--text-primary)",
          cursor: onCopy ? "pointer" : "default",
          textAlign: "left",
        }}
      >
        {value}
      </button>
    </div>
  );
}

function ConversionRow({ label, value, onCopy }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
      <button
        onClick={onCopy}
        style={{ background: "transparent", border: "none", ...mono, fontSize: 11, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer" }}
        title="Click to copy"
      >
        {value}
      </button>
    </div>
  );
}
