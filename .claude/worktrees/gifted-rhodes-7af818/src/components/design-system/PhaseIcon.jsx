/**
 * PhaseIcon — hand-drawn SVG glyphs for the four production phases.
 *
 *   Detailing   → sheet of paper (drawings in hand)
 *   Fabrication → bolt / ring (shop connection)
 *   Delivery    → truck
 *   Erection    → framing chevron (column + beam)
 *
 * Identity asset — do not replace with Lucide or other generic icon
 * libraries. The glyph style carries domain meaning that generic
 * icons can't.
 *
 * `color` override is required so this component can render against
 * a colored chevron background (where the icon must match the chevron
 * text color, not the phase color).
 */

import React from "react";
import { PHASE_HEX } from "./tokens";

export default function PhaseIcon({ phase, size = 14, color }) {
  const c = color || PHASE_HEX[phase] || "currentColor";
  const glyphs = {
    Detailing: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 14L2 2L10 2L14 6L14 14L2 14Z" stroke={c} strokeWidth="1.2" fill="none" />
        <path d="M10 2L10 6L14 6" stroke={c} strokeWidth="1.2" fill="none" />
        <line x1="5" y1="9" x2="11" y2="9" stroke={c} strokeWidth="1" />
        <line x1="5" y1="11" x2="9" y2="11" stroke={c} strokeWidth="1" />
      </svg>
    ),
    Fabrication: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="6" width="14" height="9" rx="1" stroke={c} strokeWidth="1.2" fill="none" />
        <path d="M4 6V4C4 2.9 4.9 2 6 2H10C11.1 2 12 2.9 12 4V6" stroke={c} strokeWidth="1.2" fill="none" />
        <circle cx="8" cy="10.5" r="1.5" stroke={c} strokeWidth="1" fill="none" />
      </svg>
    ),
    Delivery: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="4" width="9" height="8" rx="1" stroke={c} strokeWidth="1.2" fill="none" />
        <path d="M10 7H13L15 10V12H10V7Z" stroke={c} strokeWidth="1.2" fill="none" />
        <circle cx="4" cy="13" r="1.5" stroke={c} strokeWidth="1" fill={c} />
        <circle cx="12.5" cy="13" r="1.5" stroke={c} strokeWidth="1" fill={c} />
      </svg>
    ),
    Erection: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1L8 11" stroke={c} strokeWidth="1.2" />
        <path d="M3 5L8 1L13 5" stroke={c} strokeWidth="1.2" fill="none" />
        <path d="M5 11L3 15" stroke={c} strokeWidth="1.2" />
        <path d="M11 11L13 15" stroke={c} strokeWidth="1.2" />
        <line x1="2" y1="15" x2="14" y2="15" stroke={c} strokeWidth="1.2" />
      </svg>
    ),
  };
  return glyphs[phase] || null;
}
