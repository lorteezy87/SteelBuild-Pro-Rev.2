/**
 * feetInches.js — the canonical formatter for a MEASURED length.
 *
 * Input is decimal INCHES (what the drawing viewer has after multiplying
 * page-inches by drawings.markup_scale). Output is how a PM reads a dimension
 * off a shop drawing:
 *
 *   formatFeetInches(6.5)   → '6 1/2"'      (under 12" → bare inches)
 *   formatFeetInches(174)   → `14'-6"`      (12"+ → feet-inches)
 *   formatFeetInches(11.97) → `1'-0"`       (rounding carries into feet)
 *
 * Why this exists alongside three other length helpers: formatLength takes
 * integer 1/32" ticks and always shows feet; decimalFeetToFtIn takes decimal
 * FEET and always shows feet; decimalInchesToFraction takes inches and never
 * shows feet. None matches the viewer's contract. Do not add a fifth.
 *
 * The one subtlety: round to ticks BEFORE deciding which side of 12" we are
 * on. Branching on the raw value makes 11.97" print as 12" rather than 1'-0".
 */

import { reduceFraction } from "./fractionConversion";

/**
 * @param {number} decimalInches
 * @param {{ precision?: number, prefix?: string, emptyLabel?: string }} [opts]
 *        precision  — fractional denominator; 16 = nearest 1/16". Must be > 0.
 *        prefix     — rendered outside the sign (e.g. "~" for uncalibrated).
 *        emptyLabel — returned bare, without prefix, on invalid input.
 * @returns {string}
 */
export function formatFeetInches(decimalInches, opts = {}) {
  const { precision = 16, prefix = "", emptyLabel = "—" } = opts;

  const value = Number(decimalInches);
  if (!Number.isFinite(value)) return emptyLabel;
  if (!Number.isFinite(precision) || precision <= 0) return emptyLabel;

  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);

  // Round to ticks first — this is what makes the foot-carry fall out for free.
  const totalTicks = Math.round(magnitude * precision);
  const wholeInches = Math.floor(totalTicks / precision);
  const remainderTicks = totalTicks - wholeInches * precision;

  const reduced = reduceFraction(remainderTicks, precision);
  const fraction = reduced && reduced.num > 0 ? ` ${reduced.num}/${reduced.den}` : "";

  let body;
  if (wholeInches < 12) {
    // Always show the integer, including 0 — `0 3/16"` reads better on a
    // detail than a bare `3/16"`.
    body = `${wholeInches}${fraction}"`;
  } else {
    const feet = Math.floor(wholeInches / 12);
    const inches = wholeInches % 12;
    body = `${feet}'-${inches}${fraction}"`;
  }

  return `${prefix}${sign}${body}`;
}
