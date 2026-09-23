/**
 * groundBearing.ts — will the ground hold the outrigger?
 *
 * More crane upsets start at the ground than at the load chart: a crane well
 * inside its chart still goes over when an outrigger punches through. The
 * check is simple — the load on one outrigger (or track), plus the mat's own
 * weight, spread over the mat's area, against what the soil can carry.
 *
 * TWO INPUTS THIS MODULE DOES NOT INVENT
 *   - The outrigger reaction. It depends on the crane's own weight and centre
 *     of gravity, counterweight, slew angle and load, and only the
 *     manufacturer's outrigger-load data (chart or calculator) gives it. Use
 *     the MAXIMUM single-outrigger load for the slew range of the lift, not
 *     the average — the load swings onto one float as the boom passes over it.
 *   - The allowable bearing. A geotechnical engineer's value for the actual
 *     set-up location governs. The presumptive values below are for planning.
 *
 * UNIFORM PRESSURE ASSUMPTION
 *   pressure = load / area assumes the mat is stiff enough to spread the load
 *   over its whole footprint. A flexible or undersized timber mat under a
 *   small outrigger float does not — it bends, and the pressure concentrates
 *   near the float. For a mat much larger than the float, have the mat's
 *   effective bearing area checked; the full footprint overstates it.
 */

export interface GroundBearingInput {
  /** Maximum single-outrigger (or track) reaction, lb. */
  outriggerReaction: number;
  /** Mat or pad self-weight bearing on the soil, lb (≥ 0). */
  matWeight: number;
  /** Mat / pad footprint, ft. */
  padLength: number;
  padWidth: number;
  /** Allowable soil bearing pressure, psf. */
  allowableBearing: number;
}

export interface GroundBearingResult {
  /** Load reaching the soil through this mat, lb. */
  totalLoad: number;
  /** Mat footprint, ft². */
  area: number;
  /** Average bearing pressure under the mat, psf. */
  pressure: number;
  /** pressure / allowable · 100. */
  utilization: number;
  /** Footprint needed at the allowable bearing (with the entered mat weight), ft². */
  requiredArea: number;
  /** Side of a square mat giving that area, ft. */
  requiredSquareSide: number;
  status: "green" | "yellow" | "red";
}

/**
 * Bearing pressure under one outrigger mat. Returns null unless the reaction,
 * both dimensions and the allowable are > 0 and the mat weight is ≥ 0.
 *
 * Status: > 100% of allowable is red; ≥ 90% is yellow — within 10% of the
 * allowable leaves little room for soft spots or a wet day, and that band is
 * a planning margin, not a code threshold.
 */
export function groundBearing(input: GroundBearingInput): GroundBearingResult | null {
  const { outriggerReaction, matWeight, padLength, padWidth, allowableBearing } = input;
  const all = [outriggerReaction, matWeight, padLength, padWidth, allowableBearing];
  if (!all.every(Number.isFinite)) return null;
  if (!(outriggerReaction > 0) || !(padLength > 0) || !(padWidth > 0) || !(allowableBearing > 0) || matWeight < 0) return null;

  const totalLoad = outriggerReaction + matWeight;
  const area = padLength * padWidth;
  const pressure = totalLoad / area;
  const utilization = (pressure / allowableBearing) * 100;
  const requiredArea = totalLoad / allowableBearing;
  return {
    totalLoad,
    area,
    pressure,
    utilization,
    requiredArea,
    requiredSquareSide: Math.sqrt(requiredArea),
    status: utilization > 100 ? "red" : utilization >= 90 ? "yellow" : "green",
  };
}

export interface PresumptiveBearing {
  soil: string;
  /** Allowable bearing, psf. */
  psf: number;
}

/**
 * IBC Table 1806.2 presumptive load-bearing values (allowable foundation
 * pressure, psf) — a starting point for PLANNING only.
 *
 * They assume undisturbed native soil of the stated class. Fill, backfill,
 * trench lines, soft or saturated ground, and anything over a void have no
 * presumptive value at all; a crane on any of those needs a geotechnical
 * allowable, and mats sized from these numbers are not a substitute.
 */
export const IBC_PRESUMPTIVE_BEARING: PresumptiveBearing[] = [
  { soil: "Crystalline bedrock", psf: 12000 },
  { soil: "Sedimentary and foliated rock", psf: 4000 },
  { soil: "Sandy gravel and/or gravel (GW, GP)", psf: 3000 },
  { soil: "Sand, silty sand, clayey sand, silty/clayey gravel (SW, SP, SM, SC, GM, GC)", psf: 2000 },
  { soil: "Clay, sandy/silty clay, clayey silt, silt, sandy silt (CL, ML, MH, CH)", psf: 1500 },
];
