// lengthMath.js — 32nd-inch tick math (extracted from FeetInchesCalculator).

// All internal math in 32nds of an inch. 1 foot = 12 * 32 = 384 ticks.
export const TICKS_PER_INCH = 32;
export const TICKS_PER_FOOT = 12 * TICKS_PER_INCH;

// ── Parsing ─────────────────────────────────────────────────────────
/**
 * Parse a user-entered length into whole 32nd-inch ticks.
 * Returns null on unparseable input.
 *
 * Accepted forms (whitespace-insensitive):
 *   "12'6 1/2\""        →  12 ft 6-1/2 in
 *   "12' 6-1/2\""
 *   "12-6-1/2"          (dash-separated, common jobsite shorthand)
 *   "12 6 1/2"
 *   "12'"               →  12 ft 0 in
 *   "6 1/2\""           →  0 ft 6-1/2 in
 *   "6.5\""             →  0 ft 6.5 in
 *   "150.5in" / "150.5\"" / "150.5"  →  treated as inches if < 100-ish? no —
 *       If there is no foot marker and value is a bare decimal, we treat
 *       it as inches (user habit — type "6.5" for six and a half inches).
 *   "8.25ft"            →  explicit decimal feet
 */
export function parseLength(raw) {
  if (raw == null) return null;
  const s0 = String(raw).trim();
  if (!s0) return null;

  // Replace unicode prime / double-prime with ASCII
  let s = s0.replace(/[′ʹ]/g, "'").replace(/[″ʺ]/g, '"');

  // Bare-number shortcut with explicit ft suffix
  const mFt = s.match(/^([-+]?\d+(?:\.\d+)?)\s*(?:ft|FT|feet)$/);
  if (mFt) {
    const feet = parseFloat(mFt[1]);
    if (!Number.isFinite(feet)) return null;
    return Math.round(feet * TICKS_PER_FOOT);
  }

  // Bare-number shortcut with explicit in suffix
  const mIn = s.match(/^([-+]?\d+(?:\.\d+)?)\s*(?:in|IN|inches?|")$/);
  if (mIn) {
    const inches = parseFloat(mIn[1]);
    if (!Number.isFinite(inches)) return null;
    return Math.round(inches * TICKS_PER_INCH);
  }

  // Bare plain number → inches (jobsite habit)
  if (/^[-+]?\d+(?:\.\d+)?$/.test(s)) {
    const inches = parseFloat(s);
    return Math.round(inches * TICKS_PER_INCH);
  }

  // Negative sign handling — strip it and re-apply at end
  let sign = 1;
  if (s.startsWith("-")) { sign = -1; s = s.slice(1).trim(); }
  else if (s.startsWith("+")) { s = s.slice(1).trim(); }

  // Normalize dash-separated ("12-6-1/2") by swapping dashes to spaces —
  // but only AFTER we've stripped a leading minus.
  s = s.replace(/-/g, " ").replace(/\s+/g, " ").trim();

  // Now try to extract feet (number followed by ') and the rest.
  let feet = 0;
  let rest = s;
  const mFeet = rest.match(/^(\d+(?:\.\d+)?)\s*'\s*(.*)$/);
  if (mFeet) {
    feet = parseFloat(mFeet[1]);
    rest = mFeet[2].trim();
  } else if (/'/.test(rest)) {
    // Malformed (contains ' but not at a valid spot)
    return null;
  } else {
    // No foot marker — could still be "12 6 1/2" without the tick.
    // If there are 2+ space-separated tokens AND the first token is an
    // integer, treat it as feet.
    const parts = rest.split(" ");
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
      feet = parseInt(parts[0], 10);
      rest = parts.slice(1).join(" ");
    }
  }

  // Strip trailing inch mark if present
  rest = rest.replace(/["]$/, "").trim();

  // rest is now "" or "6" or "6.5" or "6 1/2" or "1/2"
  let inches = 0;
  if (rest) {
    const partsR = rest.split(" ");
    if (partsR.length === 1) {
      const tok = partsR[0];
      if (tok.includes("/")) {
        inches = parseFraction(tok);
        if (inches == null) return null;
      } else if (/^\d+(?:\.\d+)?$/.test(tok)) {
        inches = parseFloat(tok);
      } else {
        return null;
      }
    } else if (partsR.length === 2) {
      if (!/^\d+$/.test(partsR[0])) return null;
      const whole = parseInt(partsR[0], 10);
      const frac = parseFraction(partsR[1]);
      if (frac == null) return null;
      inches = whole + frac;
    } else {
      return null;
    }
  }

  if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
  const totalTicks = Math.round((feet * TICKS_PER_FOOT) + (inches * TICKS_PER_INCH));
  return sign * totalTicks;
}

function parseFraction(tok) {
  const m = tok.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const den = parseInt(m[2], 10);
  if (!den) return null;
  return num / den;
}

// ── Formatting ──────────────────────────────────────────────────────
/**
 * Format a tick-count back to "12'-6 1/2"" style.  precisionDen is 4,
 * 8, 16, or 32 — the fraction is rounded to the nearest 1/den.
 */
export function formatLength(ticks, precisionDen = 16) {
  if (ticks == null || !Number.isFinite(ticks)) return "—";

  const sign = ticks < 0 ? "-" : "";
  const abs = Math.abs(ticks);

  // Round to requested precision first so we don't render phantom 1/32
  // leftovers after a (1/16 * 3) kind of operation.
  const ticksPerStep = TICKS_PER_INCH / precisionDen;
  const rounded = Math.round(abs / ticksPerStep) * ticksPerStep;

  let feet = Math.floor(rounded / TICKS_PER_FOOT);
  let leftover = rounded - feet * TICKS_PER_FOOT;

  let wholeInches = Math.floor(leftover / TICKS_PER_INCH);
  let fracTicks = leftover - wholeInches * TICKS_PER_INCH;

  // Reduce fraction
  const fracNum = Math.round(fracTicks / ticksPerStep);
  const fracDen = precisionDen;
  let fracStr = "";
  if (fracNum > 0) {
    // Reduce (e.g. 8/16 → 1/2)
    const g = gcd(fracNum, fracDen);
    fracStr = `${fracNum / g}/${fracDen / g}`;
  }

  // Handle carry if rounding pushed fracNum == fracDen (shouldn't after
  // Math.round above, but defensive)
  if (fracNum === fracDen) {
    wholeInches += 1;
    fracStr = "";
  }
  if (wholeInches === 12) { feet += 1; wholeInches = 0; }

  const inchPart = wholeInches > 0 || fracStr
    ? `${wholeInches}${fracStr ? (wholeInches > 0 ? " " : "") + fracStr : ""}"`
    : `0"`;

  return `${sign}${feet}'-${inchPart}`;
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

// ── Conversions ─────────────────────────────────────────────────────
export const ticksToDecimalFeet = (ticks) => ticks / TICKS_PER_FOOT;
export const ticksToDecimalInches = (ticks) => ticks / TICKS_PER_INCH;
export const decimalFeetToTicks = (ft) => Math.round(ft * TICKS_PER_FOOT);
