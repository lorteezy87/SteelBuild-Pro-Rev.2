/**
 * The supplied steel-plate badge is the single visible SteelBuild Pro logo.
 * Keep its 3:2 image ratio on every surface; a square rail or icon slot may
 * letterbox the image, but must never crop the diamond or redraw its lettering.
 */
import React from "react";

const BADGE_SRC = "/marketing/steelbuild-pro-logo.jpg";

export function BrandLogo({
  height = 64,
  className = undefined,
  style = undefined,
  title = "SteelBuild Pro",
  plate = false,
  variant = "full",
}) {
  const width = Math.round(height * 1.5);

  return (
    <img
      src={BADGE_SRC}
      alt={title}
      className={className}
      width={width}
      height={height}
      loading="eager"
      decoding="async"
      draggable={false}
      data-brand-variant={variant}
      style={{
        display: "block",
        objectFit: "contain",
        maxWidth: "100%",
        flexShrink: 0,
        ...(plate ? { border: "1px solid var(--border-default, #303942)" } : {}),
        ...style,
      }}
    />
  );
}

export default BrandLogo;
