/**
 * SteelWeightCalculator.jsx
 *
 * PM tool for estimating piece weight and total tonnage for common
 * structural steel shapes. Sits alongside FeetInchesCalculator in the
 * PM Tools menu.
 *
 * Pure helpers → steelWeightCalculator/steelWeightCalculatorHelpers.ts
 * Presentational tokens/rows → steelWeightCalculator/SteelWeightCalculatorUi.tsx
 */

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SHAPE_FAMILIES } from "@/data/aiscShapes";
import { rollupCost, COST_UNITS } from "@/utils/steelCost";
import CalcKey from "@/components/calculators/CalcKey";
import CalcDisplay from "@/components/calculators/CalcDisplay";
import {
  LS_RATE,
  LS_UNIT,
  LS_ROWS,
  LENGTH_MODES,
  usd,
  parseLengthFeet,
  readLS,
  writeLS,
  readRows,
  parsePositiveRate,
  buildTakeoffCsv,
  resolveCurrentLbPerFt,
  buildShapeLabel,
  tryCalculateWeight,
  sumRunningWeight,
  appendRunningTotalRow,
  removeRunningTotalById,
} from "./steelWeightCalculator/steelWeightCalculatorHelpers";
import {
  mono,
  body,
  cardStyle,
  inputStyle,
  selectStyle,
  labelStyle,
  ResultRow,
  tdLeft,
  tdRight,
} from "./steelWeightCalculator/SteelWeightCalculatorUi";

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

  // Cost — rate + unit, rehydrated from localStorage.
  const [rate, setRate] = useState(() => readLS(LS_RATE, ""));
  const [costUnit, setCostUnit] = useState(() => {
    const saved = readLS(LS_UNIT, COST_UNITS[0]);
    return COST_UNITS.includes(saved) ? saved : COST_UNITS[0];
  });

  // Results state — populated on Calculate, cleared when inputs change.
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Running-total list for the session, rehydrated from localStorage.
  const [runningTotal, setRunningTotal] = useState(() => readRows());

  // ── Persistence side-effects ───────────────────────────────────
  useEffect(() => { writeLS(LS_RATE, rate); }, [rate]);
  useEffect(() => { writeLS(LS_UNIT, costUnit); }, [costUnit]);
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_ROWS, JSON.stringify(runningTotal));
    } catch {
      /* quota / private-mode — ignore */
    }
  }, [runningTotal]);

  const rateNum = useMemo(() => parsePositiveRate(rate), [rate]);

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
  const shapeDims = {
    family, designation,
    plateThickness, plateWidth,
    roundDiameter, squareSide,
    flatThickness, flatWidth,
  };
  const currentLbPerFt = useMemo(
    () => resolveCurrentLbPerFt(shapeDims),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [family, designation, plateThickness, plateWidth, roundDiameter, squareSide, flatThickness, flatWidth],
  );

  const currentShapeLabel = useMemo(
    () => buildShapeLabel(shapeDims),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [family, designation, plateThickness, plateWidth, roundDiameter, squareSide, flatThickness, flatWidth],
  );

  // ── Calculate ──────────────────────────────────────────────────
  const handleCalculate = () => {
    setError(null);
    setResult(null);
    const outcome = tryCalculateWeight({
      lbPerFt: currentLbPerFt,
      lengthRaw,
      lengthMode,
      qty,
      shapeLabel: currentShapeLabel,
      rateNum,
      costUnit,
    });
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setResult(outcome.result);
  };

  const handleAddToRunningTotal = () => {
    if (!result) return;
    setRunningTotal((prev) => appendRunningTotalRow(prev, result));
    toast.success("Added to running total");
  };

  const removeFromRunningTotal = (id) =>
    setRunningTotal((prev) => removeRunningTotalById(prev, id));

  const clearRunningTotal = () => {
    setRunningTotal([]);
  };

  const grandTotal = useMemo(
    () => sumRunningWeight(runningTotal),
    [runningTotal]
  );

  const grandCost = useMemo(
    () => rollupCost(runningTotal),
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

  // Build a CSV takeoff of every running-total row + copy to clipboard.
  // Columns: shape, qty, length, lb_per_ft, weight_lb, cost.
  const copyTakeoffCsv = async () => {
    if (!runningTotal.length) return;
    const csv = buildTakeoffCsv(runningTotal);
    try {
      await navigator.clipboard.writeText(csv);
      toast.success("Takeoff copied (CSV)");
    } catch {
      toast.error("Copy failed");
    }
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="sb-dashboard-reference-page" style={{ padding: 24, background: "var(--bg-page)", minHeight: "calc(100vh - 92px)" }}>
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

              {/* Row 5: Cost rate + unit toggle */}
              <div>
                <label style={labelStyle}>Material Rate (optional)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ position: "relative", flex: "0 0 160px", maxWidth: 160 }}>
                    <span style={{
                      ...mono, position: "absolute", left: 12, top: "50%",
                      transform: "translateY(-50%)", fontSize: 13,
                      color: "var(--text-muted)", pointerEvents: "none",
                    }}>$</span>
                    <input
                      style={{ ...inputStyle, paddingLeft: 22 }}
                      inputMode="decimal"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      placeholder="0.85"
                      aria-label="Material rate"
                    />
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {COST_UNITS.map((u) => (
                      <button
                        key={u}
                        onClick={() => setCostUnit(u)}
                        aria-pressed={costUnit === u}
                        style={{
                          ...mono,
                          fontSize: 9, fontWeight: 700,
                          letterSpacing: "0.06em",
                          padding: "6px 10px",
                          borderRadius: 4,
                          cursor: "pointer",
                          background: costUnit === u ? "var(--accent)" : "var(--bg-surface-low)",
                          color:      costUnit === u ? "var(--accent-text)" : "var(--text-secondary)",
                          border: `1px solid ${costUnit === u ? "var(--accent)" : "var(--border-default)"}`,
                        }}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
                  Persisted locally. /cwt = per 100 lb · /ton = per 2000 lb.
                </div>
              </div>

              {/* Action keys — reskinned to tactile keycaps (CalcKey). */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 150 }}>
                  <CalcKey
                    label="Calculate"
                    variant="accent"
                    onPress={handleCalculate}
                    ariaLabel="Calculate weight"
                  />
                </div>
                {result && (
                  <div style={{ minWidth: 200 }}>
                    <CalcKey
                      label="+ Add to Running Total"
                      variant="op"
                      onPress={handleAddToRunningTotal}
                      ariaLabel="Add to running total"
                    />
                  </div>
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

                  {/* LCD-style headline value — click to copy total lbs. */}
                  <div style={{ marginBottom: 14 }}>
                    <CalcDisplay
                      value={`${result.totalWeight.toFixed(2)} lb`}
                      aux={`${result.totalTons.toFixed(3)} T · ${result.qty} pc`}
                      onCopy={copyGrandTotal}
                    />
                  </div>

                  <ResultRow label="lb/ft (reference)"    value={`${result.lbPerFt.toFixed(3)} lb/ft`} />
                  <ResultRow label="Length"               value={result.lengthDisplay} />
                  <ResultRow label="Quantity"             value={`${result.qty}`} />
                  <div style={{ height: 1, background: "var(--divider)", margin: "12px 0" }} />
                  <ResultRow label="Weight per piece"     value={`${result.pieceWeight.toFixed(2)} lb`} emphasize />
                  <ResultRow label="Total weight"         value={`${result.totalWeight.toFixed(2)} lb`} emphasize />
                  <ResultRow label="Total weight (tons)"  value={`${result.totalTons.toFixed(3)} T`} emphasize highlight />
                  {rateNum > 0 && (
                    <>
                      <div style={{ height: 1, background: "var(--divider)", margin: "12px 0" }} />
                      <ResultRow
                        label={`Piece cost @ $${rateNum}${costUnit}`}
                        value={usd.format(result.cost)}
                        emphasize highlight
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── RUNNING TOTAL ──────────────────────────────────────── */}
        <div className="sbd-card" style={{ ...cardStyle, marginTop: 20 }}>
          <div style={{
            padding: "14px 18px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
          }}>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Running Total ({runningTotal.length})
            </div>
            {runningTotal.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={copyTakeoffCsv}
                  style={{
                    ...mono, fontSize: 9, fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 4,
                    background: "var(--bg-surface)",
                    color: "var(--accent)",
                    border: "1px solid var(--accent)",
                    cursor: "pointer",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Copy takeoff (CSV)
                </button>
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
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr>
                    {["Shape", "Qty", "Length", "Piece (lb)", "Total (lb)", "Cost", ""].map((h, i) => (
                      <th key={i} style={{
                        ...mono,
                        fontSize: 8, fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        textAlign: i === 0 ? "left" : "right",
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
                      <td style={tdRight}>
                        {Number(r.cost) > 0 ? usd.format(Number(r.cost)) : "—"}
                      </td>
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
                      ...mono, fontSize: 12, fontWeight: 800,
                      color: grandCost > 0 ? "var(--accent)" : "var(--text-muted)",
                      padding: "12px",
                      borderTop: "2px solid var(--border-default)",
                      textAlign: "right",
                    }}>
                      {grandCost > 0 ? usd.format(grandCost) : "—"}
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
