/**
 * BrandLogo — application-ready SteelBuild-Pro identity.
 *
 * The 2026 brand mark is a pointy-top hexagon with an "S" carved through it in
 * Signal Amber, locked up with a heavy condensed "SteelBuild-Pro" wordmark and
 * the "Built for the people who build" rule line. The hexagon geometry is
 * shared with the favicon, the app icons and the landing page via
 * `components/brand/steelBuildMarkGeometry` — never re-draw it inline.
 *
 * The lockup stays an <svg> with a fixed viewBox (250×64 full, 70×64 mark) so
 * existing call sites can keep sizing it with `height`, `width: 100%` or
 * `maxWidth` and have the type scale with the artwork.
 *
 * `plate` is kept for backwards compatibility with older call sites. New code
 * should normally leave it false and let the surrounding shell provide the
 * surface.
 */

import React from "react";
import { MARK_AMBER, MARK_PATH } from "../brand/steelBuildMarkGeometry";

// The mark is authored on a 512 canvas with the hexagon spanning x 102–410,
// y 46–466. These transforms drop it into the lockup at a known height.
const FULL_MARK_SCALE = 48 / 420;
const COMPACT_MARK_SCALE = 52 / 420;

function markTransform(scale, x, y) {
  return `translate(${(x - 102 * scale).toFixed(3)} ${(y - 46 * scale).toFixed(3)}) scale(${scale.toFixed(6)})`;
}

function SteelMark({ compact }) {
  const transform = compact
    ? markTransform(COMPACT_MARK_SCALE, 15.93, 6)
    : markTransform(FULL_MARK_SCALE, 6, 8);

  return (
    <g aria-hidden="true" transform={transform}>
      <path d={MARK_PATH} fillRule="evenodd" fill={`var(--brand-amber, ${MARK_AMBER})`} />
    </g>
  );
}

export function BrandLogo({
  height = 64,
  className = undefined,
  style = undefined,
  title = "SteelBuild Pro",
  plate = false,
  variant = "full",
}) {
  const compact = variant === "mark";
  const width = compact ? height : Math.round(height * 3.9);
  const viewBox = compact ? "0 0 70 64" : "0 0 250 64";

  return (
    <svg
      role="img"
      aria-label={title}
      className={className}
      style={{ color: "var(--text-primary)", ...style }}
      width={width}
      height={height}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {plate ? (
        <rect
          x="1"
          y="1"
          width={compact ? "68" : "248"}
          height="62"
          rx="8"
          fill="var(--bg-sidebar, #101418)"
          stroke="var(--border-default, #303942)"
        />
      ) : null}

      <SteelMark compact={compact} />

      {!compact ? (
        <g>
          {/* textLength pins both lines to a known width. Barlow Condensed and
              IBM Plex Mono arrive from Google Fonts after first paint, and the
              'Arial Narrow' fallback is wider still — without this the wordmark
              renders past the 250-unit viewBox and gets clipped mid-word until
              the webfont lands. */}
          <text
            x="50"
            y="36"
            textLength="168"
            lengthAdjust="spacingAndGlyphs"
            fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
            fontWeight="900"
            fontSize="27"
            letterSpacing="-0.4"
            fill="currentColor"
          >
            SteelBuild-Pro
          </text>
          <text
            x="51"
            y="50"
            textLength="168"
            lengthAdjust="spacingAndGlyphs"
            fontFamily="'IBM Plex Mono', ui-monospace, monospace"
            fontWeight="600"
            fontSize="6.2"
            letterSpacing="1.35"
            fill="var(--text-secondary, #A7B0B8)"
          >
            BUILT FOR THE PEOPLE WHO BUILD
          </text>
        </g>
      ) : null}
    </svg>
  );
}

export default BrandLogo;
