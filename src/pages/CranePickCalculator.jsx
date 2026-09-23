/**
 * CranePickCalculator.jsx
 *
 * PM / field tool for pre-lift planning on structural-steel picks.
 * Computes gross hook load against the crane chart, per-leg sling tension
 * (symmetric or offset-CG), LAF, sling / shackle utilization against their
 * WLLs, boom angle and tip height, and crane capacity utilization. Draws the
 * pick in 3D and exposes a printable / copy-pasteable "Pick Summary" for lift
 * plans and JHAs.
 *
 * This is a planning / cross-check tool — NOT a substitute for an
 * engineered lift plan. The disclaimer is displayed on the page AND
 * embedded in the exported Pick Summary so it survives copy-paste.
 *
 * Math lives in src/utils/riggingCalculations.js (symmetric sling math) and
 * src/utils/cranePickMath.ts (parsing, gross load, offset CG, WLL checks,
 * boom geometry). The 3D view is presentation only.
 */

import React, { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  calculateSlingTension,
  loadBearingLegs,
  calculateLAF,
  calculateUtilization,
  getAngleStatus,
  angleFromHeightSpan,
  buildWarnings,
} from "@/utils/riggingCalculations";
import {
  parseNumericInput,
  isBlankInput,
  grossLoadForChart,
  angleFromSlingLength,
  fourLegHorizontalReach,
  offsetTwoLegBridle,
  wllUtilization,
  getRiggingStatus,
  boomGeometry,
  getCapacityStatusForLift,
  buildExtendedWarnings,
} from "@/utils/cranePickMath";
import { ILLUSTRATIVE_BOOM_FT, ILLUSTRATIVE_RADIUS_FT } from "@/components/calculators/cranePickScene";
import { lazyWithRetry } from "@/lib/lazyRetry";
import CalcKey from "@/components/calculators/CalcKey";
import CalcTape from "@/components/calculators/CalcTape";
import useCalcTape from "@/components/calculators/useCalcTape";
import "@/components/calculators/calc.css";
import { lookupRatedCapacity } from "@/lib/crane/loadChart";
import { configurationSummary, craneDisplayName } from "@/lib/crane/craneLibrary";
import useCraneLibrary from "@/components/calculators/useCraneLibrary";
import CraneChartSource from "@/components/calculators/CraneChartSource";
import CraneLibraryPanel from "@/components/calculators/CraneLibraryPanel";
import GroundBearingPanel from "@/components/calculators/GroundBearingPanel";

// Three.js is ~600 KB — keep it out of the calculator chunk until the 3D view renders.
const CranePick3D = lazyWithRetry(() => import("@/components/calculators/CranePick3D"));

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
const hintStyle = { ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.45 };

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

// Angle entry modes — degrees from a protractor / angle finder, height over
// horizontal reach measured with a tape, or sling length (from the tag) and
// height.
const ANGLE_MODES = {
  DEGREES:     "degrees",
  HEIGHT_SPAN: "height-span",
  SLING:       "sling-length",
};

// Centre-of-gravity position for a 2-leg bridle.
const CG_MODES = { CENTERED: "centered", OFFSET: "offset" };

const LIFT_TYPES = { STANDARD: "standard", PERSONNEL: "personnel" };

// Where the rated capacity comes from: read off a load chart in the crane
// library, or typed by hand from the chart book (the original behaviour).
const CAP_SOURCES = { CHART: "chart", MANUAL: "manual" };

// Quick-pick angle buttons (nice-to-have from spec).
const ANGLE_PRESETS = [30, 45, 60, 90];

// Sling length assumed for the 3D drawing when the angle is typed in degrees
// (the angle alone doesn't fix the rigging's size). Drawing only.
const DRAW_SLING_FT = 16;

/**
 * A numeric field's state: blank, invalid text, or a number. Blank and invalid
 * are different — "12k" is a typo to report, "" is just not entered yet.
 */
function readField(raw) {
  if (isBlankInput(raw)) return { blank: true, value: NaN, invalid: false };
  const value = parseNumericInput(raw);
  return { blank: false, value, invalid: !Number.isFinite(value) };
}

const NOT_A_NUMBER = "isn't a number — use digits only (commas are allowed as thousands separators, e.g. 12,500).";

export default function CranePickCalculator() {
  // ── Inputs ──────────────────────────────────────────────────
  const [pieceWeight, setPieceWeight]     = useState("");
  const [riggingWeight, setRiggingWeight] = useState("0");
  const [hookBlock, setHookBlock]         = useState("");
  const [otherDeduct, setOtherDeduct]     = useState("");
  const [numLegs, setNumLegs]             = useState(2);
  const [cgMode, setCgMode]               = useState(CG_MODES.CENTERED);
  const [angleMode, setAngleMode]         = useState(ANGLE_MODES.DEGREES);
  const [angleDeg, setAngleDeg]           = useState("60");
  const [hspanH, setHspanH]               = useState("");
  const [hspanS, setHspanS]               = useState("");
  const [hspanW, setHspanW]               = useState("");
  const [slingLen, setSlingLen]           = useState("");
  const [slingH, setSlingH]               = useState("");
  const [offH, setOffH]                   = useState("");
  const [offD1, setOffD1]                 = useState("");
  const [offD2, setOffD2]                 = useState("");
  const [slingWll, setSlingWll]           = useState("");
  const [shackleWll, setShackleWll]       = useState("");
  const [liftType, setLiftType]           = useState(LIFT_TYPES.STANDARD);
  const [craneCapacity, setCraneCapacity] = useState("");
  const [boomLength, setBoomLength]       = useState("");
  const [workingRadius, setWorkingRadius] = useState("");
  const [refOpen, setRefOpen]             = useState(false);
  const [craneModel, setCraneModel]       = useState("");
  const [counterweight, setCounterweight] = useState("");
  const [show3d, setShow3d]               = useState(true);

  // ── Crane library (fleet + load charts, persisted on this device) ──
  const library = useCraneLibrary();
  const [capSource, setCapSource] = useState(() => (library.cranes.length ? CAP_SOURCES.CHART : CAP_SOURCES.MANUAL));
  const [craneId, setCraneId]     = useState(() => library.cranes[0]?.id ?? "");
  const [configId, setConfigId]   = useState(() => library.cranes[0]?.configurations[0]?.id ?? "");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [bearingOpen, setBearingOpen] = useState(false);
  // The summary modal renders a SNAPSHOT (`summaryData`) rather than reading
  // live state directly, so a Pick-History recall can re-open a past pick.
  const [summaryData, setSummaryData]     = useState(null);
  const summaryOpen = summaryData !== null;

  // ── Pick History (device-kit tape — persisted, NOT part of the math) ──
  const pickTape = useCalcTape(PICK_TAPE_KEY, 30);

  // ── Parse (strictly — parseFloat("12,500") is 12) ───────────
  const f = {
    piece:   readField(pieceWeight),
    rigging: readField(riggingWeight),
    hook:    readField(hookBlock),
    other:   readField(otherDeduct),
    cap:     readField(craneCapacity),
    angle:   readField(angleDeg),
    hsH:     readField(hspanH),
    hsS:     readField(hspanS),
    hsW:     readField(hspanW),
    slL:     readField(slingLen),
    slH:     readField(slingH),
    offH:    readField(offH),
    offD1:   readField(offD1),
    offD2:   readField(offD2),
    slWll:   readField(slingWll),
    shWll:   readField(shackleWll),
    boom:    readField(boomLength),
    radius:  readField(workingRadius),
  };
  const piece    = f.piece.value;
  const rigging  = f.rigging.blank ? 0 : f.rigging.value;
  const hookWt   = f.hook.blank ? 0 : f.hook.value;
  const otherWt  = f.other.blank ? 0 : f.other.value;
  // Rated capacity: read off the selected load chart, or typed by hand.
  const useChart = capSource === CAP_SOURCES.CHART;
  const selectedCrane = library.cranes.find((c) => c.id === craneId) ?? null;
  const selectedConfig = selectedCrane?.configurations.find((c) => c.id === configId) ?? null;
  const chartLookup = useMemo(() => {
    if (!useChart || !selectedConfig) return null;
    if (f.boom.blank || f.radius.blank || f.boom.invalid || f.radius.invalid) return null;
    return lookupRatedCapacity(selectedConfig.chart, f.boom.value, f.radius.value, selectedConfig.boomType);
    // f is rebuilt each render; the raw strings are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useChart, selectedConfig, boomLength, workingRadius]);
  // A position the chart does not rate yields NaN, so utilization is NaN and no
  // result renders; the refusal itself is reported through `errors` below.
  const cap = useChart
    ? (chartLookup && chartLookup.ok === true ? chartLookup.capacity : NaN)
    : f.cap.value;
  const isOffset = numLegs === 2 && cgMode === CG_MODES.OFFSET;

  // ── Loads ───────────────────────────────────────────────────
  // Sling load: what the slings hold (piece + rigging below the hook).
  // Gross load: what the crane chart rates (adds hook block + chart deductions).
  const slingLoad = Number.isFinite(piece) && Number.isFinite(rigging) && piece > 0 && rigging >= 0
    ? piece + rigging : NaN;
  const grossLoad = grossLoadForChart({
    pieceWeight: piece, riggingWeight: rigging, hookBlockWeight: hookWt, otherDeductions: otherWt,
  });

  // ── Geometry ───────────────────────────────────────────────
  const offsetResult = useMemo(
    () => (isOffset ? offsetTwoLegBridle(slingLoad, f.offH.value, f.offD1.value, f.offD2.value) : null),
    [isOffset, slingLoad, f.offH.value, f.offD1.value, f.offD2.value],
  );

  // Horizontal reach (hook plumb → one pick point) in the H/S mode's units.
  const hsReach = numLegs === 4 ? fourLegHorizontalReach(f.hsS.value, f.hsW.value) : f.hsS.value;

  const effectiveAngle = useMemo(() => {
    if (numLegs === 1) return 90; // vertical pick — angle is irrelevant
    if (isOffset) return offsetResult ? Math.min(offsetResult.angle1, offsetResult.angle2) : NaN;
    if (angleMode === ANGLE_MODES.HEIGHT_SPAN) return angleFromHeightSpan(f.hsH.value, hsReach);
    if (angleMode === ANGLE_MODES.SLING) return angleFromSlingLength(f.slL.value, f.slH.value);
    return f.angle.value;
  }, [numLegs, isOffset, offsetResult, angleMode, f.hsH.value, hsReach, f.slL.value, f.slH.value, f.angle.value]);

  const laf = numLegs === 1 ? 1 : (isOffset ? NaN : calculateLAF(effectiveAngle));
  const tensionPerLeg = isOffset
    ? (offsetResult ? Math.max(offsetResult.tension1, offsetResult.tension2) : NaN)
    : calculateSlingTension(slingLoad, numLegs, effectiveAngle);

  const utilization = calculateUtilization(grossLoad, cap);
  const capacityStatus = getCapacityStatusForLift(utilization, liftType);
  // Single-leg vertical picks don't have a meaningful sling-angle risk
  // (nothing to splay), so suppress the angle status for that case.
  const angleStatus = numLegs === 1 ? null : getAngleStatus(effectiveAngle);

  const slingUtil   = f.slWll.blank ? NaN : wllUtilization(tensionPerLeg, f.slWll.value);
  const shackleUtil = f.shWll.blank ? NaN : wllUtilization(tensionPerLeg, f.shWll.value);

  const boomEntered = !f.boom.blank && !f.radius.blank;
  const boomGeo = boomEntered ? boomGeometry(f.boom.value, f.radius.value) : null;

  // ── Input validation ───────────────────────────────────────
  // Collect every failure upfront so the user sees a single "fix
  // these" list rather than whack-a-mole errors as fields clear.
  const errors = useMemo(() => {
    const e = [];
    const num = (fld, label, { required = false, min = 0, strictlyPositive = false } = {}) => {
      if (fld.blank) { if (required) e.push(`Enter ${label}.`); return; }
      if (fld.invalid) { e.push(`${label[0].toUpperCase()}${label.slice(1)} ${NOT_A_NUMBER}`); return; }
      if (strictlyPositive ? !(fld.value > 0) : fld.value < min) {
        e.push(`${label[0].toUpperCase()}${label.slice(1)} must be ${strictlyPositive ? "a positive number" : "zero or more"}.`);
      }
    };
    num(f.piece, "piece weight", { required: true, strictlyPositive: true });
    num(f.rigging, "rigging weight");
    num(f.hook, "hook block weight");
    num(f.other, "other chart deductions");
    if (useChart) {
      if (!selectedCrane) e.push("Choose a crane from the crane library, or switch capacity to manual entry.");
      else if (!selectedConfig) e.push("Choose which configuration's load chart applies to this pick.");
    } else {
      num(f.cap, "the crane's rated capacity at the planned radius", { required: true, strictlyPositive: true });
    }
    num(f.slWll, "sling WLL", { strictlyPositive: true });
    num(f.shWll, "shackle WLL", { strictlyPositive: true });
    // Optional in manual mode (they only drive the 3D view); required to read a chart.
    num(f.boom, "boom length", { required: useChart && !!selectedConfig, strictlyPositive: true });
    num(f.radius, "working radius", { required: useChart && !!selectedConfig, strictlyPositive: true });
    if (boomEntered && !f.boom.invalid && !f.radius.invalid && f.boom.value > 0 && f.radius.value > 0 && !boomGeo) {
      e.push("Working radius must be less than the boom length.");
    }
    if (chartLookup && chartLookup.ok === false) e.push(`Not rated — ${chartLookup.message}`);

    if (numLegs !== 1) {
      if (isOffset) {
        num(f.offH, "hook height above pick points", { required: true, strictlyPositive: true });
        num(f.offD1, "CG → pick point 1 distance", { required: true, strictlyPositive: true });
        num(f.offD2, "CG → pick point 2 distance", { required: true, strictlyPositive: true });
      } else if (angleMode === ANGLE_MODES.HEIGHT_SPAN) {
        num(f.hsH, "height H", { required: true, strictlyPositive: true });
        num(f.hsS, numLegs === 4 ? "half-length" : "half-span S", { required: true });
        if (numLegs === 4) num(f.hsW, "half-width", { required: true });
      } else if (angleMode === ANGLE_MODES.SLING) {
        num(f.slL, "sling length", { required: true, strictlyPositive: true });
        num(f.slH, "height H", { required: true, strictlyPositive: true });
        if (f.slL.value > 0 && f.slH.value > f.slL.value) e.push("Height H cannot exceed the sling length.");
      } else {
        num(f.angle, "sling angle", { required: true });
      }
      const geometryErrored = e.length > 0;
      if (!geometryErrored && !(effectiveAngle > 0 && effectiveAngle <= 90)) {
        e.push("Sling angle must be > 0° and ≤ 90°.");
      }
    }
    return e;
    // f is rebuilt each render; the raw strings are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceWeight, riggingWeight, hookBlock, otherDeduct, craneCapacity, slingWll, shackleWll,
      boomLength, workingRadius, numLegs, isOffset, angleMode, angleDeg, hspanH, hspanS, hspanW,
      slingLen, slingH, offH, offD1, offD2, effectiveAngle, boomEntered, boomGeo,
      useChart, selectedCrane, selectedConfig, chartLookup]);

  const hasValidResults = errors.length === 0
    && Number.isFinite(grossLoad)
    && Number.isFinite(tensionPerLeg)
    && Number.isFinite(utilization);

  const warnings = useMemo(
    () => (hasValidResults ? [
      ...buildWarnings({
        angleStatus,
        capacityStatus,
        angleDegrees: effectiveAngle,
        utilizationPercent: utilization,
        // Drives the rigid-load disclosure for a 4-leg bridle, where tension is
        // computed assuming only two legs carry.
        numLegs,
        liftType,
      }),
      ...buildExtendedWarnings({
        slingUtilization: slingUtil,
        shackleUtilization: shackleUtil,
        hookBlockEntered: hookWt > 0,
        offset: offsetResult,
      }),
    ].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "red" ? -1 : 1)) : []),
    [hasValidResults, angleStatus, capacityStatus, effectiveAngle, utilization, numLegs, liftType,
      slingUtil, shackleUtil, hookWt, offsetResult],
  );

  // ── 3D scene spec (feet). Drawing only — no new engineering values. ──
  const sceneSpec = useMemo(() => {
    const boomFt = boomGeo ? f.boom.value : ILLUSTRATIVE_BOOM_FT;
    const radiusFt = boomGeo ? f.radius.value : ILLUSTRATIVE_RADIUS_FT;
    const angleOk = effectiveAngle > 0 && effectiveAngle <= 90;
    const legStatus = angleStatus;
    let legHeight = 6;
    let reach = 0;
    if (numLegs !== 1) {
      if (isOffset && offsetResult) {
        legHeight = f.offH.value;
      } else if (!isOffset && angleMode === ANGLE_MODES.HEIGHT_SPAN && f.hsH.value > 0 && Number.isFinite(hsReach)) {
        legHeight = f.hsH.value / 12; reach = hsReach / 12;   // inches → ft
      } else if (!isOffset && angleMode === ANGLE_MODES.SLING && angleOk) {
        legHeight = f.slH.value; reach = Math.sqrt(Math.max(0, f.slL.value ** 2 - f.slH.value ** 2));
      } else {
        const a = (angleOk ? effectiveAngle : 60) * Math.PI / 180;
        legHeight = DRAW_SLING_FT * Math.sin(a); reach = DRAW_SLING_FT * Math.cos(a);
      }
    }
    let pickPoints;
    let loadLength;
    let loadWidth = 1;
    let loadCenterZ = 0;
    if (numLegs === 1) {
      pickPoints = [{ x: 0, z: 0, status: null }];
      loadLength = 20;
    } else if (isOffset && offsetResult) {
      pickPoints = [
        { x: 0, z: -f.offD1.value, status: getAngleStatus(offsetResult.angle1) },
        { x: 0, z: f.offD2.value, status: getAngleStatus(offsetResult.angle2) },
      ];
      loadLength = f.offD1.value + f.offD2.value + 2;
      // The piece spans the pick points; its CG (under the hook) is off its middle.
      loadCenterZ = (f.offD2.value - f.offD1.value) / 2;
    } else if (numLegs === 4) {
      let a; let b;
      if (angleMode === ANGLE_MODES.HEIGHT_SPAN && f.hsS.value >= 0 && f.hsW.value >= 0 && Number.isFinite(hsReach)) {
        a = f.hsS.value / 12; b = f.hsW.value / 12;
      } else {
        a = reach / Math.SQRT2; b = reach / Math.SQRT2;
      }
      pickPoints = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * b, z: sz * a, status: legStatus })));
      loadLength = 2 * a + 2;
      loadWidth = Math.max(2.5, 2 * b + 1);
    } else {
      pickPoints = [{ x: 0, z: -reach, status: legStatus }, { x: 0, z: reach, status: legStatus }];
      loadLength = 2 * reach + 3;
    }
    return {
      boomLength: boomFt,
      radius: radiusFt,
      legHeight: Number.isFinite(legHeight) && legHeight > 0 ? legHeight : 6,
      pickPoints,
      loadLength: Math.max(4, Number.isFinite(loadLength) ? loadLength : 20),
      loadWidth,
      loadCenterZ,
      capacityStatus: hasValidResults ? capacityStatus : null,
      illustrative: !boomGeo,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boomGeo, boomLength, workingRadius, effectiveAngle, angleStatus, numLegs, isOffset, offsetResult,
      angleMode, hspanH, hspanS, hspanW, slingLen, slingH, offH, offD1, offD2, hsReach, hasValidResults, capacityStatus]);

  const sceneLabel = `3D view: ${numLegs}-leg pick`
    + (hasValidResults ? `, ${Math.round(grossLoad).toLocaleString()} lb gross, ${utilization.toFixed(0)}% of rated capacity` : "")
    + (boomGeo ? `, ${f.boom.value} ft boom at ${boomGeo.boomAngle.toFixed(0)}°, ${f.radius.value} ft radius` : ", illustrative crane geometry");

  // ── Actions ────────────────────────────────────────────────
  const clearAll = () => {
    setPieceWeight(""); setRiggingWeight("0"); setHookBlock(""); setOtherDeduct("");
    setNumLegs(2); setCgMode(CG_MODES.CENTERED);
    setAngleMode(ANGLE_MODES.DEGREES);
    setAngleDeg("60"); setHspanH(""); setHspanS(""); setHspanW("");
    setSlingLen(""); setSlingH(""); setOffH(""); setOffD1(""); setOffD2("");
    setSlingWll(""); setShackleWll("");
    setLiftType(LIFT_TYPES.STANDARD);
    setCraneCapacity(""); setBoomLength(""); setWorkingRadius("");
    setCraneModel(""); setCounterweight("");
  };

  // Build a self-contained snapshot of the current pick for the summary modal
  // AND the Pick-History tape. Pure data — derives nothing new from the math.
  const buildSnapshot = () => ({
    capturedAt: new Date().toISOString(),
    pieceWeight: piece, riggingWeight: rigging,
    hookBlockWeight: hookWt, otherDeductions: otherWt,
    slingLoad,
    // `totalLoad` is the GROSS load compared to the chart (utilization basis).
    // Kept under this name so picks recalled from older tapes still render.
    totalLoad: grossLoad,
    numLegs, angleDegrees: effectiveAngle, laf, tensionPerLeg,
    cgMode: isOffset ? CG_MODES.OFFSET : CG_MODES.CENTERED,
    offset: isOffset && offsetResult ? { ...offsetResult, H: f.offH.value, d1: f.offD1.value, d2: f.offD2.value } : null,
    // How many legs the tension figure ASSUMES are carrying. For a 4-leg
    // bridle on a rigid load that is 2, not 4 (ASME B30.9). Stamped into the
    // snapshot so the summary and the text export can state it, and so a pick
    // recalled from the history tape can be told apart from one captured
    // before this assumption was applied (those have no field and their
    // 4-leg tension is understated by 2x — see legsCarryingNote()).
    legsAssumedCarrying: loadBearingLegs(numLegs),
    slingWll: f.slWll.value, slingUtil, shackleWll: f.shWll.value, shackleUtil,
    liftType,
    craneCapacity: cap, utilization,
    capacityStatus, angleStatus, warnings,
    boomAngle: boomGeo ? boomGeo.boomAngle : NaN,
    tipHeight: boomGeo ? boomGeo.tipHeightAboveFoot : NaN,
    // Chart mode: crane and counterweight come from the library record, and
    // the chart's provenance travels with the pick, so the summary names the
    // exact chart and cell the capacity was read from.
    craneModel: useChart && selectedCrane ? craneDisplayName(selectedCrane) : craneModel,
    counterweight: useChart && selectedConfig ? selectedConfig.counterweight : counterweight,
    boomLength, workingRadius,
    capacitySource: useChart ? CAP_SOURCES.CHART : CAP_SOURCES.MANUAL,
    chart: useChart && selectedCrane && selectedConfig && chartLookup && chartLookup.ok === true
      ? {
          serial: selectedCrane.serial,
          configuration: selectedConfig.label,
          summary: configurationSummary(selectedConfig),
          source: selectedConfig.chartSource,
          basis: chartLookup.basis,
          exact: chartLookup.exact,
        }
      : null,
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

  const field = (label, value, setter, placeholder, opts = {}) => (
    <div>
      <label style={{ ...labelStyle, ...(opts.small ? { fontSize: 8 } : null) }}>{label}</label>
      <input style={inputStyle} inputMode={opts.text ? "text" : "decimal"} value={value}
        onChange={(e) => setter(e.target.value)} placeholder={placeholder} aria-label={label} />
      {opts.hint && <div style={hintStyle}>{opts.hint}</div>}
    </div>
  );

  const tensionLabel = numLegs === 1
    ? "Tension (single leg)"
    : isOffset
      ? "Max Leg Tension (offset CG)"
      : numLegs === 4
        // Say the assumption in the label. A rigger reading
        // "×4" would reasonably assume the load was split four
        // ways; it is not (ASME B30.9 rigid-load rule).
        ? "Tension per Leg (4-leg bridle — 2 legs assumed carrying)"
        : `Tension per Leg (×${numLegs})`;

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
            Gross load · sling tension · offset CG · sling &amp; shackle WLL · boom geometry · 3D · ASME B30.5 / B30.9 · OSHA 1926 Subpart CC
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
                {field("Piece Weight (lb)", pieceWeight, setPieceWeight, "e.g. 12,500")}
                {field("Rigging Weight (lb)", riggingWeight, setRiggingWeight, "0",
                  { hint: "Below the hook: slings, shackles, spreader, chokers, tag lines." })}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {field("Hook Block / Ball (lb)", hookBlock, setHookBlock, "e.g. 1,200", { small: true })}
                  {field("Other Chart Deductions (lb)", otherDeduct, setOtherDeduct, "0", { small: true })}
                </div>
                <div style={{ ...hintStyle, marginTop: -4 }}>
                  The chart rates the GROSS load: hook block, and any stowed/erected jib, load-line or attachment deductions listed in the chart notes.
                </div>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-secondary)", background: "var(--bg-surface-low)", padding: "8px 10px", borderRadius: 4, display: "grid", gap: 4 }}>
                  <div>
                    Load on Slings:
                    <span style={{ color: "var(--text-primary)", fontWeight: 800, marginLeft: 8 }}>
                      {Number.isFinite(slingLoad) ? lbOrDash(slingLoad) : "—"}
                    </span>
                  </div>
                  <div>
                    Gross Load (vs. chart):
                    <span style={{ color: "var(--accent)", fontWeight: 800, marginLeft: 8 }}>
                      {Number.isFinite(grossLoad) ? lbOrDash(grossLoad) : "—"}
                    </span>
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                      {Number.isFinite(grossLoad) ? `(${tonsOrDash(grossLoad)})` : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 2 — Rigging Config */}
            <div style={cardStyle}>
              <SectionHeader n={2} label="Rigging Configuration" />
              <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={labelStyle} htmlFor="crane-legs">Number of Sling Legs</label>
                  <select id="crane-legs" style={selectStyle} value={numLegs}
                    onChange={(e) => setNumLegs(Number(e.target.value))}>
                    <option value={1}>1 (Single Vertical)</option>
                    <option value={2}>2 (Bridle)</option>
                    <option value={4}>4 (Four-Leg Bridle)</option>
                  </select>
                </div>

                {numLegs === 2 && (
                  <div>
                    <span style={labelStyle}>Load Centre of Gravity</span>
                    <div className="crane-pick-keyrow" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <CalcKey label="CENTERED" variant={cgMode === CG_MODES.CENTERED ? "accent" : "fn"}
                        onPress={() => setCgMode(CG_MODES.CENTERED)} ariaLabel="Centre of gravity centred between pick points" />
                      <CalcKey label="OFFSET" variant={cgMode === CG_MODES.OFFSET ? "accent" : "fn"}
                        onPress={() => setCgMode(CG_MODES.OFFSET)} ariaLabel="Centre of gravity offset toward one pick point" />
                    </div>
                  </div>
                )}

                {/* Offset CG geometry (2-leg only) */}
                {isOffset && (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      {field("Hook ↕ Picks H (ft)", offH, setOffH, "e.g. 8", { small: true })}
                      {field("CG → Pick 1 (ft)", offD1, setOffD1, "e.g. 4", { small: true })}
                      {field("CG → Pick 2 (ft)", offD2, setOffD2, "e.g. 12", { small: true })}
                    </div>
                    <div style={hintStyle}>
                      Horizontal distances from the CG to each pick point; H is the vertical from the hook down to the pick points (same elevation). The hook settles plumb over the CG.
                    </div>
                    {offsetResult && (
                      <div style={{ ...mono, fontSize: 10, color: "var(--text-secondary)", marginTop: 8, display: "grid", gap: 3 }}>
                        <div>Leg 1: {lbOrDash(offsetResult.tension1)} · {offsetResult.angle1.toFixed(1)}° · {offsetResult.length1.toFixed(2)} ft · {(offsetResult.share1 * 100).toFixed(0)}% of vertical <StatusPill status={getAngleStatus(offsetResult.angle1)} /></div>
                        <div>Leg 2: {lbOrDash(offsetResult.tension2)} · {offsetResult.angle2.toFixed(1)}° · {offsetResult.length2.toFixed(2)} ft · {(offsetResult.share2 * 100).toFixed(0)}% of vertical <StatusPill status={getAngleStatus(offsetResult.angle2)} /></div>
                      </div>
                    )}
                  </div>
                )}

                {/* Angle inputs suppressed for single-leg vertical and offset CG */}
                {numLegs !== 1 && !isOffset && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
                      <span style={{ ...labelStyle, marginBottom: 0 }}>Sling Angle</span>
                      <div className="crane-pick-keyrow" style={{ display: "flex", gap: 4 }}>
                        {[
                          { key: ANGLE_MODES.DEGREES,     label: "DEG",   aria: "Degrees angle mode" },
                          { key: ANGLE_MODES.HEIGHT_SPAN, label: "H/S",   aria: "Height over span angle mode" },
                          { key: ANGLE_MODES.SLING,       label: "SLING", aria: "Sling length and height angle mode" },
                        ].map((m) => (
                          <CalcKey
                            key={m.key}
                            label={m.label}
                            variant={angleMode === m.key ? "accent" : "fn"}
                            onPress={() => setAngleMode(m.key)}
                            ariaLabel={m.aria}
                          />
                        ))}
                      </div>
                    </div>

                    {angleMode === ANGLE_MODES.DEGREES && (
                      <>
                        <input style={inputStyle} inputMode="decimal" value={angleDeg}
                          onChange={(e) => setAngleDeg(e.target.value)}
                          placeholder="0 – 90" aria-label="Sling angle (degrees from horizontal)" />
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
                        <div style={hintStyle}>Measured from horizontal.</div>
                      </>
                    )}
                    {angleMode === ANGLE_MODES.HEIGHT_SPAN && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: numLegs === 4 ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
                          {field("Height H (in)", hspanH, setHspanH, "vertical drop", { small: true })}
                          {field(numLegs === 4 ? "Half-length (in)" : "Half-span S (in)", hspanS, setHspanS, "horizontal", { small: true })}
                          {numLegs === 4 && field("Half-width (in)", hspanW, setHspanW, "horizontal", { small: true })}
                        </div>
                        <div style={hintStyle}>
                          {numLegs === 4
                            ? "Half the pick-point spacing each way. The leg runs to the corner, so the reach used is the half-diagonal √(a² + b²)."
                            : "S is the horizontal distance from the hook plumb line to one pick point."}
                          {numLegs === 4 && Number.isFinite(hsReach) && ` Reach = ${hsReach.toFixed(1)} in.`}
                        </div>
                      </>
                    )}
                    {angleMode === ANGLE_MODES.SLING && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {field("Sling Length L (ft)", slingLen, setSlingLen, "from the tag", { small: true })}
                          {field("Height H (ft)", slingH, setSlingH, "hook → pick point", { small: true })}
                        </div>
                        <div style={hintStyle}>sin θ = H / L, so LAF = L / H. Use the same unit for both.</div>
                      </>
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

                {/* Rigging gear ratings */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {field("Sling WLL at Hitch (lb)", slingWll, setSlingWll, "from the tag", { small: true })}
                  {field("Shackle WLL (lb)", shackleWll, setShackleWll, "e.g. 17,000", { small: true })}
                </div>
                <div style={{ ...hintStyle, marginTop: -4 }}>
                  Optional. Use the tag rating for the hitch actually rigged (vertical / choker / basket). Choke angles under 120° reduce a choker rating further — see the manufacturer's table.
                </div>
              </div>
            </div>

            {/* SECTION 3 — Crane Capacity */}
            <div style={cardStyle}>
              <SectionHeader n={3} label="Crane" />
              <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <span style={labelStyle}>Lift Type</span>
                  <div className="crane-pick-keyrow" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <CalcKey label="STANDARD" variant={liftType === LIFT_TYPES.STANDARD ? "accent" : "fn"}
                      onPress={() => setLiftType(LIFT_TYPES.STANDARD)} ariaLabel="Standard material lift" />
                    <CalcKey label="PERSONNEL" variant={liftType === LIFT_TYPES.PERSONNEL ? "accent" : "fn"}
                      onPress={() => setLiftType(LIFT_TYPES.PERSONNEL)} ariaLabel="Personnel platform lift" />
                  </div>
                  <div style={hintStyle}>
                    {liftType === LIFT_TYPES.PERSONNEL
                      ? "Personnel platform: loaded platform + rigging ≤ 50% of rated capacity (29 CFR 1926.1431)."
                      : "Standard: caution at 75%, critical above 90% (common contractor lift-planning thresholds)."}
                  </div>
                </div>
                <div>
                  <span style={labelStyle}>Rated Capacity Source</span>
                  <div className="crane-pick-keyrow" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <CalcKey label="LOAD CHART" variant={useChart ? "accent" : "fn"}
                      onPress={() => setCapSource(CAP_SOURCES.CHART)} ariaLabel="Read rated capacity from a load chart in the crane library" />
                    <CalcKey label="MANUAL" variant={!useChart ? "accent" : "fn"}
                      onPress={() => setCapSource(CAP_SOURCES.MANUAL)} ariaLabel="Type the rated capacity by hand" />
                  </div>
                </div>
                {useChart ? (
                  <CraneChartSource
                    cranes={library.cranes}
                    craneId={craneId}
                    configId={configId}
                    onSelect={(c, cfg) => { setCraneId(c); setConfigId(cfg); }}
                    lookup={chartLookup}
                    onManage={() => setLibraryOpen(true)}
                  />
                ) : (
                  field("Rated Capacity at Radius (lb)", craneCapacity, setCraneCapacity, "e.g. 180,000",
                    { hint: "From the crane's load chart at the planned working radius, boom configuration, and counterweight setup." })
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {field("Boom Length (ft)", boomLength, setBoomLength, "e.g. 110", { small: true })}
                  {field("Working Radius (ft)", workingRadius, setWorkingRadius, "e.g. 45", { small: true })}
                </div>
                <div style={{ ...hintStyle, marginTop: -4 }}>
                  {useChart ? "Required — these read the load chart. " : "Optional — drives boom angle, tip height and the 3D view. "}
                  Radius is measured from the centre of rotation, and boom deflection increases it under load — plan to the LOADED radius.
                  {boomGeo && (
                    <span style={{ color: "var(--text-secondary)" }}>
                      {" "}Boom angle ≈ {boomGeo.boomAngle.toFixed(1)}° · tip ≈ {boomGeo.tipHeightAboveFoot.toFixed(1)} ft above boom foot.
                    </span>
                  )}
                </div>

                {/* Optional crane metadata — collapsible, not used in math. Manual
                    mode only: in chart mode the library record supplies both. */}
                {!useChart && (
                <div>
                  <button
                    type="button"
                    onClick={() => setRefOpen((v) => !v)}
                    style={keycapButtonStyle(false, { fullWidth: false })}
                  >
                    {refOpen ? "▾" : "▸"} Reference Details (metadata only)
                  </button>
                  {refOpen && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                      {field("Crane Make / Model", craneModel, setCraneModel, "e.g. Grove GMK5150L", { small: true, text: true })}
                      {field("Counterweight", counterweight, setCounterweight, "e.g. 53,000 lb", { small: true, text: true })}
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>

            {/* Ground bearing — outrigger mat check. Kept apart from the pick
                math: the outrigger reaction comes from the manufacturer's
                outrigger-load data, not from anything computed on this page. */}
            <div style={cardStyle}>
              <div style={{ padding: "12px 18px" }}>
                <button
                  type="button"
                  onClick={() => setBearingOpen((v) => !v)}
                  aria-expanded={bearingOpen}
                  style={keycapButtonStyle(false, { fullWidth: false })}
                >
                  {bearingOpen ? "▾" : "▸"} Ground Bearing — Outrigger Mat Check
                </button>
                {bearingOpen && <div style={{ marginTop: 12 }}><GroundBearingPanel /></div>}
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
                    <ResultRow label="Gross Load (vs. chart)"
                      primary={lbOrDash(grossLoad)}
                      secondary={tonsOrDash(grossLoad)} />
                    <ResultRow label="Load on Slings"
                      primary={lbOrDash(slingLoad)}
                      secondary={tonsOrDash(slingLoad)} />
                    <ResultRow label={tensionLabel}
                      primary={lbOrDash(tensionPerLeg)}
                      secondary={tonsOrDash(tensionPerLeg)} />
                    {isOffset && offsetResult && (
                      <ResultRow label="Leg 1 / Leg 2"
                        primary={`${Math.round(offsetResult.tension1).toLocaleString()} / ${Math.round(offsetResult.tension2).toLocaleString()} lb`} />
                    )}
                    {!isOffset && (
                      <ResultRow label="Load Angle Factor (LAF)"
                        primary={Number.isFinite(laf) ? laf.toFixed(3) : "—"} />
                    )}
                    {Number.isFinite(slingUtil) && (
                      <ResultRow label="Sling Utilization"
                        primary={<GearValue pct={slingUtil} />} />
                    )}
                    {Number.isFinite(shackleUtil) && (
                      <ResultRow label="Shackle Utilization"
                        primary={<GearValue pct={shackleUtil} />} />
                    )}
                    {boomGeo && (
                      <ResultRow label="Boom Angle / Tip Height"
                        primary={`${boomGeo.boomAngle.toFixed(1)}°`}
                        secondary={`${boomGeo.tipHeightAboveFoot.toFixed(1)} ft above foot`} />
                    )}
                    <div style={{ height: 1, background: "var(--divider)", margin: "10px 0" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                        Capacity Utilization{liftType === LIFT_TYPES.PERSONNEL ? " (50% limit)" : ""}
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
                type="button"
                onClick={openSummary}
                disabled={!hasValidResults}
                style={keycapButtonStyle("accent", { disabled: !hasValidResults })}
              >
                Generate Pick Summary
              </button>
              <button
                type="button"
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

        {/* SECTION 6 — 3D pick view (full width) */}
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 18px", borderBottom: show3d ? "1px solid var(--divider)" : "none", background: "var(--bg-surface-low)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <SectionBadge n={6} />
              <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                3D Pick View
              </span>
              {sceneSpec.illustrative && show3d && (
                <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
                  · illustrative crane — enter boom length &amp; radius to draw yours
                </span>
              )}
            </div>
            <button type="button" onClick={() => setShow3d((v) => !v)} style={keycapButtonStyle("ghost", { compact: true })}>
              {show3d ? "Hide" : "Show"} 3D
            </button>
          </div>
          {show3d && (
            <div style={{ padding: "14px 18px" }}>
              <Suspense fallback={<div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", padding: 16 }}>Loading 3D view…</div>}>
                <CranePick3D spec={sceneSpec} ariaLabel={sceneLabel} />
              </Suspense>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>Sling legs: coloured by angle status</span>
                <span>Load: coloured by crane utilization</span>
                <span>Generic crane body — not to the scale of any model; boom drawn without deflection.</span>
              </div>
            </div>
          )}
        </div>

        {/* Mobile: collapse the grid */}
        <style>{`
          @media (max-width: 820px) {
            .crane-pick-grid { grid-template-columns: 1fr !important; }
            .crane-pick-grid > div { position: static !important; }
          }
          @media print {
            body > :not(.pick-summary-print-root),
            .pick-summary-print-root > :not(.pick-summary-print-area) { display: none !important; }
            .pick-summary-print-root { position: static !important; background: white !important; }
            .pick-summary-print-area { box-shadow: none !important; border: none !important; color: #000 !important; }
            .pick-summary-print-area * { color: #000 !important; }
          }
        `}</style>

        <CraneLibraryPanel
          open={libraryOpen}
          cranes={library.cranes}
          onChange={library.setCranes}
          onClose={() => setLibraryOpen(false)}
          onUse={(c, cfg) => { setCraneId(c); setConfigId(cfg); setCapSource(CAP_SOURCES.CHART); }}
          saveFailed={library.saveFailed}
        />

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
/**
 * "4 (two assumed carrying)" — the leg count with the load-sharing assumption
 * attached. The summary modal and the text export are the artifacts that end up
 * in a lift plan or a pre-lift email, so the assumption has to travel with the
 * number, not just live on the calculator screen.
 */
function legsSummaryValue(d) {
  const legs = Number(d?.numLegs);
  const carrying = Number(d?.legsAssumedCarrying);
  const offset = d?.cgMode === CG_MODES.OFFSET ? " — offset CG" : "";
  if (Number.isFinite(carrying) && Number.isFinite(legs) && carrying !== legs) {
    return `${legs} (${carrying} assumed carrying)${offset}`;
  }
  return `${d?.numLegs ?? "—"}${offset}`;
}

/**
 * The line printed under "Tension per Leg".
 *
 * Two cases:
 *   - A current 4-leg snapshot: state the ASME B30.9 rigid-load assumption.
 *   - A 4-leg snapshot recalled from the persisted history tape that predates
 *     this fix: it has no `legsAssumedCarrying` field, and its stored tension
 *     was computed by dividing the load by FOUR — understated by exactly 2x.
 *     Recalculating it here would silently rewrite a recorded pick, so instead
 *     the stale value is labelled as unsafe and the planner is told to re-run
 *     it. A recalled pick is read-only by design.
 */
function legsCarryingNote(d) {
  const legs = Number(d?.numLegs);
  if (legs !== 4) return "";
  if (!Number.isFinite(Number(d?.legsAssumedCarrying))) {
    return "⚠ RECORDED BEFORE THE 4-LEG CORRECTION — this tension assumed all 4 legs shared the load and is understated by ~2x. Re-run this pick before using it.";
  }
  return "Rigid load: only 2 of 4 legs assumed carrying (ASME B30.9). Rate every leg for the full value above.";
}

/**
 * Picks saved before the gross-load fix have no `slingLoad`, and their
 * `totalLoad` excluded the hook block. Say so rather than letting the recalled
 * utilization read as if it had been checked against the gross load.
 */
function grossLoadNote(d) {
  if (d && d.slingLoad === undefined) {
    return "⚠ RECORDED BEFORE HOOK-BLOCK DEDUCTIONS WERE SUPPORTED — this load excludes the hook block and chart deductions, so utilization may be understated. Re-run this pick.";
  }
  return "";
}

/** When the pick was captured — recalled picks must not show "now". */
function capturedLabel(d) {
  if (d?.capturedAt) {
    const t = new Date(d.capturedAt);
    if (!Number.isNaN(t.getTime())) return t.toLocaleString();
  }
  return "Capture time not recorded";
}

const pctOrDash = (n) => (Number.isFinite(Number(n)) ? `${Number(n).toFixed(1)}%` : "—");

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

  const personnel = data.liftType === LIFT_TYPES.PERSONNEL;

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
              {capturedLabel(data)}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{
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
            <strong style={{ ...mono, fontSize: 9, letterSpacing: "0.12em", color: "var(--status-info)" }}>PLANNING TOOL ONLY —</strong>
            {" "}Does not replace an engineered lift plan. Verify all values against the crane load chart and rigging capacity ratings.
          </div>

          <SummarySection title="Load">
            <SummaryRow k="Piece Weight"       v={lbOrDash(data.pieceWeight)} />
            <SummaryRow k="Rigging Weight"     v={lbOrDash(data.riggingWeight)} />
            {data.slingLoad !== undefined && (
              <>
                <SummaryRow k="Load on Slings"       v={`${lbOrDash(data.slingLoad)} (${tonsOrDash(data.slingLoad)})`} />
                <SummaryRow k="Hook Block / Ball"    v={lbOrDash(data.hookBlockWeight)} />
                <SummaryRow k="Other Chart Deductions" v={lbOrDash(data.otherDeductions)} />
              </>
            )}
            <SummaryRow k="Gross Load (vs. chart)" v={`${lbOrDash(data.totalLoad)} (${tonsOrDash(data.totalLoad)})`} bold />
            {grossLoadNote(data) && <SummaryRow k="" v={grossLoadNote(data)} />}
          </SummarySection>

          <SummarySection title="Rigging Configuration">
            <SummaryRow k="Number of Legs" v={legsSummaryValue(data)} />
            {data.offset ? (
              <>
                <SummaryRow k="Geometry" v={`H ${data.offset.H} ft · CG→pick 1 ${data.offset.d1} ft · CG→pick 2 ${data.offset.d2} ft`} />
                <SummaryRow k="Leg 1" v={`${lbOrDash(data.offset.tension1)} @ ${data.offset.angle1.toFixed(1)}° (${(data.offset.share1 * 100).toFixed(0)}% of vertical)`} />
                <SummaryRow k="Leg 2" v={`${lbOrDash(data.offset.tension2)} @ ${data.offset.angle2.toFixed(1)}° (${(data.offset.share2 * 100).toFixed(0)}% of vertical)`} />
              </>
            ) : (
              <>
                <SummaryRow k="Sling Angle"    v={data.numLegs === 1 ? "Single vertical pick" : `${Number(data.angleDegrees).toFixed(1)}°`} />
                <SummaryRow k="Load Angle Factor (LAF)" v={Number.isFinite(data.laf) ? data.laf.toFixed(3) : "—"} />
              </>
            )}
            <SummaryRow k={data.numLegs === 1 ? "Tension (single leg)" : data.offset ? "Max Leg Tension" : "Tension per Leg"} v={`${lbOrDash(data.tensionPerLeg)} (${tonsOrDash(data.tensionPerLeg)})`} bold />
            {legsCarryingNote(data) && (
              <SummaryRow k="" v={legsCarryingNote(data)} />
            )}
            {Number.isFinite(data.slingUtil) && (
              <SummaryRow k="Sling WLL / Utilization" v={`${lbOrDash(data.slingWll)} · ${pctOrDash(data.slingUtil)}`} />
            )}
            {Number.isFinite(data.shackleUtil) && (
              <SummaryRow k="Shackle WLL / Utilization" v={`${lbOrDash(data.shackleWll)} · ${pctOrDash(data.shackleUtil)}`} />
            )}
          </SummarySection>

          <SummarySection title="Capacity">
            {data.liftType && <SummaryRow k="Lift Type" v={personnel ? "Personnel platform (50% limit, 1926.1431)" : "Standard"} />}
            <SummaryRow k="Rated Crane Capacity" v={lbOrDash(data.craneCapacity)} />
            {data.chart && (
              <>
                <SummaryRow k="Capacity Source" v={`Load chart — ${data.chart.configuration}`} />
                <SummaryRow k="Chart" v={data.chart.summary} />
                <SummaryRow k="Chart Reference" v={data.chart.source} />
                {data.chart.serial && <SummaryRow k="Crane S/N" v={data.chart.serial} />}
                <SummaryRow k="Chart Reading" v={data.chart.basis} />
              </>
            )}
            {data.capacitySource === CAP_SOURCES.MANUAL && <SummaryRow k="Capacity Source" v="Entered by hand" />}
            <SummaryRow
              k="Utilization"
              v={`${data.utilization.toFixed(1)}% (${(STATUS_LABEL[data.capacityStatus] || "—")})`}
              bold
            />
          </SummarySection>

          {(data.craneModel || data.boomLength || data.workingRadius || data.counterweight) && (
            <SummarySection title="Crane">
              {data.craneModel     && <SummaryRow k="Make / Model"     v={data.craneModel} />}
              {data.boomLength     && <SummaryRow k="Boom Length"      v={`${data.boomLength} ft`} />}
              {data.workingRadius  && <SummaryRow k="Working Radius"   v={`${data.workingRadius} ft`} />}
              {Number.isFinite(data.boomAngle) && <SummaryRow k="Boom Angle (approx.)" v={`${data.boomAngle.toFixed(1)}°`} />}
              {Number.isFinite(data.tipHeight) && <SummaryRow k="Tip Height above Foot (approx.)" v={`${data.tipHeight.toFixed(1)} ft`} />}
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
          <button type="button" onClick={onClose}    style={keycapButtonStyle("ghost", { compact: true })}>Close</button>
          <button type="button" onClick={copySummary} style={keycapButtonStyle("ghost", { compact: true })}>Copy</button>
          <button type="button" onClick={doPrint}     style={keycapButtonStyle("accent", { compact: true })}>Print</button>
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
  lines.push(capturedLabel(d));
  lines.push("");
  lines.push("LOAD");
  lines.push(`  Piece Weight:        ${lbOrDash(d.pieceWeight)}`);
  lines.push(`  Rigging Weight:      ${lbOrDash(d.riggingWeight)}`);
  if (d.slingLoad !== undefined) {
    lines.push(`  Load on Slings:      ${lbOrDash(d.slingLoad)}  (${tonsOrDash(d.slingLoad)})`);
    lines.push(`  Hook Block / Ball:   ${lbOrDash(d.hookBlockWeight)}`);
    lines.push(`  Other Deductions:    ${lbOrDash(d.otherDeductions)}`);
  }
  lines.push(`  Gross Load (chart):  ${lbOrDash(d.totalLoad)}  (${tonsOrDash(d.totalLoad)})`);
  const grossNote = grossLoadNote(d);
  if (grossNote) lines.push(`                       ${grossNote}`);
  lines.push("");
  lines.push("RIGGING");
  lines.push(`  Number of Legs:      ${legsSummaryValue(d)}`);
  if (d.offset) {
    lines.push(`  Geometry:            H ${d.offset.H} ft, CG→pick 1 ${d.offset.d1} ft, CG→pick 2 ${d.offset.d2} ft`);
    lines.push(`  Leg 1:               ${lbOrDash(d.offset.tension1)} @ ${d.offset.angle1.toFixed(1)}°`);
    lines.push(`  Leg 2:               ${lbOrDash(d.offset.tension2)} @ ${d.offset.angle2.toFixed(1)}°`);
  } else if (d.numLegs === 1) {
    lines.push(`  Sling Angle:         Single vertical pick`);
  } else {
    lines.push(`  Sling Angle:         ${Number(d.angleDegrees).toFixed(1)}°`);
  }
  if (!d.offset) lines.push(`  Load Angle Factor:   ${Number.isFinite(d.laf) ? d.laf.toFixed(3) : "—"}`);
  lines.push(`  ${d.offset ? "Max Leg Tension:    " : "Tension per Leg:    "} ${lbOrDash(d.tensionPerLeg)}  (${tonsOrDash(d.tensionPerLeg)})`);
  const carryNote = legsCarryingNote(d);
  if (carryNote) lines.push(`                       ${carryNote}`);
  if (Number.isFinite(d.slingUtil)) lines.push(`  Sling WLL:           ${lbOrDash(d.slingWll)}  (${pctOrDash(d.slingUtil)} used)`);
  if (Number.isFinite(d.shackleUtil)) lines.push(`  Shackle WLL:         ${lbOrDash(d.shackleWll)}  (${pctOrDash(d.shackleUtil)} used)`);
  lines.push("");
  lines.push("CAPACITY");
  if (d.liftType) lines.push(`  Lift Type:           ${d.liftType === LIFT_TYPES.PERSONNEL ? "Personnel platform (50% limit, 29 CFR 1926.1431)" : "Standard"}`);
  lines.push(`  Rated Capacity:      ${lbOrDash(d.craneCapacity)}`);
  if (d.chart) {
    lines.push(`  Capacity Source:     Load chart — ${d.chart.configuration}`);
    lines.push(`  Chart:               ${d.chart.summary}`);
    lines.push(`  Chart Reference:     ${d.chart.source}`);
    if (d.chart.serial) lines.push(`  Crane S/N:           ${d.chart.serial}`);
    lines.push(`  Chart Reading:       ${d.chart.basis}`);
  } else if (d.capacitySource === CAP_SOURCES.MANUAL) {
    lines.push(`  Capacity Source:     Entered by hand`);
  }
  lines.push(`  Utilization:         ${Number(d.utilization).toFixed(1)}%  (${STATUS_LABEL[d.capacityStatus] || "—"})`);
  if (d.craneModel || d.boomLength || d.workingRadius || d.counterweight) {
    lines.push("");
    lines.push("CRANE");
    if (d.craneModel)    lines.push(`  Make / Model:        ${d.craneModel}`);
    if (d.boomLength)    lines.push(`  Boom Length:         ${d.boomLength} ft`);
    if (d.workingRadius) lines.push(`  Working Radius:      ${d.workingRadius} ft`);
    if (Number.isFinite(d.boomAngle)) lines.push(`  Boom Angle (approx): ${d.boomAngle.toFixed(1)}°`);
    if (Number.isFinite(d.tipHeight)) lines.push(`  Tip above Foot:      ${d.tipHeight.toFixed(1)} ft (approx)`);
    if (d.counterweight) lines.push(`  Counterweight:       ${d.counterweight}`);
  }
  if (d.warnings?.length) {
    lines.push("");
    lines.push("WARNINGS");
    d.warnings.forEach((w) => lines.push(`  [${w.severity.toUpperCase()}] ${w.message}`));
  }
  return lines.join("\n");
}

/** Sling / shackle utilization with its own (no-critical-band) status pill. */
function GearValue({ pct }) {
  const s = getRiggingStatus(pct);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: STATUS_COLOR[s] || "var(--text-primary)" }}>{pct.toFixed(1)}%</span>
      {s && <StatusPill status={s} />}
    </span>
  );
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
      color: "var(--bg-base)",
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
      <SectionBadge n={n} />
      <span style={{
        ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)",
        letterSpacing: "0.14em", textTransform: "uppercase",
      }}>{label}</span>
    </div>
  );
}

/** Keycap-style step badge — ties the section card to the device kit. */
function SectionBadge({ n }) {
  return (
    <span style={{
      ...mono, fontSize: 9, fontWeight: 800, color: "var(--accent)",
      letterSpacing: "0.10em",
      minWidth: 22, height: 22, display: "inline-flex",
      alignItems: "center", justifyContent: "center",
      borderRadius: 6, border: "1px solid var(--accent)",
      background: "color-mix(in srgb, var(--accent) 12%, transparent)",
      boxShadow: "0 1px 0 var(--border-strong), inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>{String(n).padStart(2, "0")}</span>
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
