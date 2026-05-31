/**
 * DashboardHeader — opt-in welcome banner + configurable KPI strip.
 *
 * Driven entirely by the user's Settings → Dashboard preferences:
 *   - show_welcome   → renders the greeting banner
 *   - visible_kpis   → which KPI tiles appear
 *   - kpi_order      → their order
 *   - dashboard_density → tile compactness + grid spacing
 *
 * The Dashboard computes the metric values (real data) and passes the
 * already-ordered+filtered list; this component is pure presentation.
 */
import React from "react";
import { KpiTile } from "@/components/design-system";

const DENSITY = {
  compact:     { gap: 6,  minW: 116, compact: true },
  normal:      { gap: 8,  minW: 132, compact: true },
  comfortable: { gap: 12, minW: 168, compact: false },
};

export default function DashboardHeader({
  showWelcome = true,
  greeting,
  dateLabel,
  summary,
  kpis = [],
  density = "normal",
}) {
  const d = DENSITY[density] || DENSITY.normal;
  if (!showWelcome && kpis.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: d.gap }}>
      {showWelcome && (
        <div
          className="sbd-card"
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            padding: density === "comfortable" ? "14px 18px" : "9px 14px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderLeft: "3px solid var(--accent)",
            borderRadius: "var(--radius-card)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: density === "comfortable" ? 20 : 16, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1 }}>
              {greeting}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginTop: 3 }}>
              {dateLabel}
            </div>
          </div>
          {summary && (
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", textAlign: "right", maxWidth: 460 }}>
              {summary}
            </div>
          )}
        </div>
      )}

      {kpis.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${d.minW}px, 1fr))`, gap: d.gap }}>
          {kpis.map((k) => (
            <KpiTile
              key={k.id}
              compact={d.compact}
              label={k.label}
              value={k.value}
              sub={k.sub}
              color={k.color}
            />
          ))}
        </div>
      )}
    </div>
  );
}
