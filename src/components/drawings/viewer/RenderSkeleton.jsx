/**
 * RenderSkeleton — shown over the drawing canvas while pdfjs rasterizes
 * the current page. Replaces the plain "RENDERING…" text with an animated
 * paper silhouette + a labeled progress hint.
 *
 * No pulse/flash: a slow shimmer gradient sweeping across a paper-shaped
 * rectangle. Intentionally minimal — this sits on top of a live PDF that's
 * about to appear, we don't want a flashy animation to compete with it.
 */

import React from "react";

const mono = { fontFamily: "var(--font-mono)" };

export default function RenderSkeleton({ label = "Rendering" }) {
  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "rgba(10, 14, 22, 0.55)",
          backdropFilter: "blur(2px)",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <div
          className="sbp-viewer-shimmer"
          style={{
            width: "min(420px, 60%)",
            aspectRatio: "11 / 8.5",
            borderRadius: 2,
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)",
            backgroundSize: "200% 100%",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.55)",
          }}
        />
        <div
          style={{
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            className="sbp-viewer-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "var(--accent)",
            }}
          />
          {label}
        </div>
      </div>
    </>
  );
}

const SHIMMER_CSS = `
@keyframes sbp-viewer-shimmer {
  0%   { background-position: -100% 0; }
  100% { background-position:  200% 0; }
}
@keyframes sbp-viewer-dot {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 1; }
}
.sbp-viewer-shimmer { animation: sbp-viewer-shimmer 1.6s linear infinite; }
.sbp-viewer-dot     { animation: sbp-viewer-dot 1.2s ease-in-out infinite; }
`;
