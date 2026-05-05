/**
 * SteelWeightCalculator.jsx
 *
 * PM tool for estimating piece weight and total tonnage for common
 * structural steel shapes. Sits alongside FeetInchesCalculator in the
 * PM Tools menu.
 *
 * The length input reuses the feet-inches parsing from
 * FeetInchesCalculator (parseLength + ticksToDecimalFeet) so the field
 * crew can type "12'-6 1/2"" or "150" (inches) or "8.25ft" exactly the
 * same way they do in the sister calculator.
 *
 * Calculations are local (no Supabase round-trips). The running total
 * is React-state-only — session-scoped and cleared on page leave.
 *
 * Shape data lives in src/data/aiscShapes.js (AISC Manual 15th Ed.).
 */

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  SHAPE_FAMILIES,
  findShape,
  computeDynamicLbPerFt,
} from "@/data/aiscShapes";
import {
  parseLength,
  ticksToDecimalFeet,
  formatLength,
} from "./FeetInchesCalculator";

const mono = { fontFamily: "var(--font-mono)" };
const body = { fontFamily: "var(--font-body)" };

// Card + input style tokens mirror FeetInchesCalculator so both tools
// feel visually identical.
const cardStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
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
const selectStyle = {
  ...inputStyle,
  padding: "9px 12px",
  cursor: "pointer",
};
const labelStyle = {
  ...mono,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 6,
  display: "block",
};

// ── Length input modes ─────────────────────────────────────────────
// The user toggles between "ft-in" (jobsite shorthand like 12'-6 1/2")
// and "decimal" (plain feet, e.g. 12.5). Both resolve to a feet number
// that feeds the weight math.
const LENGTH_MODES = {
  FT_IN:   "ft-in",
  DECIMAL: "decimal",
};

function parseLengthFeet(raw, mode) {
  if (raw == null || String(raw).trim() === "") return null;
  if (mode === LENGTH_MODES.DECIMAL) {
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // Default: feet-inches mode. parseLength returns 32nd-inch ticks.
  const ticks = parseLength(raw);
  if (ticks == null || ticks <= 0) return null;
  return ticksToDecimalFeet(ticks);
}

export default function SteelWeightCalculator() {
  const [familyKey, setFamilyKey] = useState(SHAPE_FAMILIES[0].key);
  const [designation, setDesignation] = useState(
    SHAPE_FAMILIES[0].shapes[0]?.designation || ""
  );

  // Dimensional inputs for dynamic families (plate / round / square / flat).
  const [plateThickness, setPlateThickness] = useState("");
  const [plateWidth, setPlateWidth] = useState("");
  const [roundDiameter, setRoundDiameter] = useState("");
  const [squareSide, setSquareSide] = useState("");
  const [flatThickness, setFlatThickness] = useState("");
  const [flatWidth, setFlatWidth] = useState("");

  // Length + quantity.
  const [lengthMode, setLengthMode] = useState(LENGTH_MODES.FT_IN);
  const [lengthRaw, setLengthRaw] = useState("");
  const [qty, setQty] = useState("1");

  // Results state — populated on Calculate, cleared when inputs change.
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Running-total list for the session.
  const [runningTotal, setRunningTotal] = useState([]);

  // ── Derived helpers ────────────────────────────────────────────
  const family = useMemo(
    () => SHAPE_FAMILIES.find((f) => f.key === familyKey) || SHAPE_FAMILIES[0],
    [familyKey]
  );

  // When the user switches family, preselect the first designation in
  // that family (or clear if dynamic).
  const handleFamilyChange = (key) => {
    setFamilyKey(key);
    const fam = SHAPE_FAMILIES.find((f) => f.key === key);
    if (fam?.shapes?.length) {
      setDesignation(fam.shapes[0].designation);
    } else {
      setDesignation("");
    }
    setResult(null);
    setError(null);
  };

  /**
   * Resolve the currently-chosen shape into lb/ft. Returns null when
   * the dimensional inputs for a dynamic family aren't valid yet.
   */
  const currentLbPerFt = useMemo(() => {
    if (!family.dynamic) {
      const row = findShape(designation);
      return row ? row.weightPerFoot : null;
    }
    switch (family.dynamic) {
      case "plate":
        return computeDynamicLbPerFt("plate", {
          thickness: parseFloat(plateThickness),
          width:     parseFloat(plateWidth),
        });
      case "round-bar":
        return computeDynamicLbPerFt("round-bar", {
          diameter: parseFloat(roundDiameter),
        });
      case "square-bar":
        return computeDynamicLbPerFt("square-bar", {
          side: parseFloat(squareSide),
        });
      case "flat-bar":
        return computeDynamicLbPerFt("flat-bar", {
          thickness: parseFloat(flatThickness),
          width:     parseFloat(flatWidth),
        });
      default:
        return null;
    }
  }, [
    family, designation,
    plateThickness, plateWidth,
    roundDiameter, squareSide,
    flatThickness, flatWidth,
  ]);

  /** Human-readable description of the current shape for tape rows. */
  const currentShapeLabel = useMemo(() => {
    if (!family.dynamic) return designation || "—";
    switch (family.dynamic) {
      case "plate":
        if (!plateThickness || !plateWidth) return "PL";
        return `PL ${plateThickness}" × ${plateWidth}"`;
      case "round-bar":
        if (!roundDiameter) return "Round Bar";
        return `Ø${roundDiameter}" Round`;
      case "square-bar":
        if (!squareSide) return "Square Bar";
        return `${squareSide}" Square`;
      case "flat-bar":
        if (!flatThickness || !flatWidth) return "Flat Bar";
        return `FB ${flatThickness}" × ${flatWidth}"`;
      default:
        return "—";
    }
  }, [
    family, designation,
    plateThickness, plateWidth,
    roundDiameter, squareSide,
    flatThickness, flatWidth,
  ]);

  // ── Calculate ──────────────────────────────────────────────────
  const handleCalculate = () => {
    setError(null);
    setResult(null);

    const lbPerFt = currentLbPerFt;
    if (!(lbPerFt > 0)) {
      setError("Enter valid shape dimensions (positive numbers only).");
      return;
    }

    const lengthFt = parseLengthFeet(lengthRaw, lengthMode);
    if (!(lengthFt > 0)) {
      setError(
        lengthMode === LENGTH_MODES.DECIMAL
          ? "Enter a positive length (ft)."
          : "Enter a valid length, e.g. 12'-6 1/2\" or 150 (inches)."
      );
      return;
    }

    const qtyN = parseInt(qty, 10);
    if (!(qtyN > 0)) {
      setError("Quantity must be a positive whole number.");
      return;
    }

    const piece = lbPerFt * lengthFt;
    const total = piece * qtyN;

    setResult({
      shape:     currentShapeLabel,
      lbPerFt,
      lengthFt,
      lengthDisplay:
        lengthMode === LENGTH_MODES.FT_IN
          ? formatLength(parseLength(lengthRaw), 16)
          : `${lengthFt.toFixed(4)} ft`,
      qty:       qtyN,
      pieceWeight: piece,
      totalWeight: total,
      totalTons:   total / 2000,
    });
  };

  const handleAddToRunningTotal = () => {
    if (!result) return;
    setRunningTotal((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        shape:        result.shape,
        lbPerFt:      result.lbPerFt,
        qty:          result.qty,
        lengthFt:     result.lengthFt,
        lengthDisplay: result.lengthDisplay,
        pieceWeight:  result.pieceWeight,
        totalWeight:  result.totalWeight,
      },
    ]);
    toast.success("Added to running total");
  };

  const removeFromRunningTotal = (id) =>
    setRunningTotal((prev) => prev.filter((r) => r.id !== id));

  const clearRunningTotal = () => {
    setRunningTotal([]);
  };

  const grandTotal = useMemo(
    () => runningTotal.reduce((sum, r) => sum + r.totalWeight, 0),
    [runningTotal]
  );

  const copyGrandTotal = async () => {
    try {
      await navigator.clipboard.writeText(`${grandTotal.toFixed(2)} lb`);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, background: "var(--bg-page)", minHeight: "calc(100vh - 92px)" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: "Space Grotesk, var(--font-display)",
            fontSize: 22, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "-0.01em",
            color: "var(--text-primary)",
          }}>
            Steel Weight Calculator
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 4 }}>
            AISC Manual 15th Ed. · lb/ft × length × qty · round-total to 3-dec tons
          </div>
        </div>

        {/* Main grid: inputs + results */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }} className="weight-calc-grid">

          {/* ── INPUTS CARD ────────────────────────────────────── */}
          <div className="sbd-card" style={cardStyle}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Inputs
              </div>
            </div>

            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Row 1: Family */}
              <div>
                <label style={labelStyle}>Shape Family</label>
                <select
                  value={familyKey}
                  onChange={(e) => handleFamilyChange(e.target.value)}
                  style={selectStyle}
                >
                  {SHAPE_FAMILIES.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>

              {/* Row 2: Designation (rolled) OR dims (dynamic) */}
              {!family.dynamic && (
                <div>
                  <label style={labelStyle}>Designation</label>
                  <select
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    style={selectStyle}
                  >
                    {family.shapes.map((s) => (
                      <option key={s.designation} value={s.designation}>
                        {s.designation} · {s.weightPerFoot} lb/ft
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {family.dynamic === "plate" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Thickness (in)</label>
                    <input
                      style={inputStyle}
                      inputMode="decimal"
                      value={plateThickness}
                      onChange={(e) => setPlateThickness(e.target.value)}
                      placeholder="e.g. 0.5"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Width (in)</label>
                    <input
                      style={inputStyle}
                      inputMode="decimal"
                      value={plateWidth}
                      onChange={(e) => setPlateWidth(e.target.value)}
                      placeholder="e.g. 12"
                    />
                  </div>
                </div>
              )}

              {family.dynamic === "round-bar" && (
                <div>
                  <label style={labelStyle}>Diameter (in)</label>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    value={roundDiameter}
                    onChange={(e) => setRoundDiameter(e.target.value)}
                    placeholder="e.g. 1.25"
                  />
                </div>
              )}

              {family.dynamic === "square-bar" && (
                <div>
                  <label style={labelStyle}>Side (in)</label>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    value={squareSide}
                    onChange={(e) => setSquareSide(e.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
              )}

              {family.dynamic === "flat-bar" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Thickness (in)</label>
                    <input
                      style={inputStyle}
                      inputMode="decimal"
                      value={flatThickness}
                      onChange={(e) => setFlatThickness(e.target.value)}
                      placeholder="e.g. 0.375"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Width (in)</label>
                    <input
                      style={inputStyle}
                      inputMode="decimal"
                      value={flatWidth}
                      onChange={(e) => setFlatWidth(e.target.value)}
                      placeholder="e.g. 4"
                    />
                  </div>
                </div>
              )}

              {/* Row 3: Length with mode toggle */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Length</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[
                      { key: LENGTH_MODES.FT_IN,   label: "FT-IN" },
                      { key: LENGTH_MODES.DECIMAL, label: "DECIMAL FT" },
                    ].map((m) => (
                      <button
                        key={m.key}
                        onClick={() => setLengthMode(m.key)}
                        style={{
                          ...mono,
                          fontSize: 8, fontWeight: 700,
                          letterSpacing: "0.08em",
                          padding: "3px 8px",
                          borderRadius: 4,
                          cursor: "pointer",
                          background: lengthMode === m.key ? "var(--accent)" : "var(--bg-surface-low)",
                          color:      lengthMode === m.key ? "var(--accent-text)" : "var(--text-secondary)",
                          border: `1px solid ${lengthMode === m.key ? "var(--accent)" : "var(--border-default)"}`,
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  style={inputStyle}
                  value={lengthRaw}
                  onChange={(e) => setLengthRaw(e.target.value)}
                  placeholder={
                    lengthMode === LENGTH_MODES.FT_IN
                      ? `e.g. 12'-6 1/2"   or   150  (inches)`
                      : `e.g. 12.5`
                  }
                />
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
                  {lengthMode === LENGTH_MODES.FT_IN
                    ? <>Accepts <code>12'6 1/2"</code>, <code>12-6-1/2</code>, <code>6.5"</code>, <code>150</code> (→ inches), <code>8.25ft</code>.</>
                    : <>Plain decimal feet, e.g. <code>12.5</code>.</>}
                </div>
              </div>

              {/* Row 4: Qty */}
              <div>
                <label style={labelStyle}>Quantity</label>
                <input
                  style={{ ...inputStyle, maxWidth: 160 }}
                  type="number"
                  min="1"
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>

              {/* Calculate button */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleCalculate}
                  style={{
                    ...mono,
                    fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.08em",
                    padding: "10px 18px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: "var(--status-review)",
                    color: "#FFFFFF",
                    border: "none",
                    textTransform: "uppercase",
                  }}
                >
                  Calculate
                </button>
                {result && (
                  <button
                    onClick={handleAddToRunningTotal}
                    style={{
                      ...mono,
                      fontSize: 11, fontWeight: 700,
                      letterSpacing: "0.08em",
                      padding: "10px 18px",
                      borderRadius: 6,
                      cursor: "pointer",
                      background: "var(--bg-surface)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                      textTransform: "uppercase",
                    }}
                  >
                    + Add to Running Total
                  </button>
                )}
              </div>

              {/* Validation error */}
              {error && (
                <div
                  role="alert"
                  style={{
                    ...mono,
                    fontSize: 11, fontWeight: 700,
                    color: "var(--status-review)",
                    background: "var(--status-review-muted, rgba(249,115,22,0.12))",
                    border: "1px solid var(--status-review-border, rgba(249,115,22,0.40))",
                    padding: "8px 12px",
                    borderRadius: 6,
                  }}
                >
                  ⚠ {error}
                </div>
              )}
            </div>
          </div>

          {/* ── RESULT CARD ────────────────────────────────────── */}
          <div className="sbd-card" style={cardStyle}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                Result
              </div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              {!result ? (
                <div style={{ ...body, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  Pick a shape, enter a length, and press <b>Calculate</b>.
                  <br /><br />
                  Works for rolled shapes (W / HSS / C / MC / L) and for
                  bar / plate stock (dimensions feed the AISC density
                  formula, <code>lb/ft = 3.4028 × in²</code>).
                </div>
              ) : (
                <>
                  <div style={{ ...mono, fontSize: 14, color: "var(--accent)", fontWeight: 700, letterSpacing: "0.04em", marginBottom: 12 }}>
                    {result.shape}
                  </div>

                  <ResultRow label="lb/ft (reference)"    value={`${result.lbPerFt.toFixed(3)} lb/ft`} />
                  <ResultRow label="Length"               value={result.lengthDisplay} />
                  <ResultRow label="Quantity"             value={`${result.qty}`} />
                  <div style={{ height: 1, background: "var(--divider)", margin: "12px 0" }} />
                  <ResultRow label="Weight per piece"     value={`${result.pieceWeight.toFixed(2)} lb`} emphasize />
                  <ResultRow label="Total weight"         value={`${result.totalWeight.toFixed(2)} lb`} emphasize />
                  <ResultRow label="Total weight (tons)"  value={`${result.totalTons.toFixed(3)} T`} emphasize highlight />
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── RUNNING TOTAL ──────────────────────────────────────── */}
        <div className="sbd-card" style={{ ...cardStyle, marginTop: 20 }}>
          <div style={{
            padding: "14px 18px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Running Total ({runningTotal.length})
            </div>
            {runningTotal.length > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={copyGrandTotal}
                  style={{
                    ...mono, fontSize: 9, fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: "var(--bg-surface)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    cursor: "pointer",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Copy Total
                </button>
                <button
                  onClick={clearRunningTotal}
                  style={{
                    ...mono, fontSize: 9, fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: "var(--danger-muted)",
                    color: "var(--status-error)",
                    border: "1px solid var(--danger-border)",
                    cursor: "pointer",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          <div style={{ overflowX: "auto" }}>
            {runningTotal.length === 0 ? (
              <div style={{ padding: "28px 20px", textAlign: "center", ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.10em" }}>
                No entries yet — calculate a piece and hit <b>+ Add to Running Total</b>.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                <thead>
                  <tr>
                    {["Shape", "Qty", "Length", "Piece (lb)", "Total (lb)", ""].map((h, i) => (
                      <th key={i} style={{
                        ...mono,
                        fontSize: 8, fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        textAlign: i === 0 ? "left" : i === 5 ? "right" : "right",
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--divider)",
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runningTotal.map((r) => (
                    <tr key={r.id}>
                      <td style={tdLeft}>{r.shape}</td>
                      <td style={tdRight}>{r.qty}</td>
                      <td style={tdRight}>{r.lengthDisplay}</td>
                      <td style={tdRight}>{r.pieceWeight.toFixed(2)}</td>
                      <td style={tdRight}>{r.totalWeight.toFixed(2)}</td>
                      <td style={{ ...tdRight, paddingRight: 12 }}>
                        <button
                          onClick={() => removeFromRunningTotal(r.id)}
                          aria-label={`Remove ${r.shape}`}
                          title="Remove row"
                          style={{
                            ...mono,
                            fontSize: 10, fontWeight: 700,
                            padding: "3px 8px",
                            background: "transparent",
                            color: "var(--text-muted)",
                            border: "1px solid var(--border-default)",
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{
                      ...mono, fontSize: 11, fontWeight: 700,
                      color: "var(--text-primary)",
                      padding: "12px",
                      borderTop: "2px solid var(--border-default)",
                      textAlign: "right",
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                    }}>
                      Grand Total
                    </td>
                    <td style={{
                      ...mono, fontSize: 13, fontWeight: 800,
                      color: "var(--accent)",
                      padding: "12px",
                      borderTop: "2px solid var(--border-default)",
                      textAlign: "right",
                    }}>
                      {grandTotal.toFixed(2)} lb
                    </td>
                    <td style={{
                      ...mono, fontSize: 10, fontWeight: 700,
                      color: "var(--text-muted)",
                      padding: "12px",
                      borderTop: "2px solid var(--border-default)",
                      textAlign: "right",
                    }}>
                      {(grandTotal / 2000).toFixed(3)} T
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Mobile — collapse the inputs/result grid to a single column
            under 760px so the page is usable on a tablet in the field. */}
        <style>{`
          @media (max-width: 760px) {
            .weight-calc-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────
function ResultRow({ label, value, emphasize, highlight }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      marginBottom: 6,
      gap: 12,
    }}>
      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{
        ...mono,
        fontSize: emphasize ? 18 : 12,
        fontWeight: emphasize ? 800 : 600,
        color: highlight ? "var(--accent)" : "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  );
}

const tdBase = {
  ...mono,
  fontSize: 11,
  color: "var(--text-primary)",
  padding: "8px 12px",
  borderBottom: "1px solid var(--divider)",
  fontVariantNumeric: "tabular-nums",
};
const tdLeft  = { ...tdBase, textAlign: "left"  };
const tdRight = { ...tdBase, textAlign: "right" };
