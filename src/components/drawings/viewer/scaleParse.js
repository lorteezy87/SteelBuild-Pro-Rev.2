// Pure helpers for parsing/formatting drawing scales.
//
// Extracted from DrawingViewer.jsx so they can be unit-tested and reused
// by future calibration UI without dragging the full viewer module along.
// No React, no DOM, no side effects — safe to import anywhere.

/**
 * Parse a user-entered real-world distance into inches. Supports:
 *   10'-0       → 120
 *   10'0"       → 120
 *   10'-6 1/2"  → 126.5
 *   10ft        → 120
 *   10 feet     → 120
 *   120"        → 120
 *   120         → 120 (bare number assumed inches)
 *   10.5       (inches)
 * Returns NaN on unparseable input.
 */
export function parseRealDistance(raw) {
  if (!raw) return NaN;
  const s = String(raw).trim().toLowerCase();

  // Feet + inches: "10'-0" / "10'0\"" / "10' 0" / "10'-6 1/2\""
  const ftInMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*[-\s]?\s*(\d+(?:\.\d+)?)?\s*(?:\d+\s*\/\s*\d+)?\s*"?$/i);
  if (ftInMatch) {
    const feet = parseFloat(ftInMatch[1]);
    const inches = ftInMatch[2] ? parseFloat(ftInMatch[2]) : 0;
    const fracMatch = s.match(/(\d+)\s*\/\s*(\d+)\s*"?$/);
    const frac = fracMatch ? parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]) : 0;
    return feet * 12 + inches + frac;
  }

  // Plain inches: "120\"" / "120 in" / bare number
  const inMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inches|inch)?$/i);
  if (inMatch) return parseFloat(inMatch[1]);

  // Feet only with "ft": "10ft" / "10 feet"
  const ftMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet)$/i);
  if (ftMatch) return parseFloat(ftMatch[1]) * 12;

  return NaN;
}

/**
 * Turn a scale factor (real_inches_per_pdf_inch) into a human-readable
 * architectural scale label. 48 → "1/4\" = 1'-0\"", 96 → "1/8\" = 1'-0\"",
 * 24 → "1/2\" = 1'-0\"" — matching how PMs read drawings. Non-standard
 * scales fall back to "1:X" ratio form.
 */
export function formatScaleFraction(scale) {
  const standard = [
    { ratio: 12,  label: '1" = 1\'-0"' },
    { ratio: 16,  label: '3/4" = 1\'-0"' },
    { ratio: 24,  label: '1/2" = 1\'-0"' },
    { ratio: 32,  label: '3/8" = 1\'-0"' },
    { ratio: 48,  label: '1/4" = 1\'-0"' },
    { ratio: 96,  label: '1/8" = 1\'-0"' },
    { ratio: 192, label: '1/16" = 1\'-0"' },
  ];
  for (const s of standard) {
    if (Math.abs(scale - s.ratio) / s.ratio < 0.03) return s.label;
  }
  return `1:${scale.toFixed(0)}`;
}
