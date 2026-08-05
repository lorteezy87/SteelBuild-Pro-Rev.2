/**
 * Presentational panels for Feet/Inches Calculator.
 */
// @ts-nocheck
import React, { useMemo, useState } from "react";
import { parseLength, formatLength } from "@/utils/lengthMath";
import { optimizeCutList } from "@/utils/cutListOptimizer";
import { STOCK_PRESETS } from "./feetInchesCalculatorHelpers";

const mono = { fontFamily: "var(--font-mono)" };

// ── Cut-List & Stock Optimizer ──────────────────────────────────────
// Collapsible sub-tool: parse a part length (ft-in), a quantity, and a
// stock length (preset chips 20'/40'/60' + custom ft-in), with optional
// kerf. Runs the deterministic optimizeCutList engine and reports
// pieces/stick, sticks needed, total stock, total drop, and waste %.

export function CutListOptimizerPanel({ precision, onCopy }) {
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

export function ResultStat({ label, value, emphasis, onCopy }) {
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

export function ConversionRow({ label, value, onCopy }) {
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
