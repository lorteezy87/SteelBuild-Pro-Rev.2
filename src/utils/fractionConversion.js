/**
 * fractionConversion.js
 *
 * Pure math helpers for the Decimal ↔ Fraction Converter. Used during
 * shop-drawing, submittal, and embed-book reviews to cross-reference
 * engineer-supplied decimal dimensions against detailer fractional
 * dimensions.
 *
 * CONVENTIONS
 *   - `precision` is the fractional denominator: 8, 16, 32 (and 4 as a
 *     fallback). AISC shop-standard is 1/16" primary, with 1/32" used
 *     on tight embeds and 1/8" used on rough framing.
 *   - All functions return strings for display paths so the caller
 *     doesn't have to re-decide "do I render em-dash for null?".
 *   - Negative inputs return null (the UI rejects them with a flagged
 *     error message rather than silently stripping the sign).
 *
 * UNIT TEST TARGETS (see __tests__/fractionConversion.test.js)
 *   decimalFeetToFtIn(12.375, 16)    → "12'-4 1/2\""
 *   decimalInchesToFraction(0.125, 16) → "1/8\""
 *   decimalInchesToFraction(0.333, 16) → "5/16\""
 *   reduceFraction(8, 16)             → { num: 1, den: 2 }
 *   ftInToDecimalFeet(12, 4, 1, 2)    → 12.375
 */

/** Euclidean GCD, used to reduce a fraction to lowest terms. */
function gcd(a, b) {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

/**
 * Reduce num/den to lowest terms.
 *   reduceFraction(8, 16) → { num: 1, den: 2 }
 *   reduceFraction(0, 16) → { num: 0, den: 1 }   (any zero normalizes)
 *
 * Returns `null` if den ≤ 0 or either input is non-finite.
 */
export function reduceFraction(num, den) {
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d)) return null;
  if (d <= 0) return null;
  if (n === 0) return { num: 0, den: 1 };
  const g = gcd(Math.round(n), Math.round(d));
  return { num: Math.round(n) / g, den: Math.round(d) / g };
}

/**
 * Convert a decimal inch value into a rounded fractional string.
 *
 *   decimalInchesToFraction(0.125, 16)   → "1/8\""
 *   decimalInchesToFraction(0.333, 16)   → "5/16\""
 *   decimalInchesToFraction(2.75, 16)    → "2 3/4\""
 *   decimalInchesToFraction(0, 16)       → "0\""
 *
 * Rounding: the decimal is multiplied by `precision`, rounded to the
 * nearest integer tick, then reduced. If rounding pushes us to a full
 * inch (e.g. 0.999" at 1/16 precision → 16/16 = 1), we carry into the
 * whole-inch portion.
 *
 * Returns null on invalid input (negative or non-finite).
 */
export function decimalInchesToFraction(decimalInches, precision = 16) {
  const v = Number(decimalInches);
  const p = Number(precision);
  if (!Number.isFinite(v) || v < 0) return null;
  if (![4, 8, 16, 32].includes(p)) return null;

  // Split into whole inches and the fractional remainder.
  let whole = Math.floor(v);
  const rem = v - whole;

  // Round the remainder to the nearest 1/precision tick.
  let numer = Math.round(rem * p);

  // Handle carry into the whole part (e.g. 0.999 → 16/16 at p=16).
  if (numer === p) {
    whole += 1;
    numer = 0;
  }

  if (numer === 0) {
    return whole === 0 ? `0"` : `${whole}"`;
  }

  const { num, den } = reduceFraction(numer, p);
  if (whole === 0) return `${num}/${den}"`;
  return `${whole} ${num}/${den}"`;
}

/**
 * Convert a decimal-feet value (e.g. 12.375) into "12'-4 1/2\"" style.
 *
 *   decimalFeetToFtIn(12.375, 16)  → "12'-4 1/2\""
 *   decimalFeetToFtIn(8, 16)       → "8'-0\""
 *   decimalFeetToFtIn(0.5, 16)     → "0'-6\""
 *
 * Rounds the fractional portion to the requested precision before
 * carrying — the same carry logic as decimalInchesToFraction — so you
 * don't get "11'-11 16/16\"" out. Negative inputs return null.
 */
export function decimalFeetToFtIn(decimalFeet, precision = 16) {
  const v = Number(decimalFeet);
  const p = Number(precision);
  if (!Number.isFinite(v) || v < 0) return null;
  if (![4, 8, 16, 32].includes(p)) return null;

  // Whole feet + remaining inches
  let feet = Math.floor(v);
  let inches = (v - feet) * 12;

  // Round inches to the nearest 1/p tick and re-split whole/frac.
  const totalTicks = Math.round(inches * p);
  let wholeInches = Math.floor(totalTicks / p);
  let numer = totalTicks % p;

  // Carry whole inches into feet if we rounded up to 12".
  if (wholeInches === 12) {
    feet += 1;
    wholeInches = 0;
  }

  if (numer === 0) {
    return `${feet}'-${wholeInches}"`;
  }
  const { num, den } = reduceFraction(numer, p);
  if (wholeInches === 0) return `${feet}'-${num}/${den}"`;
  return `${feet}'-${wholeInches} ${num}/${den}"`;
}

/**
 * Convert explicit ft / in / numerator / denominator into decimal feet.
 *
 *   ftInToDecimalFeet(12, 4, 1, 2) → 12.375
 *   ftInToDecimalFeet(0, 6, 0, 1)  → 0.5
 *
 * Any individual part may be null / undefined / "" → treated as 0. A
 * malformed denominator (0, negative, non-finite) returns null.
 */
export function ftInToDecimalFeet(feet, inches, numerator, denominator) {
  const f = numOrZero(feet);
  const i = numOrZero(inches);
  const n = numOrZero(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(d) || d <= 0) return null;

  if (f < 0 || i < 0 || n < 0) return null;
  const totalInches = i + (n / d);
  return f + totalInches / 12;
}

/**
 * Convert explicit ft / in / numerator / denominator into decimal inches.
 * Same rules as ftInToDecimalFeet but the result is inches (not divided
 * by 12). Useful when callers want both views side-by-side without a
 * re-multiply.
 */
export function ftInToDecimalInches(feet, inches, numerator, denominator) {
  const d = Number(denominator);
  if (!Number.isFinite(d) || d <= 0) return null;

  const f = numOrZero(feet);
  const i = numOrZero(inches);
  const n = numOrZero(numerator);
  if (f < 0 || i < 0 || n < 0) return null;

  return f * 12 + i + (n / d);
}

/**
 * Compute the rounding error introduced by snapping a decimal value to
 * the nearest 1/precision tick. Returns a signed delta in the SAME
 * units as the input (inches-in → inches-out, feet-in → feet-out) so
 * the UI doesn't have to guess.
 *
 *   roundingDelta(0.333, 16, "inches")
 *     → +0.0045 (actual value minus rounded 5/16" = 0.3125")
 *
 * unit: "inches" | "feet"
 * Returns null on invalid input.
 */
export function roundingDelta(decimal, precision, unit = "inches") {
  const v = Number(decimal);
  const p = Number(precision);
  if (!Number.isFinite(v) || v < 0) return null;
  if (![4, 8, 16, 32].includes(p)) return null;

  let roundedInches;
  if (unit === "feet") {
    const totalTicks = Math.round(v * 12 * p);
    roundedInches = totalTicks / p;
    return v - roundedInches / 12;
  }
  // inches mode
  const totalTicks = Math.round(v * p);
  roundedInches = totalTicks / p;
  return v - roundedInches;
}

// ── Internal helpers ───────────────────────────────────────────────
function numOrZero(raw) {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
