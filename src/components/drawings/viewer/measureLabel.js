/**
 * measureLabel.js — turn a measured PDF distance into an engineer-friendly
 * label. Extracted from AnnotationLayer.jsx so it can be unit-tested under the
 * node Vitest environment (the component pulls in React).
 *
 * Calibrated (markup_scale set by the Calibrate tool, in real inches per PDF
 * inch): real-world feet-inches to the nearest 1/16".
 *
 * Uncalibrated: raw page inches with a "~" prefix, one decimal, so the user
 * knows they are looking at paper, not steel. Deliberately NOT rounded to
 * 16ths — a 1/16" fraction on an uncalibrated page inch would be false
 * precision.
 */

import { formatFeetInches } from "@/utils/feetInches";

const POINTS_PER_INCH = 72;

/**
 * @param {number} pdfDist  distance in PDF points (1/72")
 * @param {number|null} scale  real_inches_per_pdf_inch, or null/0 if uncalibrated
 * @returns {string}
 */
export function formatMeasureLabel(pdfDist, scale) {
  const pdfInches = pdfDist / POINTS_PER_INCH;

  if (scale) return formatFeetInches(pdfInches * scale);

  // Round to one decimal BEFORE banding on 12", or 11.97 page inches prints
  // as 12.0" instead of 1'-0.0".
  const rounded = Math.round(pdfInches * 10) / 10;
  if (rounded < 12) return `~${rounded.toFixed(1)}"`;
  const feet = Math.floor(rounded / 12);
  const remainder = rounded - feet * 12;
  return `~${feet}'-${remainder.toFixed(1)}"`;
}
