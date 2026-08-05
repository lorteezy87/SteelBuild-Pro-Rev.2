/**
 * RegularCalculator.jsx — standard four-function calculator with a
 * fully-typeable keyboard interface and a persistent tape history.
 *
 * Pure state transitions live in regularCalculator/regularCalculatorHelpers.ts.
 * Designed to feel like the Windows / macOS desktop calculator: every button
 * has a one-key shortcut whether or not the on-screen keypad has focus.
 *
 * The on-screen keypad is built from the shared tactile device kit
 * (CalcDisplay + CalcKeypad/CalcKey + CalcTape). The history tape is
 * persisted across reloads via useCalcTape("calc:standard", 30).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import CalcDisplay from "@/components/calculators/CalcDisplay";
import CalcKeypad from "@/components/calculators/CalcKeypad";
import CalcKey from "@/components/calculators/CalcKey";
import CalcTape from "@/components/calculators/CalcTape";
import useCalcTape from "@/components/calculators/useCalcTape";
import {
  OPS,
  formatNumber,
  computeDisplay,
  computeAux,
  createInitialCalcState,
  applyDigit,
  applyBinaryOp,
  applyEquals,
  applyClearAll,
  applyClearEntry,
  applyBackspace,
  applyToggleSign,
  applyPercent,
  applyReciprocal,
  applySquare,
  applySqrt,
  displayedValue,
  applyMemoryRecall,
  applyMemoryStoreToEntry,
  applyTapeRecall,
} from "./regularCalculator/regularCalculatorHelpers";
import { KbRow } from "./regularCalculator/RegularCalculatorUi";

const mono = { fontFamily: "var(--font-mono)" };

function toastCalcError(error) {
  if (error === "divide_by_zero") toast.error("Cannot divide by zero");
  else if (error === "sqrt_negative") toast.error("Cannot sqrt a negative");
}

export default function RegularCalculator() {
  const [calc, setCalc] = useState(() => createInitialCalcState());
  const [memory, setMemory] = useState(0);
  const tape = useCalcTape("calc:standard", 30);
  const rootRef = useRef(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const { accum, pendingOp, entry } = calc;

  const display = useMemo(() => computeDisplay(entry, accum), [entry, accum]);
  const aux = useMemo(
    () => computeAux(pendingOp, accum, entry),
    [pendingOp, accum, entry],
  );

  const commitStep = (result) => {
    if (result.error) {
      toastCalcError(result.error);
      return;
    }
    setCalc(result.state);
    if (result.tape) tape.push(result.tape);
  };

  const inputDigit = (d) => setCalc((s) => applyDigit(s, d));

  const setOp = (op) => commitStep(applyBinaryOp(calc, op));

  const equals = () => commitStep(applyEquals(calc));

  const clearAll = () => setCalc(applyClearAll(calc));

  const clearEntry = () => setCalc(applyClearEntry(calc));

  const backspace = () => setCalc(applyBackspace(calc));

  const toggleSign = () => setCalc(applyToggleSign(calc));

  const percent = () => setCalc(applyPercent(calc));

  const reciprocal = () => commitStep(applyReciprocal(calc));

  const square = () => setCalc(applySquare(calc));

  const sqroot = () => commitStep(applySqrt(calc));

  const mPlus = () => {
    setMemory((m) => m + displayedValue(calc));
    toast.success("M+");
  };
  const mMinus = () => {
    setMemory((m) => m - displayedValue(calc));
    toast.success("M−");
  };
  const mRecall = () => setCalc((s) => applyMemoryRecall(s, memory));
  const mClear = () => {
    setMemory(0);
    toast.success("MC");
  };
  const mStore = () => setCalc((s) => applyMemoryStoreToEntry(s, memory));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(display);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  // ── Keyboard handler ──────────────────────────────────────────────
  // Listens at the page-root div (tabIndex=-1, autofocus on mount) so
  // the user can land on the page and start typing without clicking
  // anything first. Exhaustive: every visible button has a key shortcut.
  const onKey = (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const k = e.key;

    if ((e.metaKey || e.altKey) && (k === "p" || k === "P")) {
      e.preventDefault();
      mPlus();
      return;
    }
    if ((e.metaKey || e.altKey) && (k === "m" || k === "M")) {
      e.preventDefault();
      mMinus();
      return;
    }
    if ((e.metaKey || e.altKey) && (k === "r" || k === "R")) {
      e.preventDefault();
      mRecall();
      return;
    }
    if ((e.metaKey || e.altKey) && (k === "c" || k === "C")) {
      e.preventDefault();
      mClear();
      return;
    }

    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      inputDigit(k);
      return;
    }
    if (k === ".") {
      e.preventDefault();
      inputDigit(".");
      return;
    }

    if (k === "+") {
      e.preventDefault();
      setOp(OPS.ADD);
      return;
    }
    if (k === "-") {
      e.preventDefault();
      setOp(OPS.SUB);
      return;
    }
    if (k === "*" || k === "x" || k === "X") {
      e.preventDefault();
      setOp(OPS.MUL);
      return;
    }
    if (k === "/") {
      e.preventDefault();
      setOp(OPS.DIV);
      return;
    }

    if (k === "Enter" || k === "=") {
      e.preventDefault();
      equals();
      return;
    }
    if (k === "Backspace") {
      e.preventDefault();
      backspace();
      return;
    }
    if (k === "Escape" || k === "c" || k === "C") {
      e.preventDefault();
      clearAll();
      return;
    }
    if (k === "Delete") {
      e.preventDefault();
      clearEntry();
      return;
    }

    if (k === "%") {
      e.preventDefault();
      percent();
      return;
    }
    if (k === "_" || k === "n" || k === "N") {
      e.preventDefault();
      toggleSign();
      return;
    }
    if (k === "r") {
      e.preventDefault();
      reciprocal();
      return;
    }
    if (k === "q") {
      e.preventDefault();
      square();
      return;
    }
    if (k === "s") {
      e.preventDefault();
      sqroot();
      return;
    }
  };

  const recallTape = (row) => {
    setCalc((s) => applyTapeRecall(s, row));
    rootRef.current?.focus();
  };

  return (
    <div
      className="sb-dashboard-reference-page"
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKey}
      style={{
        padding: 24,
        background: "var(--bg-page)",
        minHeight: "calc(100vh - 92px)",
        outline: "none",
      }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "Space Grotesk, var(--font-display)",
                fontSize: 22,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                color: "var(--text-primary)",
              }}
            >
              Calculator
            </div>
            <div
              style={{
                ...mono,
                fontSize: 10,
                color: "var(--text-muted)",
                letterSpacing: "0.10em",
                marginTop: 4,
              }}
            >
              Standard four-function · keyboard-first · type anywhere on page
            </div>
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
            {memory !== 0 ? `M = ${formatNumber(memory)}` : ""}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
          <div
            className="sbd-card"
            style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
          >
            <CalcDisplay
              value={display}
              aux={aux}
              memoryActive={memory !== 0}
              onCopy={copy}
            />

            <CalcKeypad columns={5}>
              <CalcKey label="MC" variant="fn" secondary="⌥C" onPress={mClear} ariaLabel="Memory clear" />
              <CalcKey label="MR" variant="fn" secondary="⌥R" onPress={mRecall} ariaLabel="Memory recall" />
              <CalcKey label="M+" variant="fn" secondary="⌥P" onPress={mPlus} ariaLabel="Memory add" />
              <CalcKey label="M−" variant="fn" secondary="⌥M" onPress={mMinus} ariaLabel="Memory subtract" />
              <CalcKey
                label="MS"
                variant="fn"
                onPress={mStore}
                disabled={memory === 0}
                ariaLabel="Memory store to entry"
              />
            </CalcKeypad>

            <CalcKeypad columns={4}>
              <CalcKey label="%" variant="fn" secondary="%" onPress={percent} ariaLabel="Percent" />
              <CalcKey label="√x" variant="fn" secondary="s" onPress={sqroot} ariaLabel="Square root" />
              <CalcKey label="x²" variant="fn" secondary="q" onPress={square} ariaLabel="Square" />
              <CalcKey label="1/x" variant="fn" secondary="r" onPress={reciprocal} ariaLabel="Reciprocal" />

              <CalcKey label="CE" variant="fn" secondary="Del" onPress={clearEntry} ariaLabel="Clear entry" />
              <CalcKey label="AC" variant="danger" secondary="Esc" onPress={clearAll} ariaLabel="Clear all" />
              <CalcKey label="⌫" variant="fn" secondary="⌫" onPress={backspace} ariaLabel="Backspace" />
              <CalcKey label="÷" variant="op" secondary="/" onPress={() => setOp(OPS.DIV)} ariaLabel="Divide" />

              <CalcKey label="7" variant="digit" secondary="7" onPress={() => inputDigit("7")} />
              <CalcKey label="8" variant="digit" secondary="8" onPress={() => inputDigit("8")} />
              <CalcKey label="9" variant="digit" secondary="9" onPress={() => inputDigit("9")} />
              <CalcKey label="×" variant="op" secondary="*" onPress={() => setOp(OPS.MUL)} ariaLabel="Multiply" />

              <CalcKey label="4" variant="digit" secondary="4" onPress={() => inputDigit("4")} />
              <CalcKey label="5" variant="digit" secondary="5" onPress={() => inputDigit("5")} />
              <CalcKey label="6" variant="digit" secondary="6" onPress={() => inputDigit("6")} />
              <CalcKey label="−" variant="op" secondary="-" onPress={() => setOp(OPS.SUB)} ariaLabel="Subtract" />

              <CalcKey label="1" variant="digit" secondary="1" onPress={() => inputDigit("1")} />
              <CalcKey label="2" variant="digit" secondary="2" onPress={() => inputDigit("2")} />
              <CalcKey label="3" variant="digit" secondary="3" onPress={() => inputDigit("3")} />
              <CalcKey label="+" variant="op" secondary="+" onPress={() => setOp(OPS.ADD)} ariaLabel="Add" />

              <CalcKey label="±" variant="fn" secondary="_" onPress={toggleSign} ariaLabel="Toggle sign" />
              <CalcKey label="0" variant="digit" secondary="0" onPress={() => inputDigit("0")} />
              <CalcKey label="." variant="digit" secondary="." onPress={() => inputDigit(".")} ariaLabel="Decimal point" />
              <CalcKey label="=" variant="accent" secondary="↵" onPress={equals} ariaLabel="Equals" />
            </CalcKeypad>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <CalcTape rows={tape.rows} onRecall={recallTape} onClear={tape.clear} />

            <div className="sbd-card" style={{ padding: "10px 14px" }}>
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
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
