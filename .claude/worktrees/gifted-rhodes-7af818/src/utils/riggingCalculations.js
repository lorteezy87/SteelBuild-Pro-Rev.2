/**
 * riggingCalculations.js
 *
 * Pure math helpers for the Crane Pick Calculator. All functions are
 * side-effect-free so they can be unit-tested (or reused elsewhere —
 * lift-plan PDFs, pre-lift emails, etc.) without touching the DOM.
 *
 * REFERENCES
 *   ASME B30.9-2021  — Slings (sling-angle / LAF / capacity relations)
 *   ASME B30.5-2018  — Mobile and Locomotive Cranes
 *   OSHA 29 CFR 1926.1400 subpart CC — Cranes and Derricks in Construction
 *     1926.1431(k) — critical lift ≈ >90% of rated capacity
 *     1926.251     — rigging equipment
 *
 * SCOPE (v1)
 *   Symmetric picks only — equal-leg bridle, centered center-of-gravity.
 *
 * NOT IN SCOPE (future enhancements)
 *   - Asymmetric picks (unequal leg lengths or offset CG) — each leg
 *     takes a different load share and the per-leg formula below is
 *     no longer valid. Flagged in-code so callers don't mis-use.
 *   - Spreader-bar rigging (legs run vertical to the bar, bar takes
 *     bending — different geometry).
 *   - Multi-crane (tandem) picks.
 *
 *   None of the above are supported here. The UI constrains legs to
 *   {1, 2, 4} and assumes symmetric geometry.
 */

/** Convert degrees → radians (local helper so we don't pull in anything). */
const degToRad = (deg) => (deg * Math.PI) / 180;

/**
 * Total load on the hook = piece weight + rigging weight.
 *
 *   pieceWeight    — lb, positive
 *   riggingWeight  — lb, >= 0 (slings, shackles, spreader, chokers, tag lines)
 *
 * Returns NaN if either input is not a finite number.
 */
export function calculateTotalLoad(pieceWeight, riggingWeight) {
  const p = Number(pieceWeight);
  const r = Number(riggingWeight);
  if (!Number.isFinite(p) || !Number.isFinite(r)) return NaN;
  return p + r;
}

/**
 * Load Angle Factor (LAF) from sling angle θ measured from horizontal.
 *
 *   LAF = 1 / sin(θ)
 *
 * Reference points (memorize these — they show up in JHAs and lift plans):
 *   90° vertical → LAF 1.000
 *   60°          → LAF 1.155
 *   45°          → LAF 1.414
 *   30°          → LAF 2.000    ← industry minimum safe angle
 *
 *   angleDegrees — 0 < θ ≤ 90; values outside that range return NaN.
 */
export function calculateLAF(angleDegrees) {
  const a = Number(angleDegrees);
  if (!Number.isFinite(a) || a <= 0 || a > 90) return NaN;
  const s = Math.sin(degToRad(a));
  if (s <= 0) return NaN;
  return 1 / s;
}

/**
 * Tension per sling leg for a symmetric pick.
 *
 *   Tension per leg = (Total Load / numLegs) · LAF
 *                   = (Total Load / numLegs) / sin(θ)
 *
 *   totalLoad     — lb on the hook
 *   numLegs       — 1 (single vertical), 2, or 4
 *   angleDegrees  — sling angle from horizontal, 0 < θ ≤ 90
 *
 * For a single-leg vertical pick (numLegs === 1), angle is treated as
 * 90° regardless of what the caller passed — a "vertical" pick has no
 * angle. Returns NaN for invalid inputs.
 */
export function calculateSlingTension(totalLoad, numLegs, angleDegrees) {
  const load = Number(totalLoad);
  const legs = Number(numLegs);
  if (!Number.isFinite(load) || load <= 0) return NaN;
  if (![1, 2, 4].includes(legs)) return NaN;

  // Single-leg vertical pick — force LAF 1.000 no matter the angle input.
  if (legs === 1) return load;

  const laf = calculateLAF(angleDegrees);
  if (!Number.isFinite(laf)) return NaN;
  return (load / legs) * laf;
}

/**
 * Capacity utilization as a percentage of rated crane capacity at the
 * planned radius/configuration. Caller supplies the rated capacity from
 * the crane's load chart — this function does not look it up.
 *
 *   Utilization % = (totalLoad / craneCapacity) · 100
 *
 * Returns NaN for non-finite or non-positive capacity.
 */
export function calculateUtilization(totalLoad, craneCapacity) {
  const load = Number(totalLoad);
  const cap  = Number(craneCapacity);
  if (!Number.isFinite(load) || load < 0) return NaN;
  if (!Number.isFinite(cap)  || cap  <= 0) return NaN;
  return (load / cap) * 100;
}

/**
 * Traffic-light status for crane capacity utilization.
 *
 *   < 75%     → green   (acceptable)
 *   75–90%    → yellow  (verify crane load chart before lift)
 *   > 90%     → red     (OSHA 1926.1431(k) critical-lift territory;
 *                        most contractor policies require an engineered
 *                        lift plan, tandem lift analysis, or additional
 *                        engineering sign-off)
 *
 * Returns null if the input isn't a finite number.
 */
export function getCapacityStatus(utilizationPercent) {
  const p = Number(utilizationPercent);
  if (!Number.isFinite(p)) return null;
  if (p > 90) return "red";
  if (p >= 75) return "yellow";
  return "green";
}

/**
 * Traffic-light status for sling angle.
 *
 *   > 45°     → green   (low leg tension)
 *   30°–45°   → yellow  (high tension, caution)
 *   < 30°     → red     (unsafe — ASME B30.9 minimum is commonly cited
 *                        as 30°; many contractor standards enforce 45°)
 *
 * Returns null if the input isn't a finite number.
 */
export function getAngleStatus(angleDegrees) {
  const a = Number(angleDegrees);
  if (!Number.isFinite(a)) return null;
  if (a < 30) return "red";
  if (a <= 45) return "yellow";
  return "green";
}

/**
 * Convert a "height over span" field measurement into a sling angle.
 * Useful when the rigger measures the vertical drop from hook to pick
 * point (H) and the horizontal half-span between pick points (S) with a
 * tape measure rather than a protractor.
 *
 *   angle = arctan(H / S)  (degrees, from horizontal)
 *
 * Returns NaN if either input is non-finite, negative, or if both are
 * zero (no geometry).
 */
export function angleFromHeightSpan(height, halfSpan) {
  const h = Number(height);
  const s = Number(halfSpan);
  if (!Number.isFinite(h) || !Number.isFinite(s)) return NaN;
  if (h < 0 || s < 0) return NaN;
  if (h === 0 && s === 0) return NaN;
  if (s === 0) return 90; // purely vertical
  const rad = Math.atan(h / s);
  return (rad * 180) / Math.PI;
}

/**
 * Build a list of human-readable warnings given a set of computed
 * results. Returns an array of { severity, message } — severity is
 * "red" | "yellow", ordered red first then yellow.
 *
 *   { angleStatus, capacityStatus, angleDegrees, utilizationPercent }
 */
export function buildWarnings({ angleStatus, capacityStatus, angleDegrees, utilizationPercent }) {
  const out = [];
  if (angleStatus === "red") {
    out.push({
      severity: "red",
      message: `Sling angle ${Number(angleDegrees).toFixed(1)}° is below 30° — unsafe configuration. Reduce sling length or widen pick points to raise angle.`,
    });
  }
  if (capacityStatus === "red") {
    out.push({
      severity: "red",
      message: `Capacity utilization ${Number(utilizationPercent).toFixed(1)}% exceeds 90% — critical lift territory. Engineered lift plan required per OSHA 1926.1431(k) and most contractor standards.`,
    });
  }
  if (angleStatus === "yellow") {
    out.push({
      severity: "yellow",
      message: `Sling angle ${Number(angleDegrees).toFixed(1)}° is in the 30–45° range — leg tension is significantly higher than a vertical pick. Verify sling rating before proceeding.`,
    });
  }
  if (capacityStatus === "yellow") {
    out.push({
      severity: "yellow",
      message: `Capacity utilization ${Number(utilizationPercent).toFixed(1)}% is in the 75–90% range. Double-check crane load chart entry, boom length, radius, and counterweight configuration.`,
    });
  }
  return out;
}
