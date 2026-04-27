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
  defaultOpen = true,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Caret = open ? ChevronDown : ChevronRight;

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      overflow: "hidden",
      transition: "border-color 0.12s",
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
          padding: "14px 18px",
          cursor: "pointer",
          userSelect: "none",
          background: open ? "var(--bg-surface)" : "var(--bg-surface-low)",
        }}
      >
        {icon && (
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: STAT_COLOR[iconColor] + "1A", // 10% alpha
            color: STAT_COLOR[iconColor] || STAT_COLOR.accent,
            flexShrink: 0,
          }}>
            {React.createElement(icon, { size: 16 })}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-body)",
            fontSize: 15, fontWeight: 600,
            color: "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {subtitle}
            </div>
          )}
        </div>

        {/* Inline stat strip */}
        {stats.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 22, flexShrink: 0 }}>
            {stats.map((s, i) => (
              <div key={i} style={{ textAlign: "center" }}>
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
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.10em",
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
        }}>
          {children}
        </div>
      )}
    </div>
  );
}
