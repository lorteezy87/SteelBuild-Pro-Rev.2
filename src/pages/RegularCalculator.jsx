/**
 * RegularCalculator.jsx — standard four-function calculator with a
 * fully-typeable keyboard interface and a tape history.
 *
 * Designed to feel like the Windows / macOS desktop calculator that
 * everyone already knows: every button has a one-key shortcut, every
 * shortcut works whether or not the on-screen keypad has focus.
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
 * rows store the formatted line plus the raw numeric value so clicking
 * a row recalls it into entry.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
  const [tape, setTape] = useState([]);             // [{ text, value }]
  const [justEvaluated, setJustEvaluated] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => { rootRef.current?.focus(); }, []);

  const display = useMemo(() => {
    if (entry !== "") return entry;
    return formatNumber(accum);
  }, [entry, accum]);

  const parseEntry = () => {
    const s = entry.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
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
      setTape((t) => [
        { text: `${formatNumber(accum)} ${pendingOp} ${formatNumber(value)} = ${formatNumber(next)}`, value: next },
        ...t,
      ].slice(0, 30));
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
      setTape((t) => [
        { text: `${formatNumber(accum)} ${pendingOp} ${formatNumber(value)} = ${formatNumber(next)}`, value: next },
        ...t,
      ].slice(0, 30));
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

  // Recall a tape row's value into entry.
  const recallTape = (value) => {
    setEntry(String(value));
    setJustEvaluated(false);
    rootRef.current?.focus();
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div
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
          <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
            {/* Display */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)", textAlign: "right" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 }}>
                {pendingOp
                  ? `${formatNumber(accum)} ${pendingOp}`
                  : (entry === "" && accum !== 0 ? "ANS" : " ")}
              </div>
              <div
                onClick={copy}
                title="Click to copy"
                style={{
                  ...mono,
                  fontSize: 36,
                  fontWeight: 800,
                  color: "var(--accent)",
                  lineHeight: 1.0,
                  cursor: "pointer",
                  fontVariantNumeric: "tabular-nums",
                  wordBreak: "break-all",
                }}
              >
                {display}
              </div>
            </div>

            {/* Function row */}
            <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
              <Fn onClick={mClear}  shortcut="⌥C">MC</Fn>
              <Fn onClick={mRecall} shortcut="⌥R">MR</Fn>
              <Fn onClick={mPlus}   shortcut="⌥P">M+</Fn>
              <Fn onClick={mMinus}  shortcut="⌥M">M−</Fn>
              <Fn onClick={() => { setEntry(formatNumber(memory)); setJustEvaluated(false); }} disabled={memory === 0}>MS</Fn>
            </div>

            {/* Main pad */}
            <div style={{ padding: "0 12px 12px 12px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              <PadBtn onClick={percent}       variant="op"   shortcut="%">%</PadBtn>
              <PadBtn onClick={sqroot}        variant="op"   shortcut="s">√x</PadBtn>
              <PadBtn onClick={square}        variant="op"   shortcut="q">x²</PadBtn>
              <PadBtn onClick={reciprocal}    variant="op"   shortcut="r">1/x</PadBtn>

              <PadBtn onClick={clearEntry}    variant="ghost" shortcut="Del">CE</PadBtn>
              <PadBtn onClick={clearAll}      variant="danger" shortcut="Esc">AC</PadBtn>
              <PadBtn onClick={backspace}     variant="ghost" shortcut="⌫">⌫</PadBtn>
              <PadBtn onClick={() => setOp(OPS.DIV)} variant="op" active={pendingOp === OPS.DIV} shortcut="/">÷</PadBtn>

              <PadBtn onClick={() => inputDigit("7")} shortcut="7">7</PadBtn>
              <PadBtn onClick={() => inputDigit("8")} shortcut="8">8</PadBtn>
              <PadBtn onClick={() => inputDigit("9")} shortcut="9">9</PadBtn>
              <PadBtn onClick={() => setOp(OPS.MUL)}  variant="op" active={pendingOp === OPS.MUL} shortcut="*">×</PadBtn>

              <PadBtn onClick={() => inputDigit("4")} shortcut="4">4</PadBtn>
              <PadBtn onClick={() => inputDigit("5")} shortcut="5">5</PadBtn>
              <PadBtn onClick={() => inputDigit("6")} shortcut="6">6</PadBtn>
              <PadBtn onClick={() => setOp(OPS.SUB)}  variant="op" active={pendingOp === OPS.SUB} shortcut="-">−</PadBtn>

              <PadBtn onClick={() => inputDigit("1")} shortcut="1">1</PadBtn>
              <PadBtn onClick={() => inputDigit("2")} shortcut="2">2</PadBtn>
              <PadBtn onClick={() => inputDigit("3")} shortcut="3">3</PadBtn>
              <PadBtn onClick={() => setOp(OPS.ADD)}  variant="op" active={pendingOp === OPS.ADD} shortcut="+">+</PadBtn>

              <PadBtn onClick={toggleSign}              shortcut="_">±</PadBtn>
              <PadBtn onClick={() => inputDigit("0")}   shortcut="0">0</PadBtn>
              <PadBtn onClick={() => inputDigit(".")}   shortcut=".">.</PadBtn>
              <PadBtn onClick={equals} variant="primary" shortcut="↵">=</PadBtn>
            </div>
          </div>

          {/* ── Tape / Help ────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  History
                </div>
                {tape.length > 0 && (
                  <button
                    onClick={() => setTape([])}
                    style={{ background: "transparent", border: "none", ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", cursor: "pointer" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {tape.length === 0 ? (
                  <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "16px 14px", textAlign: "center", fontStyle: "italic" }}>
                    No history yet
                  </div>
                ) : tape.map((row, i) => (
                  <button
                    key={i}
                    onClick={() => recallTape(row.value)}
                    title="Click to recall this result into entry"
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "8px 14px",
                      borderBottom: "1px solid var(--divider)",
                      background: "transparent", border: "none",
                      ...mono, fontSize: 11, color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    {row.text}
                  </button>
                ))}
              </div>
            </div>

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
function PadBtn({ onClick, children, variant = "default", active, small, shortcut }) {
  const base = {
    border: "1px solid var(--border-default)",
    borderRadius: 6,
    padding: small ? "8px 4px" : "14px 4px",
    cursor: "pointer",
    ...mono,
    fontSize: small ? 10 : 16,
    fontWeight: 700,
    transition: "all 0.08s",
    position: "relative",
  };
  let style = { ...base, background: "var(--bg-surface-low)", color: "var(--text-primary)" };
  if (variant === "primary") {
    style = { ...base, background: "var(--accent)", color: "var(--accent-text, #000)", border: "1px solid var(--accent)" };
  } else if (variant === "danger") {
    style = { ...base, background: "var(--danger-muted)", color: "var(--status-error)", border: "1px solid var(--danger-border)" };
  } else if (variant === "op") {
    style = active
      ? { ...base, background: "var(--accent-muted)", color: "var(--accent)", border: "1px solid var(--accent-border)" }
      : { ...base, background: "var(--bg-surface)", color: "var(--text-secondary)" };
  } else if (variant === "ghost") {
    style = { ...base, background: "transparent", color: "var(--text-muted)" };
  }
  return (
    <button onClick={onClick} style={style} title={shortcut ? `Shortcut: ${shortcut}` : undefined}>
      {children}
      {shortcut && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 2, right: 4,
            ...mono, fontSize: 7, fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
            opacity: 0.55,
            pointerEvents: "none",
          }}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}

function Fn({ onClick, children, disabled, shortcut }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `Shortcut: ${shortcut}` : undefined}
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        padding: "8px 4px",
        cursor: disabled ? "not-allowed" : "pointer",
        ...mono, fontSize: 10, fontWeight: 700,
        color: disabled ? "var(--text-muted)" : "var(--text-secondary)",
        opacity: disabled ? 0.5 : 1,
        position: "relative",
      }}
    >
      {children}
      {shortcut && (
        <span aria-hidden="true" style={{ position: "absolute", top: 2, right: 4, ...mono, fontSize: 7, color: "var(--text-muted)", opacity: 0.55 }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}

function KbRow({ k, label }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", ...mono, fontSize: 10 }}>
      <span style={{ color: "var(--text-secondary)" }}>{k}</span>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
