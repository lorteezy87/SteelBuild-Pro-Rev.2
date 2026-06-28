/**
 * DecimalFractionConverter.jsx
 *
 * Convert tool for the SteelBuild calculator device. Three sub-modes:
 *   • Dec → Frac — decimal feet/inches → fractional dimension
 *   • Frac → Dec — ft/in/fraction (incl. custom) → decimal
 *   • Units      — steel-shop unit conversion (length, weight, stress, …)
 *
 * No calculate button — results update live as the user types (this is a
 * reference tool where speed matters).
 *
 * Pure math lives in:
 *   src/utils/fractionConversion.js  (decimal ↔ fraction, unit-tested)
 *   src/utils/unitConversions.js     (convert / CONVERSIONS, unit-tested)
 *
 * Chrome uses the shared calculator kit (CalcKey keycaps + calc.css tokens);
 * the page renders ONLY its tool content — the Hub provides the outer shell.
 */

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  decimalFeetToFtIn,
  decimalInchesToFraction,
  ftInToDecimalFeet,
  ftInToDecimalInches,
  roundingDelta,
} from "@/utils/fractionConversion";
import { convert, CONVERSIONS } from "@/utils/unitConversions";
import CalcKey from "@/components/calculators/CalcKey";
import "@/components/calculators/calc.css";

const mono = { fontFamily: "var(--font-mono)" };

const cardStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: 12,
  overflow: "hidden",
};
const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "10px 12px",
  color: "var(--text-primary)",
  fontSize: 14,
  ...mono,
  outline: "none",
  boxSizing: "border-box",
};
const selectStyle = { ...inputStyle, padding: "9px 12px", cursor: "pointer" };
const labelStyle = {
  ...mono,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 6,
  display: "block",
};

const DECIMAL_MODES = {
  FEET:   "feet",
  INCHES: "inches",
};

// Three Convert sub-modes — a tool rail within the Convert tool.
const SUB_MODES = {
  DEC_FRAC: "dec_frac",
  FRAC_DEC: "frac_dec",
  UNITS:    "units",
};
const SUB_MODE_TABS = [
  { key: SUB_MODES.DEC_FRAC, label: "Dec → Frac" },
  { key: SUB_MODES.FRAC_DEC, label: "Frac → Dec" },
  { key: SUB_MODES.UNITS,    label: "Units" },
];

// 16ths ladder — the full Pacific-Coast detailer's cheat sheet,
// reduced at display time by the shared helper so the UI stays clean.
const COMMON_FRACTIONS = [
  { num: 0,  den: 1  },  // exactly 0
  { num: 1,  den: 16 },
  { num: 1,  den: 8  },
  { num: 3,  den: 16 },
  { num: 1,  den: 4  },
  { num: 5,  den: 16 },
  { num: 3,  den: 8  },
  { num: 7,  den: 16 },
  { num: 1,  den: 2  },
  { num: 9,  den: 16 },
  { num: 5,  den: 8  },
  { num: 11, den: 16 },
  { num: 3,  den: 4  },
  { num: 13, den: 16 },
  { num: 7,  den: 8  },
  { num: 15, den: 16 },
];

export default function DecimalFractionConverter() {
  const [subMode, setSubMode] = useState(SUB_MODES.DEC_FRAC);

  return (
    <div className="sb-dashboard-reference-page" style={{ padding: 24, background: "var(--bg-page)", minHeight: "calc(100vh - 92px)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: "Space Grotesk, var(--font-display)",
            fontSize: 22, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "-0.01em",
            color: "var(--text-primary)",
          }}>
            {"Decimal ↔ Fraction Converter"}
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 4 }}>
            Cross-reference engineer decimals against detailer fractions · live conversion · 1/16 default
          </div>
        </div>

        {/* Sub-mode tool rail */}
        <div
          className="sbd-calc-tool-rail"
          role="tablist"
          aria-label="Conversion mode"
          style={{ marginBottom: 16 }}
        >
          {SUB_MODE_TABS.map((t) => {
            const active = subMode === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`sbd-calc-tool-rail__btn${active ? " sbd-calc-tool-rail__btn--active" : ""}`}
                onClick={() => setSubMode(t.key)}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Active panel — single column; each sub-mode owns its layout */}
        <div className="frac-grid" style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 16, alignItems: "start",
        }}>
          {subMode === SUB_MODES.DEC_FRAC && <DecimalToFractionPanel />}
          {subMode === SUB_MODES.FRAC_DEC && <FractionToDecimalPanel />}
          {subMode === SUB_MODES.UNITS    && <UnitsPanel />}
        </div>

        {/* Mobile */}
        <style>{`
          @media (max-width: 820px) {
            .frac-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PANEL A — Decimal → Fraction
// ══════════════════════════════════════════════════════════════════
function DecimalToFractionPanel() {
  const [mode, setMode]           = useState(DECIMAL_MODES.FEET);
  const [raw, setRaw]             = useState("");
  const [precision, setPrecision] = useState(16);

  const parsed = parseFloat(raw);
  const isInvalid = raw.trim() !== "" && (!Number.isFinite(parsed) || parsed < 0);

  // Live conversion — null = no usable input yet, string = valid output.
  const formatted = useMemo(() => {
    if (raw.trim() === "") return null;
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return mode === DECIMAL_MODES.FEET
      ? decimalFeetToFtIn(parsed, precision)
      : decimalInchesToFraction(parsed, precision);
  }, [mode, raw, parsed, precision]);

  const delta = useMemo(() => {
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return roundingDelta(parsed, precision, mode === DECIMAL_MODES.FEET ? "feet" : "inches");
  }, [parsed, precision, mode]);

  const copyResult = async () => {
    if (!formatted) return;
    try {
      await navigator.clipboard.writeText(formatted);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const clear = () => { setRaw(""); };

  return (
    <div className="sbd-card" style={cardStyle}>
      <PanelHeader label="Decimal → Fraction" />
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Mode toggle */}
        <div>
          <label style={labelStyle}>Input Units</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: DECIMAL_MODES.FEET,   label: "Decimal Feet" },
              { key: DECIMAL_MODES.INCHES, label: "Decimal Inches" },
            ].map((m) => (
              <button key={m.key}
                onClick={() => setMode(m.key)}
                style={toggleStyle(mode === m.key)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div>
          <label style={labelStyle}>
            {mode === DECIMAL_MODES.FEET ? "Decimal Value (ft)" : "Decimal Value (in)"}
          </label>
          <input
            style={inputStyle}
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={mode === DECIMAL_MODES.FEET ? "e.g. 12.375" : "e.g. 2.75"}
          />
          {isInvalid && (
            <div role="alert" style={inlineErrorStyle}>
              ⚠ Enter a non-negative number.
            </div>
          )}
        </div>

        {/* Precision */}
        <div>
          <label style={labelStyle}>Rounding Precision</label>
          <select
            style={{ ...selectStyle, maxWidth: 160 }}
            value={precision}
            onChange={(e) => setPrecision(Number(e.target.value))}
          >
            <option value={8}>1/8"</option>
            <option value={16}>1/16" (default)</option>
            <option value={32}>1/32"</option>
          </select>
        </div>

        {/* Output */}
        <div style={resultCardStyle}>
          <div style={labelStyle}>Result</div>
          <div style={{
            ...mono,
            fontSize: 28, fontWeight: 800,
            color: formatted ? "var(--accent)" : "var(--text-muted)",
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}>
            {formatted ?? "—"}
          </div>
          {formatted && delta != null && Math.abs(delta) > 1e-9 && (
            <div style={deltaLineStyle}>
              Rounded {delta >= 0 ? "+" : ""}{deltaDisplay(delta, mode)} from exact
            </div>
          )}
          {formatted && delta != null && Math.abs(delta) <= 1e-9 && (
            <div style={{ ...deltaLineStyle, color: "var(--status-success)" }}>
              Exact — no rounding
            </div>
          )}
        </div>

        {/* Actions — keycap-styled */}
        <div style={{ display: "flex", gap: 8 }}>
          <CalcKey
            label="Copy Result"
            variant="accent"
            wide
            disabled={!formatted}
            onPress={copyResult}
            ariaLabel="Copy result"
          />
          <CalcKey
            label="Clear"
            variant="danger"
            onPress={clear}
            ariaLabel="Clear"
          />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PANEL B — Fraction → Decimal
// ══════════════════════════════════════════════════════════════════
function FractionToDecimalPanel() {
  const [feet, setFeet]       = useState("");
  const [inches, setInches]   = useState("");
  // Fraction index into COMMON_FRACTIONS (0 = "none / 0").
  const [fracIdx, setFracIdx] = useState(0);
  // Optional custom-fraction overrides — shown when user picks "custom"
  // from the dropdown. Default to 1/16 for structural convention.
  const [customMode, setCustomMode] = useState(false);
  const [customNum, setCustomNum]   = useState("");
  const [customDen, setCustomDen]   = useState("16");

  const fraction = useMemo(() => customMode
    ? { num: parseFloat(customNum) || 0, den: parseFloat(customDen) || 1 }
    : COMMON_FRACTIONS[fracIdx], [customMode, customNum, customDen, fracIdx]);

  // Validation — collect bad fields so we can render them inline rather
  // than silently producing NaN.
  const errors = useMemo(() => {
    const e = [];
    const f = numOrZero(feet);
    const i = numOrZero(inches);
    if (f < 0 || i < 0) e.push("Negative feet / inches are not allowed.");
    if (customMode) {
      const cn = parseFloat(customNum);
      const cd = parseFloat(customDen);
      if (customNum !== "" && (!Number.isFinite(cn) || cn < 0)) e.push("Numerator must be non-negative.");
      if (!Number.isFinite(cd) || cd <= 0) e.push("Denominator must be a positive number.");
    }
    return e;
  }, [feet, inches, customNum, customDen, customMode]);

  const decFt = useMemo(() => {
    if (errors.length) return null;
    return ftInToDecimalFeet(feet, inches, fraction.num, fraction.den);
  }, [feet, inches, fraction, errors.length]);

  const decIn = useMemo(() => {
    if (errors.length) return null;
    return ftInToDecimalInches(feet, inches, fraction.num, fraction.den);
  }, [feet, inches, fraction, errors.length]);

  // Build a live preview of what the user typed, in inspector-friendly form
  const preview = useMemo(() => {
    if (errors.length) return null;
    const f = numOrZero(feet);
    const i = numOrZero(inches);
    const frac = (fraction.num > 0 && fraction.den > 0)
      ? `${fraction.num}/${fraction.den}`
      : "";
    const inchPart = frac
      ? (i > 0 ? `${i} ${frac}"` : `${frac}"`)
      : `${i}"`;
    return `${f}'-${inchPart}`;
  }, [feet, inches, fraction, errors.length]);

  const copy = async (text) => {
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(String(text));
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const clear = () => {
    setFeet(""); setInches("");
    setFracIdx(0);
    setCustomMode(false); setCustomNum(""); setCustomDen("16");
  };

  return (
    <div className="sbd-card" style={cardStyle}>
      <PanelHeader label="Fraction → Decimal" />
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Feet</label>
            <input style={inputStyle} inputMode="decimal" value={feet}
              onChange={(e) => setFeet(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label style={labelStyle}>Inches</label>
            <input style={inputStyle} inputMode="decimal" value={inches}
              onChange={(e) => setInches(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label style={labelStyle}>Fraction</label>
            {customMode ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  style={{ ...inputStyle, padding: "8px 10px" }}
                  inputMode="numeric"
                  value={customNum}
                  onChange={(e) => setCustomNum(e.target.value)}
                  placeholder="num"
                />
                <span style={{ ...mono, color: "var(--text-muted)", fontSize: 14 }}>/</span>
                <input
                  style={{ ...inputStyle, padding: "8px 10px" }}
                  inputMode="numeric"
                  value={customDen}
                  onChange={(e) => setCustomDen(e.target.value)}
                  placeholder="den"
                />
                <button
                  onClick={() => setCustomMode(false)}
                  title="Use common fraction dropdown"
                  style={{
                    ...mono, fontSize: 9, padding: "4px 8px",
                    background: "transparent", color: "var(--text-muted)",
                    border: "1px solid var(--border-default)", borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  {"×"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <select
                  style={{ ...selectStyle, flex: 1 }}
                  value={fracIdx}
                  onChange={(e) => setFracIdx(Number(e.target.value))}
                >
                  {COMMON_FRACTIONS.map((f, i) => (
                    <option key={i} value={i}>
                      {f.num === 0 ? "0 (none)" : `${f.num}/${f.den}`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setCustomMode(true)}
                  title="Enter a custom fraction"
                  style={{
                    ...mono, fontSize: 9, padding: "4px 10px",
                    background: "transparent", color: "var(--text-muted)",
                    border: "1px solid var(--border-default)", borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>

        {errors.length > 0 && (
          <div role="alert" style={inlineErrorStyle}>
            {"⚠"} {errors.join(" ")}
          </div>
        )}

        {/* Preview */}
        {preview && errors.length === 0 && (
          <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
            Interpreting as <span style={{ color: "var(--text-secondary)", fontWeight: 700 }}>{preview}</span>
          </div>
        )}

        {/* Outputs */}
        <div style={resultCardStyle}>
          <OutputRow label="Decimal feet"   value={decFt != null ? decFt.toFixed(4) : null} onCopy={() => copy(decFt != null ? decFt.toFixed(4) : null)} suffix="ft" />
          <OutputRow label="Decimal inches" value={decIn != null ? decIn.toFixed(4) : null} onCopy={() => copy(decIn != null ? decIn.toFixed(4) : null)} suffix="in" />
        </div>

        <div style={{ display: "flex" }}>
          <CalcKey
            label="Clear"
            variant="danger"
            onPress={clear}
            ariaLabel="Clear"
          />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PANEL C — Units (steel-shop unit conversion)
// ══════════════════════════════════════════════════════════════════
function UnitsPanel() {
  // Default to the first category, and that category's first two units.
  const [categoryId, setCategoryId] = useState(CONVERSIONS[0].id);
  const category = useMemo(
    () => CONVERSIONS.find((c) => c.id === categoryId) ?? CONVERSIONS[0],
    [categoryId],
  );

  const [fromUnit, setFromUnit] = useState(CONVERSIONS[0].units[0]);
  const [toUnit, setToUnit]     = useState(
    CONVERSIONS[0].units[1] ?? CONVERSIONS[0].units[0],
  );
  const [value, setValue]       = useState("");

  // When the category changes, reset the unit selects to its first two units.
  const onCategoryChange = (id) => {
    const cat = CONVERSIONS.find((c) => c.id === id) ?? CONVERSIONS[0];
    setCategoryId(id);
    setFromUnit(cat.units[0]);
    setToUnit(cat.units[1] ?? cat.units[0]);
  };

  const swap = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  // Live conversion — null when input is empty / non-numeric / incompatible.
  const result = useMemo(() => {
    if (value.trim() === "") return null;
    const out = convert(value, fromUnit, toUnit);
    return out == null ? null : out;
  }, [value, fromUnit, toUnit]);

  const resultStr = result == null ? "—" : trimNumber(result);

  const copyResult = async () => {
    if (result == null) return;
    try {
      await navigator.clipboard.writeText(trimNumber(result));
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const clear = () => { setValue(""); };

  return (
    <div className="sbd-card" style={cardStyle}>
      <PanelHeader label="Units" />
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Category */}
        <div>
          <label style={labelStyle}>Category</label>
          <select
            style={{ ...selectStyle, maxWidth: 240 }}
            value={categoryId}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Conversion category"
          >
            {CONVERSIONS.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* From / To selects */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "end" }}>
          <div>
            <label style={labelStyle}>From</label>
            <select
              style={selectStyle}
              value={fromUnit}
              onChange={(e) => setFromUnit(e.target.value)}
              aria-label="From unit"
            >
              {category.units.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div style={{ paddingBottom: 2 }}>
            <CalcKey
              label={"⇄"}
              variant="op"
              onPress={swap}
              ariaLabel="Swap from and to units"
            />
          </div>
          <div>
            <label style={labelStyle}>To</label>
            <select
              style={selectStyle}
              value={toUnit}
              onChange={(e) => setToUnit(e.target.value)}
              aria-label="To unit"
            >
              {category.units.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Value */}
        <div>
          <label style={labelStyle}>Value</label>
          <input
            style={inputStyle}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`e.g. 1 ${fromUnit}`}
            aria-label="Value to convert"
          />
        </div>

        {/* Output */}
        <div style={resultCardStyle}>
          <div style={labelStyle}>Result</div>
          <button
            type="button"
            onClick={copyResult}
            disabled={result == null}
            title={result == null ? "" : "Copy"}
            aria-label="Converted value"
            style={{
              ...mono,
              background: "transparent", border: "none", padding: 0,
              textAlign: "left",
              fontSize: 28, fontWeight: 800,
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
              color: result != null ? "var(--accent)" : "var(--text-muted)",
              cursor: result != null ? "pointer" : "default",
            }}
          >
            {resultStr}
            {result != null && (
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, marginLeft: 8 }}>
                {toUnit}
              </span>
            )}
          </button>
          {result != null && (
            <div style={deltaLineStyle}>
              {trimNumber(numOrZero(value))} {fromUnit} = {resultStr} {toUnit}
            </div>
          )}
        </div>

        {/* Actions — keycap-styled */}
        <div style={{ display: "flex", gap: 8 }}>
          <CalcKey
            label="Copy Result"
            variant="accent"
            wide
            disabled={result == null}
            onPress={copyResult}
            ariaLabel="Copy result"
          />
          <CalcKey
            label="Clear"
            variant="danger"
            onPress={clear}
            ariaLabel="Clear"
          />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────
function PanelHeader({ label }) {
  return (
    <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
        {label}
      </div>
    </div>
  );
}

function OutputRow({ label, value, onCopy, suffix }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 10 }}>
      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {label}
      </span>
      <button
        onClick={onCopy}
        disabled={value == null}
        title={value == null ? "" : "Copy"}
        style={{
          ...mono, background: "transparent", border: "none",
          color: value != null ? "var(--accent)" : "var(--text-muted)",
          cursor: value != null ? "pointer" : "default",
          fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums",
          padding: 0,
        }}
      >
        {value ?? "—"} <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, marginLeft: 4 }}>{suffix}</span>
      </button>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────
const resultCardStyle = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--divider)",
  borderRadius: 6,
  padding: "14px 16px",
};
const deltaLineStyle = {
  ...mono, fontSize: 9, color: "var(--text-muted)",
  letterSpacing: "0.08em", marginTop: 6,
};
const inlineErrorStyle = {
  ...mono,
  fontSize: 11, fontWeight: 600,
  color: "var(--status-review)",
  background: "var(--status-review-muted, rgba(249,115,22,0.12))",
  border: "1px solid var(--status-review-border, rgba(249,115,22,0.40))",
  padding: "6px 10px", borderRadius: 4,
  marginTop: 6,
};

function toggleStyle(active) {
  return {
    ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
    padding: "6px 12px", borderRadius: 4, cursor: "pointer",
    background: active ? "var(--accent)"      : "var(--bg-surface-low)",
    color:      active ? "var(--accent-text)" : "var(--text-secondary)",
    border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
    textTransform: "uppercase",
  };
}

function deltaDisplay(delta, mode) {
  const abs = Math.abs(delta);
  if (mode === DECIMAL_MODES.FEET) return `${abs.toFixed(5)} ft`;
  return `${abs.toFixed(4)}"`;
}

function numOrZero(raw) {
  if (raw == null || raw === "") return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

// Format a converted number cleanly: trim trailing zeros, but keep enough
// precision for shop work (up to 6 significant decimals).
function trimNumber(n) {
  if (!Number.isFinite(n)) return "—";
  // Round to 6 decimals, then strip trailing zeros / dot.
  const fixed = n.toFixed(6);
  return fixed.replace(/\.?0+$/, "");
}
