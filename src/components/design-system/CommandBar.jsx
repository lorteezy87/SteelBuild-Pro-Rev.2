/**
 * CommandBar — page header pattern.
 *
 *   eyebrow     — small uppercase context line (project path / breadcrumb)
 *   title       — 26pt display heading
 *   count + unit — compact chip next to the title (e.g. "32 · 2238.9T")
 *   subtitle    — smaller body-tone explainer line below
 *   children    — action buttons on the right
 *
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
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {eyebrow}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: "0.01em",
              color: "var(--text-primary)",
              margin: 0,
              lineHeight: 1.1,
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
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--bg-surface-high)",
                color: "var(--text-secondary)",
                letterSpacing: "0.08em",
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
