/**
 * CranePickCalculator.jsx
 *
 * PM / field tool for pre-lift planning on structural-steel picks.
 * Computes total hook load, per-leg sling tension, LAF, and capacity
 * utilization for a symmetric rigging configuration. Exposes a
 * printable / copy-pasteable "Pick Summary" for lift plans and JHAs.
 *
 * This is a planning / cross-check tool — NOT a substitute for an
 * engineered lift plan. The disclaimer is displayed on the page AND
 * embedded in the exported Pick Summary so it survives copy-paste.
 *
 * Math lives in src/utils/riggingCalculations.js.
 */

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  calculateTotalLoad,
  calculateSlingTension,
  calculateLAF,
  calculateUtilization,
  getCapacityStatus,
  getAngleStatus,
  angleFromHeightSpan,
  buildWarnings,
} from "@/utils/riggingCalculations";
import CalcKey from "@/components/calculators/CalcKey";
import CalcTape from "@/components/calculators/CalcTape";
import useCalcTape from "@/components/calculators/useCalcTape";
import "@/components/calculators/calc.css";

// Persisted Pick-History tape key (device-kit history, NOT part of the math).
const PICK_TAPE_KEY = "crane-pick-history";

const mono = { fontFamily: "var(--font-mono)" };
const body = { fontFamily: "var(--font-body)" };

// ── Shared style tokens (mirrors the other PM tool pages) ──────────
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

// Status pill colors — reuse the bright tier we introduced in the
// palette-unification pass. RED pulls extra weight so users don't miss
// critical-lift warnings on a tablet in bright sunlight.
const STATUS_COLOR = {
  green:  "var(--status-success-bright)",
  yellow: "var(--status-warning-bright)",
  red:    "var(--status-error-bright)",
};
const STATUS_LABEL = {
  green:  "OK",
  yellow: "CAUTION",
  red:    "CRITICAL",
};

// Angle entry modes — users either type degrees directly or measure
// H / S with a tape in the field.
const ANGLE_MODES = {
  DEGREES:     "degrees",
  HEIGHT_SPAN: "height-span",
};

// Quick-pick angle buttons (nice-to-have from spec).
const ANGLE_PRESETS = [30, 45, 60, 90];

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
  const piece   = parseFloat(pieceWeight);
  const rigging = parseFloat(riggingWeight || "0");
  const cap     = parseFloat(craneCapacity);

  const effectiveAngle = useMemo(() => {
    if (numLegs === 1) return 90; // vertical pick — angle is irrelevant
    if (angleMode === ANGLE_MODES.HEIGHT_SPAN) {
      return angleFromHeightSpan(parseFloat(hspanH), parseFloat(hspanS));
    }
    return parseFloat(angleDeg);
  }, [angleMode, angleDeg, hspanH, hspanS, numLegs]);

  const totalLoad = useMemo(
    () => calculateTotalLoad(piece, rigging),
    [piece, rigging]
  );
  const laf = useMemo(
    () => (numLegs === 1 ? 1 : calculateLAF(effectiveAngle)),
    [numLegs, effectiveAngle]
  );
  const tensionPerLeg = useMemo(
    () => calculateSlingTension(totalLoad, numLegs, effectiveAngle),
    [totalLoad, numLegs, effectiveAngle]
  );
  const utilization = useMemo(
    () => calculateUtilization(totalLoad, cap),
    [totalLoad, cap]
  );
  const capacityStatus = getCapacityStatus(utilization);
  // Single-leg vertical picks don't have a meaningful sling-angle risk
  // (nothing to splay), so suppress the angle status for that case.
  const angleStatus = numLegs === 1 ? null : getAngleStatus(effectiveAngle);

  // ── Input validation ───────────────────────────────────────
  // Collect every failure upfront so the user sees a single "fix
  // these" list rather than whack-a-mole errors as fields clear.
  const errors = useMemo(() => {
    const e = [];
    if (pieceWeight === "") {
      e.push("Enter piece weight.");
    } else if (!(piece > 0)) {
      e.push("Piece weight must be a positive number.");
    }
    if (rigging < 0) e.push("Rigging weight cannot be negative.");
    if (craneCapacity === "") {
      e.push("Enter the crane's rated capacity at the planned radius.");
    } else if (!(cap > 0)) {
      e.push("Crane capacity must be a positive number.");
    }
    if (numLegs !== 1) {
      if (!(effectiveAngle > 0 && effectiveAngle <= 90)) {
        e.push("Sling angle must be > 0° and ≤ 90°.");
      }
    }
    return e;
  }, [pieceWeight, piece, rigging, craneCapacity, cap, numLegs, effectiveAngle]);

  const hasValidResults = errors.length === 0
    && Number.isFinite(totalLoad)
    && Number.isFinite(tensionPerLeg)
    && Number.isFinite(utilization);

  const warnings = useMemo(
    () => (hasValidResults ? buildWarnings({
      angleStatus,
      capacityStatus,
      angleDegrees: effectiveAngle,
      utilizationPercent: utilization,
    }) : []),
    [hasValidResults, angleStatus, capacityStatus, effectiveAngle, utilization]
  );

  // ── Actions ────────────────────────────────────────────────
  const clearAll = () => {
    setPieceWeight(""); setRiggingWeight("0");
    setNumLegs(2);
    setAngleMode(ANGLE_MODES.DEGREES);
    setAngleDeg("60"); setHspanH(""); setHspanS("");
    setCraneCapacity("");
    setCraneModel(""); setBoomLength(""); setWorkingRadius(""); setCounterweight("");
  };

  // Build a self-contained snapshot of the current pick for the summary modal
  // AND the Pick-History tape. Pure data — derives nothing new from the math.
  const buildSnapshot = () => ({
    pieceWeight: piece, riggingWeight: rigging, totalLoad,
    numLegs, angleDegrees: effectiveAngle, laf, tensionPerLeg,
    craneCapacity: cap, utilization,
    capacityStatus, angleStatus, warnings,
    craneModel, boomLength, workingRadius, counterweight,
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
    <div style={{ padding: 24, background: "var(--bg-page)", minHeight: "calc(100vh - 92px)" }}>
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
          <span style={{ ...mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "#22D3EE", marginRight: 6 }}>
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
              {/* Future hook — saving a pick into the active project.
                  Wired as disabled for now so the affordance is discoverable.
                  v2: Supabase `lift_plans` table keyed on project_id. */}
              <button
                onClick={() => toast.info("Saving picks to a project is coming soon.")}
                style={keycapButtonStyle("stub")}
                title="Future: save this pick to the active project's lift plan"
              >
                Save to Project (soon)
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
function PickSummaryModal({ onClose, data }) {
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText(data));
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const doPrint = () => {
    window.print();
  };

  return (
    <div
      className="pick-summary-print-root"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick Summary"
      style={{
        position: "fixed", inset: 0,
        background: "rgba(7,9,14,0.78)", backdropFilter: "blur(4px)",
        zIndex: 1200, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 16,
      }}
    >
      <div
        className="pick-summary-print-area"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)", maxHeight: "90vh",
          background: "var(--bg-surface)", color: "var(--text-primary)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10, overflow: "hidden", display: "flex",
          flexDirection: "column", boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid var(--divider)",
          background: "var(--bg-surface-low)",
        }}>
          <div>
            <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 16, fontWeight: 800, letterSpacing: "0.04em" }}>
              Pick Summary
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 2 }}>
              {new Date().toLocaleString()}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: "transparent", border: "none", color: "var(--text-muted)",
            fontSize: 20, lineHeight: 1, cursor: "pointer", padding: 4,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {/* Disclaimer at top — follows copy-paste */}
          <div style={{
            ...body, fontSize: 12,
            color: "var(--text-primary)",
            background: "rgba(34,211,238,0.08)",
            border: "1px solid rgba(34,211,238,0.35)",
            padding: "8px 12px", borderRadius: 4, marginBottom: 14,
          }}>
            <strong style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", color: "#22D3EE" }}>PLANNING TOOL ONLY —</strong>
            {" "}Does not replace an engineered lift plan. Verify all values against the crane load chart and rigging capacity ratings.
          </div>

          <SummarySection title="Load">
            <SummaryRow k="Piece Weight"       v={lbOrDash(data.pieceWeight)} />
            <SummaryRow k="Rigging Weight"     v={lbOrDash(data.riggingWeight)} />
            <SummaryRow k="Total Load on Hook" v={`${lbOrDash(data.totalLoad)} (${tonsOrDash(data.totalLoad)})`} bold />
          </SummarySection>

          <SummarySection title="Rigging Configuration">
            <SummaryRow k="Number of Legs" v={String(data.numLegs)} />
            <SummaryRow k="Sling Angle"    v={data.numLegs === 1 ? "Single vertical pick" : `${data.angleDegrees.toFixed(1)}°`} />
            <SummaryRow k="Load Angle Factor (LAF)" v={Number.isFinite(data.laf) ? data.laf.toFixed(3) : "—"} />
            <SummaryRow k={data.numLegs === 1 ? "Tension (single leg)" : "Tension per Leg"} v={`${lbOrDash(data.tensionPerLeg)} (${tonsOrDash(data.tensionPerLeg)})`} bold />
          </SummarySection>

          <SummarySection title="Capacity">
            <SummaryRow k="Rated Crane Capacity" v={lbOrDash(data.craneCapacity)} />
            <SummaryRow
              k="Utilization"
              v={`${data.utilization.toFixed(1)}% (${(STATUS_LABEL[data.capacityStatus] || "—")})`}
              bold
            />
          </SummarySection>

          {(data.craneModel || data.boomLength || data.workingRadius || data.counterweight) && (
            <SummarySection title="Reference">
              {data.craneModel     && <SummaryRow k="Make / Model"     v={data.craneModel} />}
              {data.boomLength     && <SummaryRow k="Boom Length"      v={`${data.boomLength} ft`} />}
              {data.workingRadius  && <SummaryRow k="Working Radius"   v={`${data.workingRadius} ft`} />}
              {data.counterweight  && <SummaryRow k="Counterweight"    v={data.counterweight} />}
            </SummarySection>
          )}

          {data.warnings.length > 0 && (
            <SummarySection title="Warnings">
              {data.warnings.map((w, i) => (
                <div key={i} style={{
                  ...body, fontSize: 12,
                  color: STATUS_COLOR[w.severity] || "var(--text-primary)",
                  marginBottom: 6,
                  paddingLeft: 10,
                  borderLeft: `3px solid ${STATUS_COLOR[w.severity]}`,
                }}>
                  {w.message}
                </div>
              ))}
            </SummarySection>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          display: "flex", gap: 8, padding: "12px 20px",
          borderTop: "1px solid var(--divider)", background: "var(--bg-surface-low)",
          justifyContent: "flex-end",
        }}>
          <button onClick={onClose}    style={keycapButtonStyle("ghost", { compact: true })}>Close</button>
          <button onClick={copySummary} style={keycapButtonStyle("ghost", { compact: true })}>Copy</button>
          <button onClick={doPrint}     style={keycapButtonStyle("accent", { compact: true })}>Print</button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────
function lbOrDash(n) {
  if (!Number.isFinite(Number(n))) return "—";
  return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`;
}
function tonsOrDash(n) {
  if (!Number.isFinite(Number(n))) return "—";
  return `${(Number(n) / 2000).toFixed(3)} T`;
}

function buildSummaryText(d) {
  const lines = [];
  lines.push("PICK SUMMARY — PLANNING TOOL ONLY");
  lines.push("Does not replace an engineered lift plan.");
  lines.push(new Date().toLocaleString());
  lines.push("");
  lines.push("LOAD");
  lines.push(`  Piece Weight:        ${lbOrDash(d.pieceWeight)}`);
  lines.push(`  Rigging Weight:      ${lbOrDash(d.riggingWeight)}`);
  lines.push(`  Total Load on Hook:  ${lbOrDash(d.totalLoad)}  (${tonsOrDash(d.totalLoad)})`);
  lines.push("");
  lines.push("RIGGING");
  lines.push(`  Number of Legs:      ${d.numLegs}`);
  if (d.numLegs === 1) {
    lines.push(`  Sling Angle:         Single vertical pick`);
  } else {
    lines.push(`  Sling Angle:         ${Number(d.angleDegrees).toFixed(1)}°`);
  }
  lines.push(`  Load Angle Factor:   ${Number.isFinite(d.laf) ? d.laf.toFixed(3) : "—"}`);
  lines.push(`  Tension per Leg:     ${lbOrDash(d.tensionPerLeg)}  (${tonsOrDash(d.tensionPerLeg)})`);
  lines.push("");
  lines.push("CAPACITY");
  lines.push(`  Rated Capacity:      ${lbOrDash(d.craneCapacity)}`);
  lines.push(`  Utilization:         ${Number(d.utilization).toFixed(1)}%  (${STATUS_LABEL[d.capacityStatus] || "—"})`);
  if (d.craneModel || d.boomLength || d.workingRadius || d.counterweight) {
    lines.push("");
    lines.push("REFERENCE");
    if (d.craneModel)    lines.push(`  Make / Model:        ${d.craneModel}`);
    if (d.boomLength)    lines.push(`  Boom Length:         ${d.boomLength} ft`);
    if (d.workingRadius) lines.push(`  Working Radius:      ${d.workingRadius} ft`);
    if (d.counterweight) lines.push(`  Counterweight:       ${d.counterweight}`);
  }
  if (d.warnings?.length) {
    lines.push("");
    lines.push("WARNINGS");
    d.warnings.forEach((w) => lines.push(`  [${w.severity.toUpperCase()}] ${w.message}`));
  }
  return lines.join("\n");
}

/**
 * keycapButtonStyle — tactile "keycap" chrome for the page's action / toggle
 * buttons so they read as part of the SteelBuild calculator device kit. This
 * is presentation only; it changes NO rigging math or workflow behavior.
 *
 *   variant — "accent" | "danger" | "ghost" | "stub" | false (neutral)
 *   opts    — { disabled, compact, fullWidth }
 */
function keycapButtonStyle(variant, opts = {}) {
  const { disabled = false, compact = false } = opts;
  const base = {
    ...mono,
    fontSize: compact ? 10 : 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: compact ? "8px 16px" : "10px 18px",
    minHeight: compact ? 38 : 44,
    borderRadius: 10,
    cursor: disabled ? "not-allowed" : "pointer",
    // Subtle keycap relief — matches the .sbd-calc-key shadow language.
    boxShadow: "0 1px 0 var(--border-strong), inset 0 1px 0 rgba(255,255,255,0.04)",
    transition: "transform 0.04s, background 0.12s",
  };

  if (variant === "accent") {
    return {
      ...base,
      background: "var(--accent)",
      color: "var(--accent-text, #04121f)",
      border: "1px solid var(--accent)",
      opacity: disabled ? 0.55 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    };
  }
  if (variant === "danger") {
    return {
      ...base,
      background: "var(--bg-surface)",
      color: "var(--status-error)",
      border: "1px solid var(--danger-border, var(--status-error))",
    };
  }
  if (variant === "stub") {
    // Disabled-affordance stub (Save to Project) — dashed, muted, discoverable.
    return {
      ...base,
      background: "transparent",
      color: "var(--text-muted)",
      border: "1px dashed var(--border-default)",
      boxShadow: "none",
    };
  }
  // "ghost" / neutral — quiet keycap.
  return {
    ...base,
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-strong)",
  };
}

/**
 * pickTapeExpr — compact one-line description of a pick for the history tape.
 * Presentation only; reads the snapshot, derives no new engineering values.
 */
function pickTapeExpr(s) {
  const tons = Number.isFinite(s.totalLoad) ? `${(s.totalLoad / 2000).toFixed(1)}T` : "—";
  const angle = s.numLegs === 1
    ? "vert"
    : (Number.isFinite(s.angleDegrees) ? `${s.angleDegrees.toFixed(0)}°` : "—");
  return `${tons} · ${s.numLegs}-leg · ${angle}`;
}

// ── Sub-components ────────────────────────────────────────────────
function SectionHeader({ n, label }) {
  return (
    <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-low)", display: "flex", alignItems: "center", gap: 10 }}>
      {/* Keycap-style step badge — ties the section card to the device kit. */}
      <span style={{
        ...mono, fontSize: 9, fontWeight: 800, color: "var(--accent)",
        letterSpacing: "0.10em",
        minWidth: 22, height: 22, display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        borderRadius: 6, border: "1px solid var(--accent)",
        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
        boxShadow: "0 1px 0 var(--border-strong), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>{String(n).padStart(2, "0")}</span>
      <span style={{
        ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)",
        letterSpacing: "0.14em", textTransform: "uppercase",
      }}>{label}</span>
    </div>
  );
}

function ResultRow({ label, primary, secondary }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, gap: 10 }}>
      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ textAlign: "right" }}>
        <span style={{ ...mono, fontSize: 14, fontWeight: 800, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
          {primary}
        </span>
        {secondary && (
          <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>{secondary}</span>
        )}
      </span>
    </div>
  );
}

function StatusPill({ status }) {
  const c = STATUS_COLOR[status] || "var(--text-muted)";
  return (
    <span style={{
      ...mono, fontSize: 8, fontWeight: 800, letterSpacing: "0.14em",
      padding: "2px 6px", borderRadius: 3,
      color: c, border: `1px solid ${c}`,
      background: `color-mix(in srgb, ${c} 14%, transparent)`,
      textTransform: "uppercase",
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function WarningRow({ severity, message }) {
  const c = STATUS_COLOR[severity] || "var(--text-primary)";
  return (
    <div style={{
      ...body, fontSize: 11, lineHeight: 1.45,
      color: "var(--text-primary)",
      background: `color-mix(in srgb, ${c} 10%, transparent)`,
      border: `1px solid ${c}`,
      borderLeft: `4px solid ${c}`,
      padding: "8px 10px",
      borderRadius: 4,
    }}>
      <span style={{ ...mono, fontSize: 8, fontWeight: 800, letterSpacing: "0.14em", color: c, marginRight: 6 }}>
        {STATUS_LABEL[severity]}
      </span>
      {message}
    </div>
  );
}

function SummarySection({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...mono, fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SummaryRow({ k, v, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
      <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{k}</span>
      <span style={{
        ...mono, fontSize: bold ? 12 : 11, fontWeight: bold ? 800 : 500,
        color: "var(--text-primary)", fontVariantNumeric: "tabular-nums",
      }}>
        {v}
      </span>
    </div>
  );
}
