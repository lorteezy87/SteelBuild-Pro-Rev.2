/**
 * RegularCalculator.jsx — standard four-function calculator with a
 * fully-typeable keyboard interface and a persistent tape history.
 *
 * Designed to feel like the Windows / macOS desktop calculator that
 * everyone already knows: every button has a one-key shortcut, every
 * shortcut works whether or not the on-screen keypad has focus.
 *
 * The on-screen keypad is now built from the shared tactile device kit
 * (CalcDisplay + CalcKeypad/CalcKey + CalcTape), so it reads like a real
 * desk calculator. The history tape is persisted across reloads via
 * useCalcTape("calc:standard", 30) and any row can be clicked to recall
 * its result into the current entry.
 *
 *   0–9            type a digit
 *   .              decimal point
 *   + - * x / ÷    operators
 *   = or Enter     evaluate the pending op
 *   Backspace      drop the last typed character (CE on a fresh entry)
 *   Esc / c / C    AC (clear all)
 *   Delete         CE (clear current entry only)
 *   %              percent of accumulator
 *   _ or n         toggle sign on current entry
 *   r              reciprocal (1 / x)
 *   q              square (x²)
 *   s              square root
 *   m+ / m- / mr / mc — Alt/Meta+P, Alt/Meta+M, Alt/Meta+R, Alt/Meta+C
 *
 * Internally the calculator runs as a small state machine with three
 * pieces: `accum` (the running total), `pendingOp` (waiting on a RHS),
 * and `entry` (the digit string the user is currently typing). Tape
 * rows store the formatted expression plus the raw numeric value so
 * clicking a row recalls it into entry.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import CalcDisplay from "@/components/calculators/CalcDisplay";
import CalcKeypad from "@/components/calculators/CalcKeypad";
import CalcKey from "@/components/calculators/CalcKey";
import CalcTape from "@/components/calculators/CalcTape";
import useCalcTape from "@/components/calculators/useCalcTape";

const mono = { fontFamily: "var(--font-mono)" };

const OPS = { ADD: "+", SUB: "−", MUL: "×", DIV: "÷" };

function applyOp(a, op, b) {
  switch (op) {
    case OPS.ADD: return a + b;
    case OPS.SUB: return a - b;
    case OPS.MUL: return a * b;
    case OPS.DIV: return b === 0 ? null : a / b;
    default:      return b;
  }
}

// Format with up to 12 significant digits, strip trailing zeros, and
// localise thousands separators on the integer half so 1000000 reads
// as 1,000,000 rather than 1e6.
function formatNumber(n) {
  if (!Number.isFinite(n)) return "—";
  // Avoid scientific notation for medium-sized numbers; only fall back
  // to it when the magnitude is genuinely outside what a fixed display
  // can carry.
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(6);
  const fixed = Number(n.toFixed(10)).toString();
  const [intPart, frac] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

export default function RegularCalculator() {
  const [accum, setAccum] = useState(0);
  const [pendingOp, setPendingOp] = useState(null);
  const [entry, setEntry] = useState("");           // string the user is typing
  const [memory, setMemory] = useState(0);
  const tape = useCalcTape("calc:standard", 30);     // persistent { expr, value } rows
  const [justEvaluated, setJustEvaluated] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => { rootRef.current?.focus(); }, []);

  const display = useMemo(() => {
    if (entry !== "") return entry;
    return formatNumber(accum);
  }, [entry, accum]);

  // Secondary expression line on the LCD: the pending operation when one
  // is in flight, or an "ANS" marker once a result is committed.
  const aux = useMemo(() => {
    if (pendingOp) return `${formatNumber(accum)} ${pendingOp}`;
    if (entry === "" && accum !== 0) return "ANS";
    return "";
  }, [pendingOp, accum, entry]);

  const parseEntry = () => {
    const s = entry.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  // Push a completed calculation onto the persistent tape.
  const recordTape = (a, op, b, result) => {
    tape.push({
      expr: `${formatNumber(a)} ${op} ${formatNumber(b)} =`,
      value: result,
    });
  };

  const inputDigit = (d) => {
    if (justEvaluated) {
      // Starting a fresh expression after =. Reset accum so the
      // typed digit is the new operand rather than appending to the
      // previous result.
      setAccum(0);
      setPendingOp(null);
      setEntry(d === "." ? "0." : d);
      setJustEvaluated(false);
      return;
    }
    if (d === ".") {
      if (entry.includes(".")) return;
      setEntry(entry === "" ? "0." : entry + ".");
    } else {
      // Replace a leading zero unless followed by "." (so 0.5 still works).
      if (entry === "0") setEntry(d);
      else setEntry(entry + d);
    }
  };

  const setOp = (op) => {
    setJustEvaluated(false);
    const value = parseEntry();
    if (value == null && pendingOp == null) {
      // Just rebind the op while accum is the implicit operand.
      setPendingOp(op);
      return;
    }
    if (pendingOp && value != null) {
      const next = applyOp(accum, pendingOp, value);
      if (next == null) {
        toast.error("Cannot divide by zero");
        return;
      }
      recordTape(accum, pendingOp, value, next);
      setAccum(next);
    } else if (value != null) {
      setAccum(value);
    }
    setEntry("");
    setPendingOp(op);
  };

  const equals = () => {
    const value = parseEntry();
    if (pendingOp && value != null) {
      const next = applyOp(accum, pendingOp, value);
      if (next == null) {
        toast.error("Cannot divide by zero");
        return;
      }
      recordTape(accum, pendingOp, value, next);
      setAccum(next);
      setEntry("");
      setPendingOp(null);
      setJustEvaluated(true);
    } else if (value != null) {
      // No pending op — just commit the entry to accum.
      setAccum(value);
      setEntry("");
      setJustEvaluated(true);
    }
  };

  const clearAll = () => {
    setAccum(0);
    setPendingOp(null);
    setEntry("");
    setJustEvaluated(false);
  };

  const clearEntry = () => {
    setEntry("");
  };

  const backspace = () => {
    if (entry === "") {
      // Backspace on a blank entry edits the accumulator instead — so
      // the user can delete a typo from a result without going back to
      // AC and starting over.
      const s = formatNumber(accum).replace(/,/g, "");
      const next = s.length > 1 ? s.slice(0, -1) : "0";
      const n = Number(next);
      setAccum(Number.isFinite(n) ? n : 0);
    } else {
      setEntry(entry.slice(0, -1));
    }
  };

  const toggleSign = () => {
    if (entry !== "") {
      setEntry(entry.startsWith("-") ? entry.slice(1) : "-" + entry);
    } else {
      setAccum(-accum);
    }
  };

  const percent = () => {
    const value = parseEntry();
    if (value != null) {
      // Standard calculator semantics: % takes the entry as a percent
      // of the current accumulator. Falls back to value/100 when no
      // accumulator is in play.
      const pct = pendingOp ? (accum * value) / 100 : value / 100;
      setEntry(String(pct));
    } else {
      setAccum(accum / 100);
    }
  };

  const reciprocal = () => {
    const value = parseEntry();
    const target = value != null ? value : accum;
    if (target === 0) { toast.error("Cannot divide by zero"); return; }
    const r = 1 / target;
    if (entry !== "") setEntry(String(r));
    else setAccum(r);
  };

  const square = () => {
    const value = parseEntry();
    const target = value != null ? value : accum;
    const sq = target * target;
    if (entry !== "") setEntry(String(sq));
    else setAccum(sq);
  };

  const sqroot = () => {
    const value = parseEntry();
    const target = value != null ? value : accum;
    if (target < 0) { toast.error("Cannot sqrt a negative"); return; }
    const r = Math.sqrt(target);
    if (entry !== "") setEntry(String(r));
    else setAccum(r);
  };

  // Memory ops always operate on the displayed value (entry if typing,
  // else accum) — same behaviour as a desktop calc.
  const displayedValue = () => {
    const v = parseEntry();
    return v != null ? v : accum;
  };
  const mPlus  = () => { setMemory((m) => m + displayedValue()); toast.success("M+"); };
  const mMinus = () => { setMemory((m) => m - displayedValue()); toast.success("M−"); };
  const mRecall = () => {
    setEntry(String(memory));
    setJustEvaluated(false);
  };
  const mClear = () => { setMemory(0); toast.success("MC"); };
  const mStore = () => { setEntry(formatNumber(memory)); setJustEvaluated(false); };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(display);
      toast.success("Copied");
    } catch { toast.error("Copy failed"); }
  };

  // ── Keyboard handler ──────────────────────────────────────────────
  // Listens at the page-root div (tabIndex=-1, autofocus on mount) so
  // the user can land on the page and start typing without clicking
  // anything first. The handler is exhaustive — every visible button
  // has a key shortcut so the calculator can be driven heads-down.
  const onKey = (e) => {
    // Don't swallow keystrokes when an input/textarea has focus —
    // the tape's recall row uses one, and so does any text the user
    // pastes elsewhere. Defensive: only act when target is the root.
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const k = e.key;

    // Memory: meta/ctrl + p / m / r / c. The plain `m` key is
    // intentionally left to fall through (rare keystroke; Ctrl+M is
    // unambiguous).
    if ((e.metaKey || e.altKey) && (k === "p" || k === "P")) { e.preventDefault(); mPlus();  return; }
    if ((e.metaKey || e.altKey) && (k === "m" || k === "M")) { e.preventDefault(); mMinus(); return; }
    if ((e.metaKey || e.altKey) && (k === "r" || k === "R")) { e.preventDefault(); mRecall();return; }
    if ((e.metaKey || e.altKey) && (k === "c" || k === "C")) { e.preventDefault(); mClear(); return; }

    if (/^[0-9]$/.test(k)) { e.preventDefault(); inputDigit(k); return; }
    if (k === ".")          { e.preventDefault(); inputDigit("."); return; }

    if (k === "+")          { e.preventDefault(); setOp(OPS.ADD); return; }
    if (k === "-")          { e.preventDefault(); setOp(OPS.SUB); return; }
    if (k === "*" || k === "x" || k === "X") { e.preventDefault(); setOp(OPS.MUL); return; }
    if (k === "/")          { e.preventDefault(); setOp(OPS.DIV); return; }

    if (k === "Enter" || k === "=") { e.preventDefault(); equals(); return; }
    if (k === "Backspace")  { e.preventDefault(); backspace(); return; }
    if (k === "Escape" || k === "c" || k === "C") { e.preventDefault(); clearAll(); return; }
    if (k === "Delete")     { e.preventDefault(); clearEntry(); return; }

    if (k === "%")          { e.preventDefault(); percent(); return; }
    if (k === "_" || k === "n" || k === "N") { e.preventDefault(); toggleSign(); return; }
    if (k === "r")          { e.preventDefault(); reciprocal(); return; }
    if (k === "q")          { e.preventDefault(); square(); return; }
    if (k === "s")          { e.preventDefault(); sqroot(); return; }
  };

  // Recall a tape row's value into entry. CalcTape passes the whole row
  // object back; pull the numeric value off it.
  const recallTape = (row) => {
    const value = row && row.value != null ? row.value : row;
    setEntry(String(value));
    setJustEvaluated(false);
    rootRef.current?.focus();
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div
      className="sb-dashboard-reference-page"
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKey}
      style={{ padding: 24, background: "var(--bg-page)", minHeight: "calc(100vh - 92px)", outline: "none" }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 22, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
              Calculator
            </div>
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 4 }}>
              Standard four-function · keyboard-first · type anywhere on page
            </div>
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
            {memory !== 0 ? `M = ${formatNumber(memory)}` : ""}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
          {/* ── Calc pad ───────────────────────────── */}
          <div className="sbd-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Display */}
            <CalcDisplay
              value={display}
              aux={aux}
              memoryActive={memory !== 0}
              onCopy={copy}
            />

            {/* Function row — memory + unary ops */}
            <CalcKeypad columns={5}>
              <CalcKey label="MC" variant="fn" secondary="⌥C" onPress={mClear} ariaLabel="Memory clear" />
              <CalcKey label="MR" variant="fn" secondary="⌥R" onPress={mRecall} ariaLabel="Memory recall" />
              <CalcKey label="M+" variant="fn" secondary="⌥P" onPress={mPlus} ariaLabel="Memory add" />
              <CalcKey label="M−" variant="fn" secondary="⌥M" onPress={mMinus} ariaLabel="Memory subtract" />
              <CalcKey label="MS" variant="fn" onPress={mStore} disabled={memory === 0} ariaLabel="Memory store to entry" />
            </CalcKeypad>

            {/* Main pad */}
            <CalcKeypad columns={4}>
              <CalcKey label="%"   variant="fn" secondary="%" onPress={percent} ariaLabel="Percent" />
              <CalcKey label="√x"  variant="fn" secondary="s" onPress={sqroot} ariaLabel="Square root" />
              <CalcKey label="x²"  variant="fn" secondary="q" onPress={square} ariaLabel="Square" />
              <CalcKey label="1/x" variant="fn" secondary="r" onPress={reciprocal} ariaLabel="Reciprocal" />

              <CalcKey label="CE" variant="fn"     secondary="Del" onPress={clearEntry} ariaLabel="Clear entry" />
              <CalcKey label="AC" variant="danger" secondary="Esc" onPress={clearAll} ariaLabel="Clear all" />
              <CalcKey label="⌫"  variant="fn"     secondary="⌫"   onPress={backspace} ariaLabel="Backspace" />
              <CalcKey label="÷"  variant="op"     secondary="/"   onPress={() => setOp(OPS.DIV)} ariaLabel="Divide" />

              <CalcKey label="7" variant="digit" secondary="7" onPress={() => inputDigit("7")} />
              <CalcKey label="8" variant="digit" secondary="8" onPress={() => inputDigit("8")} />
              <CalcKey label="9" variant="digit" secondary="9" onPress={() => inputDigit("9")} />
              <CalcKey label="×" variant="op"    secondary="*" onPress={() => setOp(OPS.MUL)} ariaLabel="Multiply" />

              <CalcKey label="4" variant="digit" secondary="4" onPress={() => inputDigit("4")} />
              <CalcKey label="5" variant="digit" secondary="5" onPress={() => inputDigit("5")} />
              <CalcKey label="6" variant="digit" secondary="6" onPress={() => inputDigit("6")} />
              <CalcKey label="−" variant="op"    secondary="-" onPress={() => setOp(OPS.SUB)} ariaLabel="Subtract" />

              <CalcKey label="1" variant="digit" secondary="1" onPress={() => inputDigit("1")} />
              <CalcKey label="2" variant="digit" secondary="2" onPress={() => inputDigit("2")} />
              <CalcKey label="3" variant="digit" secondary="3" onPress={() => inputDigit("3")} />
              <CalcKey label="+" variant="op"    secondary="+" onPress={() => setOp(OPS.ADD)} ariaLabel="Add" />

              <CalcKey label="±" variant="fn"     secondary="_" onPress={toggleSign} ariaLabel="Toggle sign" />
              <CalcKey label="0" variant="digit"  secondary="0" onPress={() => inputDigit("0")} />
              <CalcKey label="." variant="digit"  secondary="." onPress={() => inputDigit(".")} ariaLabel="Decimal point" />
              <CalcKey label="=" variant="accent" secondary="↵" onPress={equals} ariaLabel="Equals" />
            </CalcKeypad>
          </div>

          {/* ── Tape / Help ────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <CalcTape
              rows={tape.rows}
              onRecall={recallTape}
              onClear={tape.clear}
            />

            <div className="sbd-card" style={{ padding: "10px 14px" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                Keyboard
              </div>
              <KbRow k="0–9 ." label="Type" />
              <KbRow k="+ − × ÷" label="+ - * /" />
              <KbRow k="=" label="Enter or =" />
              <KbRow k="⌫" label="Backspace" />
              <KbRow k="AC" label="Esc / c" />
              <KbRow k="CE" label="Delete" />
              <KbRow k="±" label="_ or n" />
              <KbRow k="%" label="%" />
              <KbRow k="√x" label="s" />
              <KbRow k="x²" label="q" />
              <KbRow k="1/x" label="r" />
              <KbRow k="MC / MR / M+ / M−" label="⌥C / ⌥R / ⌥P / ⌥M" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── UI primitives ────────────────────────────────────────────────────
function KbRow({ k, label }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", ...mono, fontSize: 10 }}>
      <span style={{ color: "var(--text-secondary)" }}>{k}</span>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
