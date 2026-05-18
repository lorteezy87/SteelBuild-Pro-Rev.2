/**
 * SectionCard — collapsible panel chrome shared by every section on
 * the project dashboard (Schedule & Timeline / Financial Controls /
 * Document Hub / Team & Workflow).
 *
 * Anatomy (matches the design prototype):
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ [icon] Title                            stat·stat·stat  ▾  │
 *   │        subtitle                                            │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  body                                                       │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Stats are rendered as a small horizontal cluster (value over caption)
 * so each section's header reads as a glanceable summary even when the
 * panel is collapsed. Callers pass an array of `{ value, label, color? }`
 * — color picks accent/success/warning/error from the brand palette.
 */

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const STAT_COLOR = {
  accent:  "var(--accent)",
  success: "var(--status-success-bright)",
  warning: "var(--status-warning-bright)",
  error:   "var(--status-error-bright)",
  muted:   "var(--text-muted)",
  info:    "var(--status-info)",
};

export default function SectionCard({
  icon,                     // lucide icon component
  iconColor = "accent",     // key in STAT_COLOR
  title,
  subtitle,
  stats = [],               // [{ value, label, color }]
  accentColor,              // optional top-border accent (CSS color string)
  defaultOpen = true,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Caret = open ? ChevronDown : ChevronRight;

  return (
    <div style={{
      background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 92%, #000 8%) 0%, color-mix(in srgb, var(--bg-surface-low) 88%, #000 12%) 100%)",
      border: "1px solid var(--border-default)",
      borderTop: `2px solid ${accentColor || "var(--accent)"}`,
      borderRadius: 18,
      overflow: "hidden",
      transition: "border-color 0.12s",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 14px 34px rgba(0,0,0,0.30)",
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 18px",
          cursor: "pointer",
          userSelect: "none",
          background: open
            ? "linear-gradient(90deg, color-mix(in srgb, var(--accent) 5%, transparent) 0%, transparent 34%, transparent 100%)"
            : "color-mix(in srgb, var(--bg-surface-low) 92%, #000 8%)",
        }}
      >
        {icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: STAT_COLOR[iconColor] + "20",
            border: `1px solid ${STAT_COLOR[iconColor]}33`,
            color: STAT_COLOR[iconColor] || STAT_COLOR.accent,
            flexShrink: 0,
          }}>
            {React.createElement(icon, { size: 16 })}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-body)",
            fontSize: 18, fontWeight: 600,
            color: "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-secondary)",
              marginTop: 4,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {subtitle}
            </div>
          )}
        </div>

        {/* Inline stat strip */}
        {stats.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {stats.map((s, i) => (
              <div key={i} style={{
                textAlign: "center",
                padding: "8px 10px",
                minWidth: 72,
                borderRadius: 12,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 18, fontWeight: 700,
                  color: STAT_COLOR[s.color] || STAT_COLOR.accent,
                  lineHeight: 1,
                }}>
                  {s.value}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8, fontWeight: 700, letterSpacing: "0.12em",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  marginTop: 4,
                }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        <Caret size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      </div>

      {/* Body */}
      {open && (
        <div style={{
          borderTop: "1px solid var(--divider)",
          padding: 18,
          background: "linear-gradient(180deg, rgba(0,0,0,0.06) 0%, transparent 100%)",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
