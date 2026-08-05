/**
 * Icon — shared Lucide-style stroke icon library.
 *
 * Each icon is a 16×16 SVG with 1.5 stroke, matching the visual weight
 * of the hand-drawn `PhaseIcon` family. Add new glyphs to the `PATHS`
 * map; all sizing / color / strokeWidth flows through the wrapper.
 *
 * Use `PhaseIcon` (phases: Detailing / Fabrication / Delivery /
 * Erection) and `StageIcon` (drawing stages: OFA / BFA / etc.) for the
 * domain-specific glyph sets.
 */

import React from "react";

const PATHS = {
  dashboard:    <><rect x="2" y="2" width="5" height="7" rx="1" /><rect x="9" y="2" width="5" height="4" rx="1" /><rect x="2" y="11" width="5" height="3" rx="1" /><rect x="9" y="8" width="5" height="6" rx="1" /></>,
  command:      <><rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M5 6h6M5 8.5h4M5 11h5" /></>,
  portfolio:    <><rect x="1.5" y="4" width="13" height="9" rx="1" /><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M1.5 8h13" /></>,
  schedule:     <><rect x="2" y="3" width="12" height="11" rx="1" /><path d="M2 6h12M5 1.5v3M11 1.5v3" /></>,
  action:       <><path d="M8 1.5l1.8 4.2L14 6.3l-3.2 2.8.9 4.3L8 11.2 4.3 13.4l.9-4.3L2 6.3l4.2-.6z" /></>,
  rfi:          <><circle cx="8" cy="8" r="6.5" /><path d="M6 6.5a2 2 0 1 1 3 1.7c-.6.3-1 .7-1 1.3" /><circle cx="8" cy="11.5" r="0.5" /></>,
  co:           <><path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M10 2v3h3" /><path d="M5 9h6M5 11.5h4" /></>,
  mitigation:   <><path d="M8 1.5L2 4v4.5c0 3 2.5 5.3 6 6 3.5-.7 6-3 6-6V4z" /><path d="M6 8l1.5 1.5L10.5 6.5" /></>,
  meeting:      <><circle cx="5.5" cy="6" r="2" /><circle cx="11" cy="7" r="1.5" /><path d="M1.5 13c.5-2 2-3 4-3s3.5 1 4 3" /><path d="M9 13c.3-1.2 1-2 2-2s1.7.8 2 2" /></>,
  drawings:     <><rect x="2" y="1.5" width="12" height="13" rx="1" /><path d="M5 4.5h6M5 7h6M5 9.5h4" /></>,
  ai:           <><path d="M8 2v2M8 12v2M2 8h2M12 8h2M4 4l1.4 1.4M10.6 10.6L12 12M12 4l-1.4 1.4M5.4 10.6L4 12" /><circle cx="8" cy="8" r="2.5" /></>,
  viewer:       <><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" /><circle cx="8" cy="8" r="2" /></>,
  cube:         <><path d="M8 1.5L2 4.5v7L8 14.5l6-3v-7z" /><path d="M2 4.5l6 3 6-3M8 7.5V14.5" /></>,
  wp:           <><rect x="2" y="5" width="12" height="8" rx="1" /><path d="M5 5V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>,
  crew:         <><circle cx="8" cy="5.5" r="2" /><path d="M2.5 13.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /></>,
  resource:     <><path d="M8 2.5a3 3 0 0 1 3 3v1H5v-1a3 3 0 0 1 3-3z" /><rect x="3" y="6.5" width="10" height="7" rx="1" /></>,
  delivery:     <><rect x="1" y="4" width="9" height="8" rx="1" /><path d="M10 7h3l2 3v2H10z" /><circle cx="4" cy="13" r="1.3" /><circle cx="12.5" cy="13" r="1.3" /></>,
  financials:   <><path d="M8 1.5v13M5 4a2 2 0 0 1 2-2h2a2 2 0 0 1 0 4H7a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H7a2 2 0 0 1-2-2" /></>,
  settings:     <><circle cx="8" cy="8" r="2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M3.3 12.7l1.4-1.4M11.3 4.7l1.4-1.4" /></>,
  alert:        <><path d="M8 2L2 13h12z" /><path d="M8 6v3" /><circle cx="8" cy="11" r="0.5" /></>,
  check:        <><path d="M3 8l3 3 7-7" /></>,
  clock:        <><circle cx="8" cy="8" r="6.5" /><path d="M8 4v4l2.5 1.5" /></>,
  arrow:        <><path d="M3 8h10M9 4l4 4-4 4" /></>,
  chevronDown:  <><path d="M3 6l5 5 5-5" /></>,
  chevronRight: <><path d="M6 3l5 5-5 5" /></>,
  search:       <><circle cx="7" cy="7" r="5.5" /><path d="M11 11l3.5 3.5" strokeLinecap="round" /></>,
  plus:         <><path d="M8 2v12M2 8h12" /></>,
  bell:         <><path d="M4 6.5a4 4 0 0 1 8 0c0 3.5 1.5 4.5 1.5 4.5h-11s1.5-1 1.5-4.5z" /><path d="M6.5 13a1.5 1.5 0 0 0 3 0" /></>,
  filter:       <><path d="M2 3h12l-4.5 6v5l-3-1.5V9z" /></>,
  download:     <><path d="M8 2v9M4 7l4 4 4-4M2 14h12" /></>,
  upload:       <><path d="M8 11V2M4 6l4-4 4 4M2 14h12" /></>,
  x:            <><path d="M3 3l10 10M13 3L3 13" /></>,
  menu:         <><path d="M2 4h12M2 8h12M2 12h12" /></>,
  grid:         <><rect x="2" y="2" width="5" height="5" rx="0.5" /><rect x="9" y="2" width="5" height="5" rx="0.5" /><rect x="2" y="9" width="5" height="5" rx="0.5" /><rect x="9" y="9" width="5" height="5" rx="0.5" /></>,
  more:         <><circle cx="4" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="12" cy="8" r="1" /></>,
  sun:          <><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13" /></>,
};

export default function Icon({ name, size = 14, color = "currentColor", strokeWidth = 1.5 }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

/**
 * StageIcon — letterform badge for drawing-stage chips. Draws a 2px
 * rounded rect outline with the stage code inside (IFA, OFA, BFA, OFS,
 * IFC, or R for Released). Used inline in drawing-status badges.
 */
export function StageIcon({ stage, size = 14, color = "currentColor" }) {
  const label = stage === "Released" ? "R" : stage;
  return (
    <svg width={size * 1.25} height={size} viewBox="0 0 20 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="0.5" width="19" height="15" rx="2" stroke={color} strokeWidth="1" fill="none" />
      <text x="10" y="11" textAnchor="middle" fill={color} fontFamily="IBM Plex Mono, monospace" fontSize="8" fontWeight="700" letterSpacing="0.5">
        {label}
      </text>
    </svg>
  );
}

/**
 * DeliveryStatusIcon — picks between a check glyph (Delivered) and the
 * truck glyph for every other state. Exported for use in compact
 * inline delivery status displays.
 */
export function DeliveryStatusIcon({ state = "loaded", size = 16, color = "currentColor" }) {
  return <Icon name={state === "delivered" ? "check" : "delivery"} size={size} color={color} />;
}
