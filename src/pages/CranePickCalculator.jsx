/**
 * CranePickCalculator.jsx
 *
 * PM / field tool for pre-lift planning on structural-steel picks.
 * Math lives in src/utils/riggingCalculations.js.
 * Helpers/UI → src/pages/cranePickCalculator/
 */

import React, { useMemo, useState } from "react";
import CalcKey from "@/components/calculators/CalcKey";
import CalcTape from "@/components/calculators/CalcTape";
import useCalcTape from "@/components/calculators/useCalcTape";
import "@/components/calculators/calc.css";
import {
  pickTapeExpr,
  keycapButtonStyle,
  buildPickSnapshot,
  buildCranePickDerived,
  createEmptyCranePickForm,
} from "./cranePickCalculator/cranePickCalculatorHelpers";
import {
  PICK_TAPE_KEY,
  mono,
  body,
  cardStyle,
  inputStyle,
  selectStyle,
  labelStyle,
  STATUS_COLOR,
  ANGLE_MODES,
  ANGLE_PRESETS,
  PickSummaryModal,
  SectionHeader,
  ResultRow,
  StatusPill,
  WarningRow,
} from "./cranePickCalculator/CranePickCalculatorUi";

export default function CranePickCalculator() {
  // ── Inputs ──────────────────────────────────────────────────
  const [pieceWeight, setPieceWeight]     = useState("");
  const [riggingWeight, setRiggingWeight] = useState("0");
  const [numLegs, setNumLegs]             = useState(2);
  const [angleMode, setAngleMode]         = useState(ANGLE_MODES.DEGREES);
  const [angleDeg, setAngleDeg]           = useState("60");
  const [hspanH, setHspanH]               = useState("");
  const [hspanS, setHspanS]               = useState("");
  const [craneCapacity, setCraneCapacity] = useState("");
  const [refOpen, setRefOpen]             = useState(false);
  const [craneModel, setCraneModel]       = useState("");
  const [boomLength, setBoomLength]       = useState("");
  const [workingRadius, setWorkingRadius] = useState("");
  const [counterweight, setCounterweight] = useState("");
  // The summary modal renders a SNAPSHOT (`summaryData`) rather than reading
  // live state directly, so a Pick-History recall can re-open a past pick.
  const [summaryData, setSummaryData]     = useState(null);
  const summaryOpen = summaryData !== null;

  // ── Pick History (device-kit tape — persisted, NOT part of the math) ──
  const pickTape = useCalcTape(PICK_TAPE_KEY, 30);

  // ── Derived values (live, no Calculate button) ──────────────
  // Parse all inputs once — downstream computations propagate NaN for
  // anything that isn't a valid positive number, which lets the UI
  // gate results off of Number.isFinite checks rather than try/catch.
  const derived = useMemo(
    () =>
      buildCranePickDerived({
        pieceWeight,
        riggingWeight,
        numLegs,
        angleMode,
        angleDeg,
        hspanH,
        hspanS,
        craneCapacity,
        heightSpanMode: ANGLE_MODES.HEIGHT_SPAN,
      }),
    [pieceWeight, riggingWeight, numLegs, angleMode, angleDeg, hspanH, hspanS, craneCapacity],
  );

  const {
    piece,
    rigging,
    cap,
    effectiveAngle,
    totalLoad,
    laf,
    tensionPerLeg,
    utilization,
    capacityStatus,
    angleStatus,
    errors,
    hasValidResults,
    warnings,
  } = derived;

  // ── Actions ────────────────────────────────────────────────
  const clearAll = () => {
    const empty = createEmptyCranePickForm(ANGLE_MODES.DEGREES);
    setPieceWeight(empty.pieceWeight);
    setRiggingWeight(empty.riggingWeight);
    setNumLegs(empty.numLegs);
    setAngleMode(empty.angleMode);
    setAngleDeg(empty.angleDeg);
    setHspanH(empty.hspanH);
    setHspanS(empty.hspanS);
    setCraneCapacity(empty.craneCapacity);
    setCraneModel(empty.craneModel);
    setBoomLength(empty.boomLength);
    setWorkingRadius(empty.workingRadius);
    setCounterweight(empty.counterweight);
  };

  // Build a self-contained snapshot of the current pick for the summary modal
  // AND the Pick-History tape. Pure data — derives nothing new from the math.
  const buildSnapshot = () =>
    buildPickSnapshot({
      piece,
      rigging,
      totalLoad,
      numLegs,
      effectiveAngle,
      laf,
      tensionPerLeg,
      cap,
      utilization,
      capacityStatus,
      angleStatus,
      craneModel,
      boomLength,
      workingRadius,
      counterweight,
      warnings,
    });

  // Generate Pick Summary — open the modal AND record the pick on the
  // persisted history tape so a planner can recall earlier picks.
  const openSummary = () => {
    if (!hasValidResults) return;
    const snapshot = buildSnapshot();
    setSummaryData(snapshot);
    pickTape.push({
      expr: pickTapeExpr(snapshot),
      value: `${snapshot.utilization.toFixed(0)}%`,
      snapshot,
    });
  };

  // Recall a historical pick — re-open the summary modal from its stored
  // snapshot. Does not mutate the live inputs (read-only review).
  const recallPick = (row) => {
    if (row && row.snapshot) setSummaryData(row.snapshot);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="sb-dashboard-reference-page" style={{ padding: 24, background: "var(--bg-page)", minHeight: "calc(100vh - 92px)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontFamily: "Space Grotesk, var(--font-display)",
            fontSize: 22, fontWeight: 800, textTransform: "uppercase",
            letterSpacing: "-0.01em", color: "var(--text-primary)",
          }}>
            Crane Pick Calculator
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 4 }}>
            Symmetric picks · lb → tension · LAF · capacity utilization · ASME B30.9 / OSHA 1926.1400
          </div>
        </div>

        {/* Disclaimer banner */}
        <div style={{
          marginBottom: 14,
          padding: "10px 14px",
          borderRadius: 6,
          background: "rgba(34,211,238,0.08)",
          border: "1px solid rgba(34,211,238,0.35)",
          color: "var(--text-primary)",
          ...body,
          fontSize: 12,
          lineHeight: 1.5,
        }}>
          <span style={{ ...mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "var(--status-info)", marginRight: 6 }}>
            PLANNING TOOL ONLY
          </span>
          This calculator does not replace an engineered lift plan. Verify all values against the crane load chart and rigging capacity ratings before any pick.
        </div>

        {/* Grid: inputs (left) + results (right) */}
        <div className="crane-pick-grid" style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16, alignItems: "start",
        }}>

          {/* ── LEFT: inputs ─────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* SECTION 1 — Load Inputs */}
            <div style={cardStyle}>
              <SectionHeader n={1} label="Load Inputs" />
              <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Piece Weight (lb)</label>
                  <input style={inputStyle} inputMode="decimal" value={pieceWeight}
                    onChange={(e) => setPieceWeight(e.target.value)}
                    placeholder="e.g. 12,500" />
                </div>
                <div>
                  <label style={labelStyle}>Rigging Weight (lb)</label>
                  <input style={inputStyle} inputMode="decimal" value={riggingWeight}
                    onChange={(e) => setRiggingWeight(e.target.value)}
                    placeholder="0" />
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
                    Include slings, shackles, spreader, chokers, tag lines.
                  </div>
                </div>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-secondary)", background: "var(--bg-surface-low)", padding: "8px 10px", borderRadius: 4 }}>
                  Total Load on Hook:
                  <span style={{ color: "var(--accent)", fontWeight: 800, marginLeft: 8 }}>
                    {Number.isFinite(totalLoad) ? `${totalLoad.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb` : "—"}
                  </span>
                  <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                    {Number.isFinite(totalLoad) ? `(${(totalLoad / 2000).toFixed(3)} T)` : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* SECTION 2 — Rigging Config */}
            <div style={cardStyle}>
              <SectionHeader n={2} label="Rigging Configuration" />
              <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Number of Sling Legs</label>
                  <select style={selectStyle} value={numLegs}
                    onChange={(e) => setNumLegs(Number(e.target.value))}>
                    <option value={1}>1 (Single Vertical)</option>
                    <option value={2}>2 (Bridle)</option>
                    <option value={4}>4 (Four-Leg Bridle)</option>
                  </select>
                </div>

                {/* Angle inputs suppressed for single-leg vertical */}
                {numLegs !== 1 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ ...labelStyle, marginBottom: 0 }}>Sling Angle</span>
                      <div className="crane-pick-keyrow" style={{ display: "flex", gap: 4 }}>
                        {[
                          { key: ANGLE_MODES.DEGREES,     label: "DEG" },
                          { key: ANGLE_MODES.HEIGHT_SPAN, label: "H/S" },
                        ].map((m) => (
                          <CalcKey
                            key={m.key}
                            label={m.label}
                            variant={angleMode === m.key ? "accent" : "fn"}
                            onPress={() => setAngleMode(m.key)}
                            ariaLabel={m.key === ANGLE_MODES.DEGREES ? "Degrees angle mode" : "Height over span angle mode"}
                          />
                        ))}
                      </div>
                    </div>

                    {angleMode === ANGLE_MODES.DEGREES ? (
                      <>
                        <input style={inputStyle} inputMode="decimal" value={angleDeg}
                          onChange={(e) => setAngleDeg(e.target.value)}
                          placeholder="0 – 90" />
                        <div className="crane-pick-keyrow" style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {ANGLE_PRESETS.map((a) => (
                            <CalcKey
                              key={a}
                              label={`${a}°`}
                              variant={String(a) === String(angleDeg) ? "accent" : "op"}
                              onPress={() => setAngleDeg(String(a))}
                              ariaLabel={`Set sling angle to ${a} degrees`}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 8 }}>Height H (in)</label>
                          <input style={inputStyle} inputMode="decimal" value={hspanH}
                            onChange={(e) => setHspanH(e.target.value)}
                            placeholder="vertical drop" />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 8 }}>Half-span S (in)</label>
                          <input style={inputStyle} inputMode="decimal" value={hspanS}
                            onChange={(e) => setHspanS(e.target.value)}
                            placeholder="horizontal" />
                        </div>
                      </div>
                    )}

                    <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 8 }}>
                      Angle = {Number.isFinite(effectiveAngle) ? `${effectiveAngle.toFixed(1)}°` : "—"}
                      {" · "}
                      LAF = {Number.isFinite(laf) ? laf.toFixed(3) : "—"}
                      {angleStatus && (
                        <>
                          {" · "}
                          <StatusPill status={angleStatus} />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3 — Crane Capacity */}
            <div style={cardStyle}>
              <SectionHeader n={3} label="Crane Capacity" />
              <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Rated Capacity at Radius (lb)</label>
                  <input style={inputStyle} inputMode="decimal" value={craneCapacity}
                    onChange={(e) => setCraneCapacity(e.target.value)}
                    placeholder="e.g. 180,000" />
                  <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
                    From the crane's load chart at the planned working radius, boom configuration, and counterweight setup.
                  </div>
                </div>

                {/* Optional crane metadata — collapsible, not used in math */}
                <div>
                  <button
                    onClick={() => setRefOpen((v) => !v)}
                    style={keycapButtonStyle(false, { fullWidth: false })}
                  >
                    {refOpen ? "▾" : "▸"} Reference Details (metadata only)
                  </button>
                  {refOpen && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 8 }}>Crane Make / Model</label>
                        <input style={inputStyle} value={craneModel}
                          onChange={(e) => setCraneModel(e.target.value)}
                          placeholder="e.g. Grove GMK5150L" />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 8 }}>Boom Length (ft)</label>
                        <input style={inputStyle} inputMode="decimal" value={boomLength}
                          onChange={(e) => setBoomLength(e.target.value)} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 8 }}>Working Radius (ft)</label>
                        <input style={inputStyle} inputMode="decimal" value={workingRadius}
                          onChange={(e) => setWorkingRadius(e.target.value)} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, fontSize: 8 }}>Counterweight</label>
                        <input style={inputStyle} value={counterweight}
                          onChange={(e) => setCounterweight(e.target.value)}
                          placeholder="e.g. 53,000 lb" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: results ────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 14 }}>

            {/* RESULTS */}
            <div style={cardStyle}>
              <SectionHeader n={4} label="Results" />
              <div style={{ padding: "16px 18px" }}>
                {errors.length > 0 ? (
                  <div role="alert" style={{
                    ...mono, fontSize: 11, fontWeight: 600, color: "var(--status-review)",
                    background: "var(--status-review-muted, rgba(249,115,22,0.12))",
                    border: "1px solid var(--status-review-border, rgba(249,115,22,0.40))",
                    padding: "10px 12px", borderRadius: 6,
                  }}>
                    <div style={{ fontWeight: 800, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
                      ⚠ Complete the inputs
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, ...body, fontSize: 11, fontWeight: 500 }}>
                      {errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                ) : (
                  <>
                    <ResultRow label="Total Load on Hook"
                      primary={`${totalLoad.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`}
                      secondary={`${(totalLoad / 2000).toFixed(3)} T`} />
                    <ResultRow label={numLegs === 1 ? "Tension (single leg)" : `Tension per Leg (×${numLegs})`}
                      primary={`${tensionPerLeg.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`}
                      secondary={`${(tensionPerLeg / 2000).toFixed(3)} T`} />
                    <ResultRow label="Load Angle Factor (LAF)"
                      primary={Number.isFinite(laf) ? laf.toFixed(3) : "—"} />
                    <div style={{ height: 1, background: "var(--divider)", margin: "10px 0" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                        Capacity Utilization
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          ...mono, fontSize: 22, fontWeight: 800,
                          color: STATUS_COLOR[capacityStatus] || "var(--text-primary)",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {utilization.toFixed(1)}%
                        </span>
                        {capacityStatus && <StatusPill status={capacityStatus} />}
                      </span>
                    </div>
                    {/* Utilization bar */}
                    <div style={{ height: 6, background: "var(--bg-surface-low)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.min(100, Math.max(0, utilization))}%`,
                        height: "100%",
                        background: STATUS_COLOR[capacityStatus] || "var(--text-muted)",
                        transition: "width 0.15s",
                      }} />
                    </div>

                    {/* Warnings list */}
                    {warnings.length > 0 && (
                      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                        {warnings.map((w, i) => <WarningRow key={i} severity={w.severity} message={w.message} />)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* SECTION 5 — Actions (keycap-styled to match the device kit) */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={openSummary}
                disabled={!hasValidResults}
                style={keycapButtonStyle("accent", { disabled: !hasValidResults })}
              >
                Generate Pick Summary
              </button>
              <button
                onClick={clearAll}
                style={keycapButtonStyle("danger")}
              >
                Clear
              </button>
            </div>

            {/* Pick History — device-kit tape. Each generated Pick Summary is
                recorded here; click a row to re-open that pick's summary. */}
            <div>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                Pick History
              </div>
              <CalcTape
                rows={pickTape.rows}
                onRecall={recallPick}
                onClear={pickTape.clear}
              />
            </div>
          </div>
        </div>

        {/* Mobile: collapse the grid */}
        <style>{`
          @media (max-width: 820px) {
            .crane-pick-grid { grid-template-columns: 1fr !important; }
          }
          @media print {
            body > :not(.pick-summary-print-root),
            .pick-summary-print-root > :not(.pick-summary-print-area) { display: none !important; }
            .pick-summary-print-root { position: static !important; background: white !important; }
            .pick-summary-print-area { box-shadow: none !important; border: none !important; color: #000 !important; }
            .pick-summary-print-area * { color: #000 !important; }
          }
        `}</style>

        {/* Pick Summary modal — renders the captured snapshot (live or recalled) */}
        {summaryOpen && (
          <PickSummaryModal
            onClose={() => setSummaryData(null)}
            data={summaryData}
          />
        )}
      </div>
    </div>
  );
}

// ── Modal ──────────────────────────────────────────────────────────