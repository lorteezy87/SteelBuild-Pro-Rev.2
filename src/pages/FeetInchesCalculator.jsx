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
 *   - Tape history (last 20 ops), copy-to-clipboard on any tape row
 *   - Decimal-feet ↔ ft-in conversion panel (reference)
 *
 * This file is self-contained — no external deps beyond React and the
 * app's CSS variables.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const mono = { fontFamily: "var(--font-mono)" };

// All internal math in 32nds of an inch. 1 foot = 12 * 32 = 384 ticks.
const TICKS_PER_INCH = 32;
const TICKS_PER_FOOT = 12 * TICKS_PER_INCH;

// ── Parsing ─────────────────────────────────────────────────────────
/**
 * Parse a user-entered length into whole 32nd-inch ticks.
 * Returns null on unparseable input.
 *
 * Accepted forms (whitespace-insensitive):
 *   "12'6 1/2\""        →  12 ft 6-1/2 in
 *   "12' 6-1/2\""
 *   "12-6-1/2"          (dash-separated, common jobsite shorthand)
 *   "12 6 1/2"
 *   "12'"               →  12 ft 0 in
 *   "6 1/2\""           →  0 ft 6-1/2 in
 *   "6.5\""             →  0 ft 6.5 in
 *   "150.5in" / "150.5\"" / "150.5"  →  treated as inches if < 100-ish? no —
 *       If there is no foot marker and value is a bare decimal, we treat
 *       it as inches (user habit — type "6.5" for six and a half inches).
 *   "8.25ft"            →  explicit decimal feet
 */
export function parseLength(raw) {
  if (raw == null) return null;
  const s0 = String(raw).trim();
  if (!s0) return null;

  // Replace unicode prime / double-prime with ASCII
  let s = s0.replace(/[\u2032\u02B9]/g, "'").replace(/[\u2033\u02BA]/g, '"');

  // Bare-number shortcut with explicit ft suffix
  const mFt = s.match(/^([-+]?\d+(?:\.\d+)?)\s*(?:ft|FT|feet)$/);
  if (mFt) {
    const feet = parseFloat(mFt[1]);
    if (!Number.isFinite(feet)) return null;
    return Math.round(feet * TICKS_PER_FOOT);
  }

  // Bare-number shortcut with explicit in suffix
  const mIn = s.match(/^([-+]?\d+(?:\.\d+)?)\s*(?:in|IN|inches?|")$/);
  if (mIn) {
    const inches = parseFloat(mIn[1]);
    if (!Number.isFinite(inches)) return null;
    return Math.round(inches * TICKS_PER_INCH);
  }

  // Bare plain number → inches (jobsite habit)
  if (/^[-+]?\d+(?:\.\d+)?$/.test(s)) {
    const inches = parseFloat(s);
    return Math.round(inches * TICKS_PER_INCH);
  }

  // Negative sign handling — strip it and re-apply at end
  let sign = 1;
  if (s.startsWith("-")) { sign = -1; s = s.slice(1).trim(); }
  else if (s.startsWith("+")) { s = s.slice(1).trim(); }

  // Normalize dash-separated ("12-6-1/2") by swapping dashes to spaces —
  // but only AFTER we've stripped a leading minus.
  s = s.replace(/-/g, " ").replace(/\s+/g, " ").trim();

  // Now try to extract feet (number followed by ') and the rest.
  let feet = 0;
  let rest = s;
  const mFeet = rest.match(/^(\d+(?:\.\d+)?)\s*'\s*(.*)$/);
  if (mFeet) {
    feet = parseFloat(mFeet[1]);
    rest = mFeet[2].trim();
  } else if (/'/.test(rest)) {
    // Malformed (contains ' but not at a valid spot)
    return null;
  } else {
    // No foot marker — could still be "12 6 1/2" without the tick.
    // If there are 2+ space-separated tokens AND the first token is an
    // integer, treat it as feet.
    const parts = rest.split(" ");
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
      feet = parseInt(parts[0], 10);
      rest = parts.slice(1).join(" ");
    }
  }

  // Strip trailing inch mark if present
  rest = rest.replace(/["]$/, "").trim();

  // rest is now "" or "6" or "6.5" or "6 1/2" or "1/2"
  let inches = 0;
  if (rest) {
    const partsR = rest.split(" ");
    if (partsR.length === 1) {
      const tok = partsR[0];
      if (tok.includes("/")) {
        inches = parseFraction(tok);
        if (inches == null) return null;
      } else if (/^\d+(?:\.\d+)?$/.test(tok)) {
        inches = parseFloat(tok);
      } else {
        return null;
      }
    } else if (partsR.length === 2) {
      if (!/^\d+$/.test(partsR[0])) return null;
      const whole = parseInt(partsR[0], 10);
      const frac = parseFraction(partsR[1]);
      if (frac == null) return null;
      inches = whole + frac;
    } else {
      return null;
    }
  }

  if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
  const totalTicks = Math.round((feet * TICKS_PER_FOOT) + (inches * TICKS_PER_INCH));
  return sign * totalTicks;
}

function parseFraction(tok) {
  const m = tok.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const den = parseInt(m[2], 10);
  if (!den) return null;
  return num / den;
}

// ── Formatting ──────────────────────────────────────────────────────
/**
 * Format a tick-count back to "12'-6 1/2"" style.  precisionDen is 4,
 * 8, 16, or 32 — the fraction is rounded to the nearest 1/den.
 */
export function formatLength(ticks, precisionDen = 16) {
  if (ticks == null || !Number.isFinite(ticks)) return "—";

  const sign = ticks < 0 ? "-" : "";
  const abs = Math.abs(ticks);

  // Round to requested precision first so we don't render phantom 1/32
  // leftovers after a (1/16 * 3) kind of operation.
  const ticksPerStep = TICKS_PER_INCH / precisionDen;
  const rounded = Math.round(abs / ticksPerStep) * ticksPerStep;

  let feet = Math.floor(rounded / TICKS_PER_FOOT);
  let leftover = rounded - feet * TICKS_PER_FOOT;

  let wholeInches = Math.floor(leftover / TICKS_PER_INCH);
  let fracTicks = leftover - wholeInches * TICKS_PER_INCH;

  // Reduce fraction
  const fracNum = Math.round(fracTicks / ticksPerStep);
  const fracDen = precisionDen;
  let fracStr = "";
  if (fracNum > 0) {
    // Reduce (e.g. 8/16 → 1/2)
    const g = gcd(fracNum, fracDen);
    fracStr = `${fracNum / g}/${fracDen / g}`;
  }

  // Handle carry if rounding pushed fracNum == fracDen (shouldn't after
  // Math.round above, but defensive)
  if (fracNum === fracDen) {
    wholeInches += 1;
    fracStr = "";
  }
  if (wholeInches === 12) { feet += 1; wholeInches = 0; }

  const inchPart = wholeInches > 0 || fracStr
    ? `${wholeInches}${fracStr ? (wholeInches > 0 ? " " : "") + fracStr : ""}"`
    : `0"`;

  return `${sign}${feet}'-${inchPart}`;
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

// ── Conversions ─────────────────────────────────────────────────────
export const ticksToDecimalFeet = (ticks) => ticks / TICKS_PER_FOOT;
export const ticksToDecimalInches = (ticks) => ticks / TICKS_PER_INCH;
export const decimalFeetToTicks = (ft) => Math.round(ft * TICKS_PER_FOOT);

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
  const [tape, setTape] = useState([]);           // array of { text, ticks }
  const [memory, setMemory] = useState(0);
  const [mulDivMode, setMulDivMode] = useState(false); // when true, entry is a bare number
  const entryRef = useRef(null);

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
    let line = "";
    if (pendingOp && value != null) {
      nextAccum = applyOp(accum, pendingOp, value);
      if (nextAccum == null) {
        toast.error(pendingOp === OPS.DIV ? "Divide by zero" : "Bad op");
        return;
      }
      const rhsText = mulDivMode ? String(value) : formatLength(value, precision);
      line = `${formatLength(accum, precision)} ${pendingOp} ${rhsText} = ${formatLength(nextAccum, precision)}`;
    } else if (value != null) {
      // First entry — just load the value
      nextAccum = value;
      line = `${formatLength(value, precision)}`;
    }
    if (line) setTape((t) => [{ text: line, ticks: nextAccum }, ...t].slice(0, 20));
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
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
            {/* Display */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                Running Total {pendingOp ? `(pending ${pendingOp})` : ""}
              </div>
              <div style={{ ...mono, fontSize: 28, fontWeight: 800, color: "var(--accent)", lineHeight: 1.1 }}>
                {accumStr}
              </div>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                {accumDecFt.toFixed(4)} ft · {accumDecIn.toFixed(3)} in
              </div>
            </div>

            {/* Entry */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--divider)" }}>
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

            {/* Ops pad */}
            <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              <PadBtn onClick={clear} variant="danger">AC</PadBtn>
              <PadBtn onClick={clearEntry}>CE</PadBtn>
              <PadBtn onClick={() => copy(accumStr)} variant="ghost">COPY</PadBtn>
              <PadBtn onClick={() => commit(OPS.DIV)} variant="op" active={pendingOp === OPS.DIV}>÷</PadBtn>

              <PadBtn onClick={mRecall}>MR</PadBtn>
              <PadBtn onClick={mPlus}>M+</PadBtn>
              <PadBtn onClick={mMinus}>M−</PadBtn>
              <PadBtn onClick={() => commit(OPS.MUL)} variant="op" active={pendingOp === OPS.MUL}>×</PadBtn>

              <PadBtn onClick={mClear}>MC</PadBtn>
              <PadBtn onClick={() => setEntry((s) => s + "'")}>'</PadBtn>
              <PadBtn onClick={() => setEntry((s) => s + '"')}>"</PadBtn>
              <PadBtn onClick={() => commit(OPS.SUB)} variant="op" active={pendingOp === OPS.SUB}>−</PadBtn>

              <PadBtn onClick={() => setEntry((s) => s + " 1/2")} small>1/2</PadBtn>
              <PadBtn onClick={() => setEntry((s) => s + " 1/4")} small>1/4</PadBtn>
              <PadBtn onClick={() => setEntry((s) => s + " 1/8")} small>1/8</PadBtn>
              <PadBtn onClick={() => commit(OPS.ADD)} variant="op" active={pendingOp === OPS.ADD}>+</PadBtn>

              <PadBtn onClick={() => setEntry((s) => s + " 1/16")} small>1/16</PadBtn>
              <PadBtn onClick={() => setEntry((s) => s + " 3/16")} small>3/16</PadBtn>
              <PadBtn onClick={() => setEntry((s) => s + " 3/8")} small>3/8</PadBtn>
              <PadBtn onClick={equals} variant="primary">=</PadBtn>
            </div>

            {/* Precision row */}
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 10, background: "var(--bg-surface-low)" }}>
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

          {/* ── Right: tape + memory ───────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                Memory
              </div>
              <div style={{ ...mono, fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
                {formatLength(memory, precision)}
              </div>
            </div>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 14px", flex: 1, minHeight: 280, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  Tape ({tape.length})
                </div>
                {tape.length > 0 && (
                  <button
                    onClick={() => setTape([])}
                    style={{ background: "transparent", border: "none", color: "var(--text-muted)", ...mono, fontSize: 8, cursor: "pointer" }}
                  >
                    clear
                  </button>
                )}
              </div>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {tape.length === 0 && (
                  <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", paddingTop: 8 }}>
                    No history yet.
                  </div>
                )}
                {tape.map((row, idx) => (
                  <button
                    key={idx}
                    onClick={() => copy(formatLength(row.ticks, precision))}
                    title="Click to copy result"
                    style={{
                      background: "var(--bg-surface-low)",
                      border: "1px solid var(--divider)",
                      borderRadius: 4,
                      padding: "6px 8px",
                      ...mono,
                      fontSize: 10,
                      color: "var(--text-secondary)",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {row.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversion reference */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                Conversions
              </div>
              <ConversionRow label="Decimal feet" value={accumDecFt.toFixed(4)} onCopy={() => copy(accumDecFt.toFixed(4))} />
              <ConversionRow label="Decimal inches" value={accumDecIn.toFixed(3)} onCopy={() => copy(accumDecIn.toFixed(3))} />
              <ConversionRow label="Millimeters" value={(accumDecIn * 25.4).toFixed(1)} onCopy={() => copy((accumDecIn * 25.4).toFixed(1))} />
            </div>
          </div>
        </div>

        {/* Tips */}
        <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8 }}>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>Tips</div>
          <ul style={{ ...mono, fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
            <li>Press <b>Enter</b> to evaluate, <b>Esc</b> to clear the entry.</li>
            <li>Multiply/divide take a plain number (e.g. <code>× 2.5</code> to scale a length).</li>
            <li>Typing a bare number like <code>150</code> is treated as inches. Use <code>150ft</code> or add a foot mark for feet.</li>
            <li>Click any tape row to copy that result to the clipboard.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function fracLabel(den) {
  return `1/${den}"`;
}

function PadBtn({ children, onClick, variant, active, small }) {
  const base = {
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    padding: "10px 12px",
    ...mono,
    fontSize: small ? 10 : 12,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
  };
  const styles = { ...base };
  if (variant === "primary") {
    styles.background = "var(--accent)";
    styles.color = "var(--accent-text)";
    styles.border = "1px solid var(--accent)";
  } else if (variant === "op") {
    styles.background = active ? "var(--accent-muted)" : "var(--bg-surface-low)";
    styles.color = active ? "var(--accent)" : "var(--text-primary)";
    if (active) styles.border = "1px solid var(--accent)";
  } else if (variant === "danger") {
    styles.background = "var(--danger-muted)";
    styles.color = "var(--status-error)";
    styles.border = "1px solid var(--danger-border)";
  } else if (variant === "ghost") {
    styles.background = "transparent";
    styles.color = "var(--text-secondary)";
  }
  return (
    <button onClick={onClick} style={styles}>
      {children}
    </button>
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
