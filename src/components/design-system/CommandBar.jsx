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
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        padding: "14px 18px",
        background: "var(--bg-surface)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        marginBottom: 16,
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
        {eyebrow && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            {eyebrow}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 30,
              fontWeight: 300,
              letterSpacing: "0.02em",
              color: "var(--text-primary)",
              margin: 0,
              lineHeight: 1.1,
              textTransform: "uppercase",
            }}
          >
            {title}
          </h1>
          {count !== undefined && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 4,
                background: "var(--accent-muted)",
                border: "1px solid var(--accent-border)",
                color: "var(--accent)",
                letterSpacing: "0.10em",
                whiteSpace: "nowrap",
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
              color: "var(--text-muted)",
              marginTop: 6,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}
