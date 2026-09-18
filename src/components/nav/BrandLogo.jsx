/**
 * BrandLogo — application-ready SteelBuild-Pro identity.
 *
 * The approved brand reference uses an SB structural-steel monogram, a strong
 * STEELBUILD-PRO wordmark, and the SteelBuild orange accent. The product UI
 * intentionally uses a flat vector interpretation so the mark remains legible
 * at navigation sizes; the dimensional metallic treatment stays a marketing
 * presentation style.
 *
 * `plate` is kept for backwards compatibility with older call sites. New code
 * should normally leave it false and let the surrounding shell provide the
 * surface.
 */

import React from "react";

function SteelMark() {
  return (
    <g aria-hidden="true">
      <rect x="8" y="7" width="11" height="50" rx="1.5" fill="currentColor" />
      <rect x="51" y="7" width="11" height="50" rx="1.5" fill="currentColor" />
      <rect x="18" y="10" width="34" height="8" rx="1.5" fill="currentColor" />
      <rect x="18" y="46" width="34" height="8" rx="1.5" fill="currentColor" />
      <path
        d="M22 21h21.5c6.6 0 11 3.4 11 8.5 0 3.7-2.2 6.4-6 7.6 4.9 1 7.5 4 7.5 8.5C56 52 51 55 43.3 55H22v-8h20.3c2.8 0 4.4-1.2 4.4-3.3 0-2.2-1.6-3.3-4.5-3.3H27v-7.1h14.5c2.5 0 4-1.1 4-3.1 0-1.9-1.5-3-4-3H22V21Z"
        fill="var(--brand-orange, #FF5A1F)"
      />
      <text
        x="35"
        y="39"
        textAnchor="middle"
        fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
        fontWeight="900"
        fontSize="20"
        letterSpacing="-1"
        fill="currentColor"
      >
        SB
      </text>
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

      <SteelMark />

      {!compact ? (
        <g>
          <text
            x="77"
            y="31"
            fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
            fontWeight="800"
            fontSize="24"
            letterSpacing="0.7"
            fill="currentColor"
          >
            STEELBUILD-PRO
          </text>
          <rect x="77" y="38" width="155" height="2" rx="1" fill="var(--brand-orange, #FF5A1F)" />
          <text
            x="77"
            y="52"
            fontFamily="'IBM Plex Mono', ui-monospace, monospace"
            fontWeight="600"
            fontSize="7.2"
            letterSpacing="1.5"
            fill="var(--text-secondary, #A7B0B8)"
          >
            BUILT FOR WHAT YOU BUILD
          </text>
        </g>
      ) : null}
    </svg>
  );
}

export default BrandLogo;
