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
 *        precision  — fractional denominator; must be a positive integer
 *                     (16 = nearest 1/16"). Coerced with Number().
 *        prefix     — rendered outside the sign (e.g. "~" for uncalibrated).
 *        emptyLabel — returned bare, without prefix, on invalid input.
 * @returns {string}
 */
export function formatFeetInches(decimalInches, opts = {}) {
  const { precision = 16, prefix = "", emptyLabel = "—" } = opts;

  const value = Number(decimalInches);
  const ticksPerInch = Number(precision);
  if (!Number.isFinite(value)) return emptyLabel;
  // Non-integer denominators are silently re-rounded by reduceFraction, which
  // would print a fraction that doesn't match the value we rounded to.
  if (!Number.isInteger(ticksPerInch) || ticksPerInch <= 0) return emptyLabel;

  const magnitude = Math.abs(value);
  // Round to ticks first — this is what makes the foot-carry fall out for free.
  const totalTicks = Math.round(magnitude * ticksPerInch);
  // Sign is decided AFTER rounding: -0.01" rounds to zero ticks and must print
  // 0", not -0".
  const sign = value < 0 && totalTicks > 0 ? "-" : "";

  const wholeInches = Math.floor(totalTicks / ticksPerInch);
  const remainderTicks = totalTicks - wholeInches * ticksPerInch;

  const reduced = reduceFraction(remainderTicks, ticksPerInch);
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
