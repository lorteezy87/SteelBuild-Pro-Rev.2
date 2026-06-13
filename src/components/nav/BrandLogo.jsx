/**
 * BrandLogo — the SteelBuild PRO mark, as crisp vector (shared design with
 * SteelBuild Submittals). Silver "STEELBUILD" + gold "PRO" inside a chrome
 * diamond with gold accent points, on a self-contained dark "logo card" so it
 * reads on light surfaces (Pro's light theme) as well as dark.
 *
 * Inline SVG (not an <img>) so the wordmark renders with the app font and
 * stays razor-sharp at any size.
 */

import React, { useState } from "react";

let _seq = 0;

export function BrandLogo({ height = 96, className, style, title = "SteelBuild Pro", plate = true }) {
  const [u] = useState(() => `bl${++_seq}`);
  const width = (height * 460) / 300;

  return (
    <svg
      role="img"
      aria-label={title}
      className={className}
      style={style}
      width={width}
      height={height}
      viewBox="0 0 460 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <radialGradient id={`${u}-plate`} cx="0.5" cy="0.42" r="0.75">
          <stop offset="0" stopColor="#15171c" />
          <stop offset="1" stopColor="#08090b" />
        </radialGradient>
        <linearGradient id={`${u}-silver`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f7f9" />
          <stop offset="0.42" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#e7eaef" />
          <stop offset="0.6" stopColor="#c4c9d2" />
          <stop offset="1" stopColor="#9aa0ac" />
        </linearGradient>
        <linearGradient id={`${u}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0d68f" />
          <stop offset="0.45" stopColor="#f7e3a6" />
          <stop offset="0.56" stopColor="#dab35e" />
          <stop offset="1" stopColor="#a87a1e" />
        </linearGradient>
        <filter id={`${u}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {plate && (
        <rect
          x="3"
          y="3"
          width="454"
          height="294"
          rx="20"
          fill={`url(#${u}-plate)`}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1"
        />
      )}

      <g filter={`url(#${u}-glow)`}>
        <polygon points="230,30 430,150 230,270 30,150" stroke={`url(#${u}-silver)`} strokeWidth="2.6" strokeLinejoin="miter" />
        <polygon points="230,48 410,150 230,252 50,150" stroke={`url(#${u}-silver)`} strokeWidth="1" opacity="0.45" strokeLinejoin="miter" />
      </g>

      {[
        [230, 30],
        [430, 150],
        [230, 270],
        [30, 150],
      ].map(([cx, cy]) => (
        <path key={`${cx}-${cy}`} d={`M${cx} ${cy - 8} L${cx + 8} ${cy} L${cx} ${cy + 8} L${cx - 8} ${cy} Z`} fill={`url(#${u}-gold)`} />
      ))}

      <text
        x="230"
        y="160"
        textAnchor="middle"
        fontFamily="'Space Grotesk', 'Archivo', 'Arial Narrow', 'Arial Black', system-ui, sans-serif"
        fontWeight="800"
        fontSize="52"
        letterSpacing="1.5"
        fill={`url(#${u}-silver)`}
      >
        STEELBUILD
      </text>
      <line x1="120" y1="174" x2="340" y2="174" stroke={`url(#${u}-silver)`} strokeWidth="1.5" opacity="0.85" />
      <text
        x="230"
        y="210"
        textAnchor="middle"
        fontFamily="'Space Grotesk', 'Archivo', 'Arial Narrow', 'Arial Black', system-ui, sans-serif"
        fontWeight="700"
        fontSize="30"
        letterSpacing="16"
        fill={`url(#${u}-gold)`}
      >
        PRO
      </text>
    </svg>
  );
}

export default BrandLogo;
