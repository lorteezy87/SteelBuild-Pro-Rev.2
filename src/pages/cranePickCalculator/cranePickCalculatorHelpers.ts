/**
 * Pure format / summary helpers for Crane Pick Calculator.
 */

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


export const STATUS_LABEL = {
  green:  "OK",
  yellow: "CAUTION",
  red:    "CRITICAL",
};

export const mono = { fontFamily: "var(--font-mono)" };
export const body = { fontFamily: "var(--font-body)" };

export function lbOrDash(n) {
  if (!Number.isFinite(Number(n))) return "—";
  return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`;
}
export function tonsOrDash(n) {
  if (!Number.isFinite(Number(n))) return "—";
  return `${(Number(n) / 2000).toFixed(3)} T`;
}

export function buildSummaryText(d) {
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
export function keycapButtonStyle(variant, opts: { disabled?: boolean; compact?: boolean; fullWidth?: boolean } = {}) {
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
export function pickTapeExpr(s) {
  const tons = Number.isFinite(s.totalLoad) ? `${(s.totalLoad / 2000).toFixed(1)}T` : "—";
  const angle = s.numLegs === 1
    ? "vert"
    : (Number.isFinite(s.angleDegrees) ? `${s.angleDegrees.toFixed(0)}°` : "—");
  return `${tons} · ${s.numLegs}-leg · ${angle}`;
}


export type CranePickInputVals = {
  pieceWeight: string;
  piece: number;
  rigging: number;
  craneCapacity: string;
  cap: number;
  numLegs: number;
  effectiveAngle: number;
};

/** Collect all input failures so the UI can show a single fix list. */
export function buildCranePickValidationErrors(v: CranePickInputVals): string[] {
  const e: string[] = [];
  if (v.pieceWeight === "") {
    e.push("Enter piece weight.");
  } else if (!(v.piece > 0)) {
    e.push("Piece weight must be a positive number.");
  }
  if (v.rigging < 0) e.push("Rigging weight cannot be negative.");
  if (v.craneCapacity === "") {
    e.push("Enter the crane's rated capacity at the planned radius.");
  } else if (!(v.cap > 0)) {
    e.push("Crane capacity must be a positive number.");
  }
  if (v.numLegs !== 1) {
    if (!(v.effectiveAngle > 0 && v.effectiveAngle <= 90)) {
      e.push("Sling angle must be > 0° and ≤ 90°.");
    }
  }
  return e;
}

export function computeEffectiveSlingAngle(opts: {
  numLegs: number;
  angleMode: string;
  heightSpanMode: string;
  angleDeg: string;
  hspanH: string;
  hspanS: string;
  angleFromHeightSpan: (h: number, s: number) => number;
}): number {
  if (opts.numLegs === 1) return 90;
  if (opts.angleMode === opts.heightSpanMode) {
    return opts.angleFromHeightSpan(parseFloat(opts.hspanH), parseFloat(opts.hspanS));
  }
  return parseFloat(opts.angleDeg);
}

export function buildPickSnapshot(d: {
  piece: number;
  rigging: number;
  totalLoad: number;
  numLegs: number;
  effectiveAngle: number;
  laf: number;
  tensionPerLeg: number;
  cap: number;
  utilization: number;
  capacityStatus: string;
  angleStatus: string | null;
  craneModel: string;
  boomLength: string;
  workingRadius: string;
  counterweight: string;
  warnings: unknown[];
}) {
  return {
    pieceWeight: d.piece,
    riggingWeight: d.rigging,
    totalLoad: d.totalLoad,
    numLegs: d.numLegs,
    angleDegrees: d.effectiveAngle,
    laf: d.laf,
    tensionPerLeg: d.tensionPerLeg,
    craneCapacity: d.cap,
    utilization: d.utilization,
    capacityStatus: d.capacityStatus,
    angleStatus: d.angleStatus,
    craneModel: d.craneModel,
    boomLength: d.boomLength,
    workingRadius: d.workingRadius,
    counterweight: d.counterweight,
    warnings: d.warnings,
  };
}

export type CranePickFormState = {
  pieceWeight: string;
  riggingWeight: string;
  numLegs: number;
  angleMode: string;
  angleDeg: string;
  hspanH: string;
  hspanS: string;
  craneCapacity: string;
  heightSpanMode: string;
};

export type CranePickDerived = {
  piece: number;
  rigging: number;
  cap: number;
  effectiveAngle: number;
  totalLoad: number;
  laf: number;
  tensionPerLeg: number;
  utilization: number;
  capacityStatus: string;
  angleStatus: string | null;
  errors: string[];
  hasValidResults: boolean;
  warnings: ReturnType<typeof buildWarnings>;
};

/** Live derived engineering values for the crane pick form (pure). */
export function buildCranePickDerived(form: CranePickFormState): CranePickDerived {
  const piece = parseFloat(form.pieceWeight);
  const rigging = parseFloat(form.riggingWeight || "0");
  const cap = parseFloat(form.craneCapacity);

  const effectiveAngle = computeEffectiveSlingAngle({
    numLegs: form.numLegs,
    angleMode: form.angleMode,
    heightSpanMode: form.heightSpanMode,
    angleDeg: form.angleDeg,
    hspanH: form.hspanH,
    hspanS: form.hspanS,
    angleFromHeightSpan,
  });

  const totalLoad = calculateTotalLoad(piece, rigging);
  const laf = form.numLegs === 1 ? 1 : calculateLAF(effectiveAngle);
  const tensionPerLeg = calculateSlingTension(totalLoad, form.numLegs, effectiveAngle);
  const utilization = calculateUtilization(totalLoad, cap);
  const capacityStatus = getCapacityStatus(utilization);
  // Single-leg vertical picks don't have a meaningful sling-angle risk.
  const angleStatus = form.numLegs === 1 ? null : getAngleStatus(effectiveAngle);

  const errors = buildCranePickValidationErrors({
    pieceWeight: form.pieceWeight,
    piece,
    rigging,
    craneCapacity: form.craneCapacity,
    cap,
    numLegs: form.numLegs,
    effectiveAngle,
  });

  const hasValidResults =
    errors.length === 0 &&
    Number.isFinite(totalLoad) &&
    Number.isFinite(tensionPerLeg) &&
    Number.isFinite(utilization);

  const warnings = hasValidResults
    ? buildWarnings({
        angleStatus,
        capacityStatus,
        angleDegrees: effectiveAngle,
        utilizationPercent: utilization,
      })
    : [];

  return {
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
  };
}

/** Reset form fields for Clear All (pure seed). */
export function createEmptyCranePickForm(degreesMode: string): {
  pieceWeight: string;
  riggingWeight: string;
  numLegs: number;
  angleMode: string;
  angleDeg: string;
  hspanH: string;
  hspanS: string;
  craneCapacity: string;
  craneModel: string;
  boomLength: string;
  workingRadius: string;
  counterweight: string;
} {
  return {
    pieceWeight: "",
    riggingWeight: "0",
    numLegs: 2,
    angleMode: degreesMode,
    angleDeg: "60",
    hspanH: "",
    hspanS: "",
    craneCapacity: "",
    craneModel: "",
    boomLength: "",
    workingRadius: "",
    counterweight: "",
  };
}

export const PICK_TAPE_KEY = "crane-pick-history";

export const cardStyle: Record<string, string | number> = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  overflow: "hidden",
};

export const inputStyle: Record<string, string | number> = {
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

export const selectStyle: Record<string, string | number> = {
  ...inputStyle,
  padding: "9px 12px",
  cursor: "pointer",
};

export const labelStyle: Record<string, string | number> = {
  ...mono,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  marginBottom: 6,
  display: "block",
};

export const STATUS_COLOR: Record<string, string> = {
  green: "var(--status-success-bright)",
  yellow: "var(--status-warning-bright)",
  red: "var(--status-error-bright)",
};

export const ANGLE_MODES = {
  DEGREES: "degrees",
  HEIGHT_SPAN: "height-span",
} as const;

export const ANGLE_PRESETS = [30, 45, 60, 90] as const;
