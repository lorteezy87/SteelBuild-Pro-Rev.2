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
 *     1926.1431    — hoisting personnel (≤ 50% of rated capacity)
 *     1926.251     — rigging equipment
 *   Subpart CC does NOT define a critical lift by percentage. The 75% / 90%
 *   bands below are common contractor lift-planning thresholds (ASME P30.1
 *   leaves the number to the employer's policy; USACE EM 385-1-1 uses 75%).
 *   An earlier version cited "1926.1431(k)" for the 90% band — 1926.1431 is
 *   the personnel-hoisting section and sets no such threshold.
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
 * Number of sling legs that may be ASSUMED to carry load, for a given leg
 * count on a rigid load.
 *
 *   1 leg  → 1
 *   2 legs → 2
 *   4 legs → 2   ← NOT 4
 *
 * The 4-leg case is the one that matters and the one this module previously
 * got wrong. A four-leg bridle on a RIGID load (which is what structural steel
 * is — a beam, a column, a braced frame, a stair tower) cannot equalize. The
 * load will not flex to bring all four legs into bearing, so manufacturing
 * tolerance in sling length and any small CG offset put essentially the whole
 * load into two diagonally opposite legs while the other two float.
 *
 * ASME B30.9 and every rigging handbook say the same thing: for a bridle on a
 * rigid load, assume only TWO legs carry the load unless the rigging is
 * positively equalized (an equalizer sheave/block) or the load is flexible.
 *
 * Dividing by 4 under-predicted tension per leg by a factor of 2. On a 20,000 lb
 * pick at 60° that is 5,774 lb reported against 11,547 lb actual — enough to put
 * a rigger on a sling rated well below the real load while the tool showed
 * green. This is the conservative assumption and it is not configurable.
 */
export function loadBearingLegs(numLegs) {
  const legs = Number(numLegs);
  if (legs === 1) return 1;
  if (legs === 2) return 2;
  if (legs === 4) return 2; // rigid-load assumption — see above
  return NaN;
}

/**
 * Tension per sling leg for a symmetric pick.
 *
 *   Tension per leg = (Total Load / loadBearingLegs) · LAF
 *                   = (Total Load / loadBearingLegs) / sin(θ)
 *
 *   totalLoad     — lb on the hook
 *   numLegs       — 1 (single vertical), 2, or 4
 *   angleDegrees  — sling angle from horizontal, 0 < θ ≤ 90
 *
 * NOTE the divisor is loadBearingLegs(numLegs), not numLegs. A 4-leg bridle
 * divides by 2, not 4 — see loadBearingLegs() for why. A 2-leg and a 4-leg
 * bridle at the same angle therefore report the SAME tension per leg, which is
 * correct and is what a lift plan should show.
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

  const bearing = loadBearingLegs(legs);
  if (!Number.isFinite(bearing) || bearing <= 0) return NaN;

  const laf = calculateLAF(angleDegrees);
  if (!Number.isFinite(laf)) return NaN;
  return (load / bearing) * laf;
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
 *   > 90%     → red     (critical-lift territory under most contractor
 *                        lift-planning policies — engineered lift plan
 *                        or additional sign-off; see header for sources)
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
 * True when the planned load EXCEEDS rated capacity outright (>100%).
 *
 * getCapacityStatus() already returns "red" above 90%, so an overload and a
 * 91% critical lift were rendered identically. They are not the same thing:
 * one needs an engineered lift plan, the other needs a different crane or a
 * shorter radius. Callers use this to say so.
 */
export function isOverCapacity(utilizationPercent) {
  const p = Number(utilizationPercent);
  return Number.isFinite(p) && p > 100;
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
  // A sling angle is measured from HORIZONTAL, so >90° or <=0° is not a
  // physical configuration. This used to fall through to "green", so a
  // transposed height/span entry (or a bad protractor read) showed the safest
  // possible status for an input the math can't even evaluate.
  if (a <= 0 || a > 90) return null;
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
 *   { angleStatus, capacityStatus, angleDegrees, utilizationPercent,
 *     numLegs, liftType }   liftType: "standard" (default) | "personnel"
 */
export function buildWarnings({ angleStatus, capacityStatus, angleDegrees, utilizationPercent, numLegs, liftType = "standard" }) {
  const out = [];
  if (angleStatus === "red") {
    out.push({
      severity: "red",
      message: `Sling angle ${Number(angleDegrees).toFixed(1)}° is below 30° — unsafe configuration. Reduce sling length or widen pick points to raise angle.`,
    });
  }
  // An outright overload is a different problem from a 90–100% critical lift:
  // one needs a different crane or radius, the other needs an engineered plan.
  // Both were previously rendered with the same "critical lift" message.
  if (isOverCapacity(utilizationPercent)) {
    out.push({
      severity: "red",
      message: `OVERLOAD — ${Number(utilizationPercent).toFixed(1)}% of rated capacity. The load exceeds the chart. Do not lift: change crane, shorten radius, reduce rigging weight, or break the pick down.`,
    });
  } else if (capacityStatus === "red") {
    out.push({
      severity: "red",
      message: liftType === "personnel"
        ? `Capacity utilization ${Number(utilizationPercent).toFixed(1)}% exceeds 50% — a personnel platform plus rigging may not exceed 50% of rated capacity (29 CFR 1926.1431). Do not hoist personnel in this configuration.`
        : `Capacity utilization ${Number(utilizationPercent).toFixed(1)}% exceeds 90% — critical lift territory. Most contractor lift-planning policies (ASME P30.1) require an engineered critical-lift plan and sign-off at this level.`,
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
      message: liftType === "personnel"
        ? `Capacity utilization ${Number(utilizationPercent).toFixed(1)}% is within 10 points of the 50% personnel-hoisting limit. Confirm platform, occupant and tool weights before the trial lift.`
        : `Capacity utilization ${Number(utilizationPercent).toFixed(1)}% is in the 75–90% range. Double-check crane load chart entry, boom length, radius, and counterweight configuration.`,
    });
  }
  // State the rigid-load assumption on the face of the output. A rigger reading
  // "tension per leg" off a 4-leg bridle will otherwise assume the load was
  // split four ways, and has no way to tell from the number that it wasn't.
  if (Number(numLegs) === 4) {
    out.push({
      severity: "yellow",
      message: "Four-leg bridle on a rigid load: tension is calculated assuming only TWO legs carry (ASME B30.9). Without a positive equalizer the other two cannot be relied on. Rate every leg for the full value shown.",
    });
  }
  return out;
}
