/**
 * PhaseIcon — small dependency-free SVG glyph matching the WP phase:
 * a sheet of paper for Detailing, a bolt/ring for Fabrication, a
 * delivery truck for Delivery, and a framing chevron for Erection.
 *
 * Renders nothing (returns `null`) for any phase not in the map.
 */

import React from "react";
import { PHASE_COLORS } from "./constants";

export default function PhaseIcon({ phase, size = 14 }) {
  const color = PHASE_COLORS[phase] || "var(--text-muted)";
  const icons = {
    Detailing: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 14L2 2L10 2L14 6L14 14L2 14Z" stroke={color} strokeWidth="1.2" fill="none" />
        <path d="M10 2L10 6L14 6" stroke={color} strokeWidth="1.2" fill="none" />
        <line x1="5" y1="9" x2="11" y2="9" stroke={color} strokeWidth="1" />
        <line x1="5" y1="11" x2="9" y2="11" stroke={color} strokeWidth="1" />
      </svg>
    ),
    Fabrication: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="6" width="14" height="9" rx="1" stroke={color} strokeWidth="1.2" fill="none" />
        <path d="M4 6V4C4 2.9 4.9 2 6 2H10C11.1 2 12 2.9 12 4V6" stroke={color} strokeWidth="1.2" fill="none" />
        <circle cx="8" cy="10.5" r="1.5" stroke={color} strokeWidth="1" fill="none" />
      </svg>
    ),
    Delivery: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="4" width="9" height="8" rx="1" stroke={color} strokeWidth="1.2" fill="none" />
        <path d="M10 7H13L15 10V12H10V7Z" stroke={color} strokeWidth="1.2" fill="none" />
        <circle cx="4" cy="13" r="1.5" stroke={color} strokeWidth="1" fill={color} />
        <circle cx="12.5" cy="13" r="1.5" stroke={color} strokeWidth="1" fill={color} />
      </svg>
    ),
    Erection: (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 1L8 11" stroke={color} strokeWidth="1.2" />
        <path d="M3 5L8 1L13 5" stroke={color} strokeWidth="1.2" fill="none" />
        <path d="M5 11L3 15" stroke={color} strokeWidth="1.2" />
        <path d="M11 11L13 15" stroke={color} strokeWidth="1.2" />
        <line x1="2" y1="15" x2="14" y2="15" stroke={color} strokeWidth="1.2" />
      </svg>
    ),
  };
  return icons[phase] || null;
}
