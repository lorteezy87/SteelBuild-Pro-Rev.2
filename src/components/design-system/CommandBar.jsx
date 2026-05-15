/**
 * CommandBar — page header pattern.
 *
 *   eyebrow      — small uppercase context line (project path / breadcrumb)
 *   title        — display heading (Barlow Condensed in SBD), light weight
 *                  with slight tracking
 *   count + unit — compact chip next to the title (e.g. "32 · 2238.9T")
 *   subtitle     — smaller body-tone explainer line below
 *   children     — action buttons on the right
 *
 * SBD treatment: glass card that sits above the page, backdrop-blurred,
 * subtle bottom border + soft elevation so it reads as a header rail.
 * Used across every operational page to create visual rhythm.
 */

import React from "react";

export default function CommandBar({ eyebrow, title, count, unit, subtitle, children }) {
  return (
    <div
      className="sbp-command-bar"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 18,
        flexWrap: "wrap",
        padding: "16px 18px",
        background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 92%, #000 8%) 0%, color-mix(in srgb, var(--bg-surface-low) 88%, #000 12%) 100%)",
        backdropFilter: "blur(24px) saturate(150%)",
        WebkitBackdropFilter: "blur(24px) saturate(150%)",
        border: "1px solid color-mix(in srgb, var(--border-default) 88%, white 12%)",
        borderRadius: "18px",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 32px rgba(0,0,0,0.34)",
        marginBottom: 16,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, rgba(86,176,255,0.10) 0%, transparent 28%, transparent 72%, rgba(200,155,32,0.07) 100%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
        {eyebrow && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: 8,
              padding: "4px 8px",
              borderRadius: 999,
              background: "rgba(86,176,255,0.08)",
              border: "1px solid rgba(86,176,255,0.14)",
            }}
          >
            {eyebrow}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 34,
              fontWeight: 500,
              letterSpacing: "0.01em",
              color: "var(--text-primary)",
              margin: 0,
              lineHeight: 1.02,
            }}
          >
            {title}
          </h1>
          {count !== undefined && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                padding: "5px 10px",
                borderRadius: 999,
                background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                color: "var(--accent)",
                letterSpacing: "0.10em",
                whiteSpace: "nowrap",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              {count}
              {unit || ""}
            </span>
          )}
        </div>
        {subtitle && (
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginTop: 8,
              maxWidth: 720,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0, position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
