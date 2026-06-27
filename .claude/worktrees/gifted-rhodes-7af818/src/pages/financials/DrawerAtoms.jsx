import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { mono, body } from "./utils";

/**
 * FinancialDrawer — right-side sheet shared by BillingDrawer, COImpactDrawer,
 * DSODrawer, and LaborDrawer. Owns the backdrop + panel + header + scrollable
 * body + pinned footer scaffolding so each KPI drawer only has to express its
 * unique content. Also handles Escape-to-close and initial focus.
 *
 * Props
 *   open        — render nothing when false
 *   onClose     — called from backdrop click, X button, Escape, default footer button
 *   barColor    — colored bar in header (typically HEALTH_COLOR[kpi.health])
 *   title       — header title (e.g. "Billing vs. Cost")
 *   subtitle    — header subtitle (e.g. "CRITICAL — OVER-BILLED"). Colored with barColor.
 *   children    — body content (rendered inside a scrollable region)
 *   footer      — optional custom footer. Defaults to a single full-width Close button.
 */
export function FinancialDrawer({ open, onClose, barColor, title, subtitle, children, footer }) {
  const drawerRef = useRef(null);

  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100 }}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        style={{
          position: "fixed", top: 0, right: 0, width: 480, maxWidth: "90vw",
          height: "100vh", background: "var(--bg-surface-secondary)",
          borderLeft: "1px solid var(--border-default)", zIndex: 1101,
          display: "flex", flexDirection: "column", outline: "none",
        }}
      >
        {/* Fixed header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "16px 20px", borderBottom: "1px solid var(--divider)", flexShrink: 0,
        }}>
          <div style={{ width: 4, height: 28, borderRadius: 2, background: barColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'Space Grotesk', var(--font-display)",
              fontSize: 14, fontWeight: 700, color: "var(--text-primary)",
            }}>
              {title}
            </div>
            {subtitle && (
              <div style={{
                ...mono, fontSize: 9, color: barColor, fontWeight: 600,
                letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2,
              }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: "transparent", border: "none", color: "var(--text-muted)",
              cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {children}
        </div>

        {/* Pinned footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--divider)",
          display: "flex", gap: 8, flexShrink: 0,
        }}>
          {footer ?? (
            <button onClick={onClose} style={{
              flex: 1, background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
              borderRadius: 4, padding: "8px 16px", color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer",
            }}>
              Close
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function DrawerTile({ label, value, sub, accent = "var(--accent)" }) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-card)",
      padding: "10px 12px",
      borderTop: `2px solid ${accent}`,
    }}>
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: accent, lineHeight: 1.2, marginBottom: 2 }}>
        {value}
      </div>
      {sub && <div style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

export function ChartLegend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ ...mono, fontSize: 9, color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}

export const drawerTd = {
  ...body,
  fontSize: 11,
  color: "var(--text-primary)",
  padding: "7px 6px",
  borderBottom: "1px solid var(--divider)",
  whiteSpace: "nowrap",
};

export const drawerTdRight = { ...drawerTd, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 };
