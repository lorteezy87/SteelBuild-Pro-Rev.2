/**
 * Pure format / summary helpers for Crane Pick Calculator.
 */

export const STATUS_LABEL = {
  green:  "OK",
  yellow: "CAUTION",
  red:    "CRITICAL",
};

const mono = { fontFamily: "var(--font-mono)" };

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
