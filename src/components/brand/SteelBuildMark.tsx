/**
 * SteelBuildMark — the SteelBuild-Pro hex-S brand mark as a React component.
 *
 * Geometry lives in `steelBuildMarkGeometry.ts` so the component, the static
 * SVGs in `public/` and the icon generator all draw the same shape.
 */

import React from "react";
import {
  MARK_AMBER,
  MARK_PATH,
  MARK_TILE_BG,
  MARK_TILE_VIEWBOX,
  MARK_VIEWBOX,
} from "./steelBuildMarkGeometry";

export interface SteelBuildMarkProps {
  /** Rendered height in px. Width follows the mark's 340:452 aspect (or 1:1 when tiled). */
  size?: number;
  /** Fill for the hexagon. Defaults to the brand amber token. */
  color?: string;
  /**
   * Draw the mark on a rounded Foundry Black tile (the 512×512 app-icon
   * treatment) instead of transparent.
   */
  tile?: boolean;
  /** Accessible label. Omit for a decorative mark sitting next to a text wordmark. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function SteelBuildMark({
  size = 32,
  color = `var(--brand-amber, ${MARK_AMBER})`,
  tile = false,
  title,
  className,
  style,
}: SteelBuildMarkProps) {
  const width = tile ? size : Math.round((size * 340) / 452);
  const labelled = Boolean(title);

  return (
    <svg
      className={className}
      style={style}
      width={width}
      height={size}
      viewBox={tile ? MARK_TILE_VIEWBOX : MARK_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {labelled ? <title>{title}</title> : null}
      {tile ? <rect width="512" height="512" rx="112" fill={MARK_TILE_BG} /> : null}
      <path d={MARK_PATH} fillRule="evenodd" fill={color} />
    </svg>
  );
}

export default SteelBuildMark;
