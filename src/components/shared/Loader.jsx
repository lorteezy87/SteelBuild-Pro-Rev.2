import React from "react";

/**
 * Accessible loading indicator.
 *
 * - role="status" + aria-live="polite" announces loading to screen readers
 * - aria-busy="true" tells assistive tech the region is updating
 * - visually hidden <span> provides a text label while the spinning div is
 *   marked aria-hidden so it isn't read as a random element
 *
 * Use `fullscreen` for page-level loaders, otherwise the caller positions
 * it inline inside whatever container it sits in.
 */
export default function Loader({
  label = "Loading",
  fullscreen = false,
  size = 24,
  style,
}) {
  const outerStyle = fullscreen
    ? {
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-page)",
        zIndex: 1100,
        ...style,
      }
    : {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 120,
        width: "100%",
        ...style,
      };

  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={label} style={outerStyle}>
      <div
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          border: `${Math.max(2, Math.round(size / 12))}px solid var(--border-default)`,
          borderTop: `${Math.max(2, Math.round(size / 12))}px solid var(--accent)`,
          borderRadius: "50%",
          animation: "sbp-spin 0.8s linear infinite",
        }}
      />
      <span className="sr-only">{label}</span>
      <style>{`@keyframes sbp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
