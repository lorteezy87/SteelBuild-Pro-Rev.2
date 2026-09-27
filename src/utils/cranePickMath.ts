/**
 * cranePickMath.ts
 *
 * Extended, side-effect-free math for the Crane Pick Calculator. The original
 * symmetric-pick helpers stay in riggingCalculations.js; this module adds what
 * that one did not cover:
 *
 *   - strict numeric parsing (a "12,500" entry once parsed as 12 lb)
 *   - gross load for the crane chart (hook block / load-line deductions)
 *   - sling angle from sling length, and 4-leg plan geometry (diagonal reach)
 *   - two-leg bridle with an OFFSET centre of gravity (unequal leg tension)
 *   - sling / shackle utilization against the tagged working load limit
 *   - boom angle and tip height from boom length and radius
 *
 * Every function returns NaN (or null) for input it cannot evaluate, so the
 * page can gate results on Number.isFinite rather than try/catch.
 *
 * REFERENCES
 *   ASME B30.9  — Slings (angle/tension relations, rigid-load 2-leg rule)
 *   ASME B30.5  — Mobile cranes (load-chart deductions: hook block, load line,
 *                 stowed jib and rigging are all part of the load)
 *   ASME B30.26 — Rigging hardware (shackle WLL)
 *   29 CFR 1926.1431 — Hoisting personnel (platform + rigging ≤ 50% of rated
 *                 capacity at the radius and configuration)
 */

const RAD_PER_DEG = Math.PI / 180;
const DEG_PER_RAD = 180 / Math.PI;

// A comma is only accepted as a US thousands separator ("12,500" or
// "1,234,567.5"). Anything else with a comma ("12,5", "1,23") is ambiguous —
// it could be a European decimal — and a wrong guess changes a weight by
// 100x, so it is rejected rather than interpreted.
const THOUSANDS_PATTERN = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const PLAIN_NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Parse a user-typed number strictly.
 *
 * parseFloat("12,500") is 12 and parseFloat("12k") is 12 — both silently
 * understate a weight. This accepts plain numbers and correctly grouped US
 * thousands separators only; everything else returns NaN so the page can say
 * "that isn't a number" instead of computing with the wrong one.
 * Empty / whitespace-only input also returns NaN.
 */
export function parseNumericInput(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  const s = raw.trim().replace(/\s+/g, "");
  if (s === "") return NaN;
  if (s.includes(",")) {
    if (!THOUSANDS_PATTERN.test(s)) return NaN;
    return Number(s.replace(/,/g, ""));
  }
  if (!PLAIN_NUMBER_PATTERN.test(s)) return NaN;
  return Number(s);
}

/** True when the raw text is blank (distinguishes "not entered" from "invalid"). */
export function isBlankInput(raw: unknown): boolean {
  return typeof raw !== "string" || raw.trim() === "";
}

export interface GrossLoadInput {
  pieceWeight: number;
  riggingWeight: number;
  hookBlockWeight: number;
  otherDeductions: number;
}

/**
 * Gross load compared against the crane's load chart.
 *
 * Mobile-crane load charts (ASME B30.5) rate the GROSS load: the hook block or
 * headache ball, the load line below the boom tip where the chart says so, any
 * stowed or erected jib deduction, and all rigging are part of "the load". A
 * calculator that compares only piece + slings to the chart value overstates
 * the margin by the weight of the block — commonly 1,000–4,000 lb on a
 * mid-size hydraulic crane.
 *
 * All inputs lb; the three optional ones must be ≥ 0. Returns NaN otherwise.
 */
export function grossLoadForChart({ pieceWeight, riggingWeight, hookBlockWeight, otherDeductions }: GrossLoadInput): number {
  const parts = [pieceWeight, riggingWeight, hookBlockWeight, otherDeductions];
  if (parts.some((p) => !Number.isFinite(p))) return NaN;
  if (!(pieceWeight > 0)) return NaN;
  if (riggingWeight < 0 || hookBlockWeight < 0 || otherDeductions < 0) return NaN;
  return pieceWeight + riggingWeight + hookBlockWeight + otherDeductions;
}

/**
 * Sling angle (degrees from horizontal) from sling length L and the vertical
 * height H from the hook to the pick point: sin θ = H / L.
 *
 * This is the field method most riggers actually use — the sling tag gives L,
 * a tape gives H — and it yields LAF = L / H directly. Returns NaN unless
 * 0 < H ≤ L.
 */
export function angleFromSlingLength(slingLength: number, height: number): number {
  const L = Number(slingLength);
  const H = Number(height);
  if (!Number.isFinite(L) || !Number.isFinite(H)) return NaN;
  if (!(L > 0) || !(H > 0) || H > L) return NaN;
  return Math.asin(H / L) * DEG_PER_RAD;
}

/**
 * Horizontal reach from the hook plumb line to ONE pick point of a 4-leg
 * bridle on a rectangular pick-point layout.
 *
 * A leg runs to the corner, so its horizontal reach is the half-DIAGONAL,
 * √(a² + b²) with a and b the half-length and half-width. Measuring half of
 * one side instead understates the reach, overstates the sling angle, and
 * understates the leg tension.
 */
export function fourLegHorizontalReach(halfLength: number, halfWidth: number): number {
  const a = Number(halfLength);
  const b = Number(halfWidth);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return NaN;
  if (a === 0 && b === 0) return NaN;
  return Math.hypot(a, b);
}

export interface OffsetBridleResult {
  /** Leg tensions, lb — leg 1 is the leg on the d1 side. */
  tension1: number;
  tension2: number;
  /** Sling angles from horizontal, degrees. */
  angle1: number;
  angle2: number;
  /** Sling lengths in the input's length unit. */
  length1: number;
  length2: number;
  /** Share of the vertical load carried by each leg (sums to 1). */
  share1: number;
  share2: number;
}

/**
 * Two-leg bridle with the centre of gravity NOT midway between the pick
 * points.
 *
 * The hook always settles plumb over the CG. With both pick points at the same
 * elevation, a height H from the hook down to them, and horizontal distances
 * d1 and d2 from the CG to each pick point, static equilibrium gives:
 *
 *   horizontal:  T1·cos θ1 = T2·cos θ2
 *   vertical:    T1·sin θ1 + T2·sin θ2 = W
 *
 *   ⇒  T1 = W · d2 · L1 / (H · (d1 + d2))
 *       T2 = W · d1 · L2 / (H · (d1 + d2))      with Li = √(di² + H²)
 *
 * The leg CLOSER to the CG (smaller d) is both steeper and more heavily loaded.
 * With d1 = d2 this reduces to the symmetric W / (2 sin θ).
 *
 *   load  — lb carried by the slings (> 0)
 *   H     — hook-to-pick-point height (> 0), any length unit
 *   d1,d2 — horizontal CG-to-pick-point distances (> 0), same unit as H
 */
export function offsetTwoLegBridle(load: number, H: number, d1: number, d2: number): OffsetBridleResult | null {
  const W = Number(load);
  if (![W, H, d1, d2].every(Number.isFinite)) return null;
  if (!(W > 0) || !(H > 0) || !(d1 > 0) || !(d2 > 0)) return null;
  const L1 = Math.hypot(d1, H);
  const L2 = Math.hypot(d2, H);
  const span = d1 + d2;
  return {
    tension1: (W * d2 * L1) / (H * span),
    tension2: (W * d1 * L2) / (H * span),
    angle1: Math.atan(H / d1) * DEG_PER_RAD,
    angle2: Math.atan(H / d2) * DEG_PER_RAD,
    length1: L1,
    length2: L2,
    share1: d2 / span,
    share2: d1 / span,
  };
}

/**
 * Percent of a rated working load limit used: demand / WLL · 100.
 * Used for both the sling (at the hitch actually rigged) and the shackle.
 * Returns NaN if either is non-positive or non-finite.
 */
export function wllUtilization(demand: number, wll: number): number {
  const d = Number(demand);
  const w = Number(wll);
  if (!Number.isFinite(d) || !Number.isFinite(w) || d < 0 || w <= 0) return NaN;
  return (d / w) * 100;
}

/**
 * Status for a sling or shackle against its WLL. Unlike the crane, rigging
 * gear has no "critical lift" band — above 100% is simply overloaded.
 *   ≤ 80% green · 80–100% yellow · > 100% red
 */
export function getRiggingStatus(utilizationPercent: number): "green" | "yellow" | "red" | null {
  const p = Number(utilizationPercent);
  if (!Number.isFinite(p)) return null;
  if (p > 100) return "red";
  if (p > 80) return "yellow";
  return "green";
}

export interface BoomGeometry {
  /** Boom angle from horizontal, degrees. */
  boomAngle: number;
  /** Boom tip height above the boom foot pin, ft. */
  tipHeightAboveFoot: number;
}

/**
 * Boom angle and tip height from boom length and working radius.
 *
 *   cos α = (R − offset) / Lb,   tip height above foot = Lb · sin α
 *
 * `footOffset` is the horizontal distance from the centre of rotation to the
 * boom foot pin (a few feet on most hydraulic cranes; 0 if unknown). This is a
 * geometric approximation for planning and the 3D view — it ignores boom
 * deflection, which on a long telescopic boom increases the loaded radius.
 * Returns null when the radius cannot be reached with that boom.
 */
export function boomGeometry(boomLength: number, radius: number, footOffset = 0): BoomGeometry | null {
  const Lb = Number(boomLength);
  const R = Number(radius);
  const off = Number(footOffset);
  if (![Lb, R, off].every(Number.isFinite)) return null;
  if (!(Lb > 0) || !(R > 0) || off < 0) return null;
  const horiz = R - off;
  if (horiz <= 0 || horiz > Lb) return null;
  const alpha = Math.acos(horiz / Lb);
  return {
    boomAngle: alpha * DEG_PER_RAD,
    tipHeightAboveFoot: Lb * Math.sin(alpha),
  };
}

/** Degrees → radians (exported for the 3D view so it shares one convention). */
export function degToRad(deg: number): number {
  return deg * RAD_PER_DEG;
}

export type LiftType = "standard" | "personnel";

/**
 * Traffic-light status for crane utilization, by lift type.
 *
 * standard  — < 75% green, 75–90% yellow, > 90% red. These are the common
 *             CONTRACTOR critical-lift thresholds (ASME P30.1 leaves the
 *             number to the lift-planning policy; USACE EM 385-1-1 uses 75%).
 *             OSHA Subpart CC does not define a percentage for a critical
 *             lift, so no OSHA paragraph is cited for them.
 * personnel — 29 CFR 1926.1431: the loaded platform plus rigging must not
 *             exceed 50% of rated capacity. > 50% red, 40–50% yellow.
 */
export function getCapacityStatusForLift(utilizationPercent: number, liftType: LiftType): "green" | "yellow" | "red" | null {
  const p = Number(utilizationPercent);
  if (!Number.isFinite(p)) return null;
  if (liftType === "personnel") {
    if (p > 50) return "red";
    if (p >= 40) return "yellow";
    return "green";
  }
  if (p > 90) return "red";
  if (p >= 75) return "yellow";
  return "green";
}

export interface PickWarning {
  severity: "red" | "yellow";
  message: string;
}

export interface ExtendedWarningInput {
  /** Highest sling-leg tension as % of the sling's tagged WLL at the hitch used (NaN = not entered). */
  slingUtilization: number;
  /** Highest sling-leg tension as % of the shackle WLL (NaN = not entered). */
  shackleUtilization: number;
  /** Whether a hook block / ball weight (> 0) was entered. */
  hookBlockEntered: boolean;
  /** Offset-CG bridle result, when that mode is in use. */
  offset: OffsetBridleResult | null;
}

/**
 * Warnings for the checks this module adds, in the same { severity, message }
 * shape as riggingCalculations.buildWarnings so the page can concatenate them.
 * Reds come first.
 */
export function buildExtendedWarnings({ slingUtilization, shackleUtilization, hookBlockEntered, offset }: ExtendedWarningInput): PickWarning[] {
  const red: PickWarning[] = [];
  const yellow: PickWarning[] = [];
  const gear = (label: string, p: number, advice: string) => {
    const s = getRiggingStatus(p);
    if (s === "red") red.push({ severity: "red", message: `${label} OVERLOADED — ${p.toFixed(1)}% of WLL. ${advice}` });
    else if (s === "yellow") yellow.push({ severity: "yellow", message: `${label} at ${p.toFixed(1)}% of WLL — little margin for sling-length tolerance or a dynamic snatch.` });
  };
  gear("Sling", slingUtilization, "Use a higher-rated sling, raise the sling angle, or add legs with an equalizer.");
  gear("Shackle", shackleUtilization, "Use the next shackle size up.");

  if (offset) {
    const heavy = offset.tension1 >= offset.tension2 ? 1 : 2;
    const share = (heavy === 1 ? offset.share1 : offset.share2) * 100;
    if (share > 60) {
      yellow.push({
        severity: "yellow",
        message: `Offset CG: leg ${heavy} carries ${share.toFixed(0)}% of the vertical load. Size every sling for the higher leg tension, and confirm the CG location before rigging — an error here moves load onto the short leg.`,
      });
    }
    const flat = Math.min(offset.angle1, offset.angle2);
    if (flat < 30) {
      red.push({
        severity: "red",
        message: `Offset CG: the long leg is at ${flat.toFixed(1)}° — below 30°. Lengthen the sling or move the pick points.`,
      });
    }
  }

  if (!hookBlockEntered) {
    yellow.push({
      severity: "yellow",
      message: "No hook block / ball weight entered. Load charts rate the GROSS load — include the block, and any load-line or jib deduction the chart notes require, or utilization is understated.",
    });
  }
  return [...red, ...yellow];
}
