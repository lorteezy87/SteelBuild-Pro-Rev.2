/**
 * RfiInsightsStrip — health-metrics row + chart panel for the RFIs page.
 *
 * Renders six KPI tiles + a 2-up panel underneath:
 *   - left: Ball-in-Court donut (open RFIs grouped by ball_in_court)
 *   - right: bar chart of RFIs created by month (last 6 months)
 *
 * Compresses vertically when the table grows so it doesn't dominate
 * the page on a project with hundreds of RFIs. The strip can be
 * collapsed via the chevron button — collapsed state is local to
 * the page (intentional: RFIs is a list-first view, charts shouldn't
 * eat real estate when the user is scanning rows).
 *
 * Charts come from `src/pages/reports/charts.jsx` so the visual
 * language matches the reports page.
 */

import React, { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DonutChartSVG } from "../reports/charts";
import { rfiAgingBuckets, oldestOpenRFIAgeDays } from "../dashboard/projectMetrics";
import { isOverdue } from "./utils";

/**
 * Small unit-agnostic bar chart for RFI counts. Reusing the reports
 * BarChartSVG is tempting but its y-axis formats values as currency
 * (e.g. "$3" for a 3-RFI month) — wrong for counts. This local
 * version mirrors the same visual language but draws integer
 * gridline labels.
 */
function CountBarChart({ data = [], width = 420, height = 170 }) {
  if (!data.length) return null;
  const padding = { top: 12, right: 8, bottom: 26, left: 28 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map((d) => d.value || 0), 1);
  const slot = chartW / data.length;
  const barW = Math.max(8, Math.min(36, slot * 0.55));
  const gridLines = 4;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const v = (maxVal * i) / gridLines;
        const y = padding.top + chartH - (chartH * v) / maxVal;
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--divider)" strokeDasharray="3 3" />
            <text x={padding.left - 4} y={y + 3} textAnchor="end"
              style={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--text-muted)" }}>
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const cx = padding.left + slot * i + slot / 2;
        const h = (d.value / maxVal) * chartH;
        return (
          <g key={i}>
            <rect
              x={cx - barW / 2}
              y={padding.top + chartH - h}
              width={barW}
              height={h}
              rx={2}
              fill="var(--accent)"
            />
            <text x={cx} y={height - padding.bottom + 12} textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-muted)" }}>
              {d.label}
            </text>
            <text x={cx} y={padding.top + chartH - h - 3} textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--text-muted)" }}>
              {d.value || ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const CARD = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  padding: "12px 14px",
};

function avgAgeDays(openRfis) {
  if (!openRfis.length) return 0;
  const now = new Date();
  let sum = 0, n = 0;
  for (const r of openRfis) {
    const created = r.submitted_date || r.created_at;
    if (!created) continue;
    const d = new Date(created);
    if (isNaN(d.getTime())) continue;
    sum += Math.floor((now - d) / 86400000);
    n += 1;
  }
  return n ? Math.round(sum / n) : 0;
}

function ballInCourtSegments(openRfis) {
  // Pull --status-* values lazily so light/dark-mode switches keep
  // segment colors consistent. The donut chart accepts hex/rgb/var
  // strings directly.
  const palette = {
    Architect:  "var(--status-info)",
    Engineer:   "var(--status-warning)",
    GC:         "var(--accent)",
    Owner:      "#0EA5E9",
    Internal:   "var(--text-muted)",
    Contractor: "var(--accent)",
  };
  const counts = {};
  for (const r of openRfis) {
    const k = r.ball_in_court || "Internal";
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => ({
      label,
      value,
      color: palette[label] || "var(--text-muted)",
    }));
}

function rfisByMonth(rfis) {
  const now = new Date();
  const out = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("default", { month: "short" }),
      value: 0,
    });
  }
  for (const r of rfis) {
    const created = r.submitted_date || r.created_at;
    if (!created) continue;
    const d = new Date(created);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const slot = out.find((m) => m.key === key);
    if (slot) slot.value += 1;
  }
  return out;
}

function StatTile({ label, value, color, sub }) {
  return (
    <div
      style={{
        ...CARD,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 700,
          color: color || "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          marginTop: 2,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.06em",
            marginTop: 1,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function PaneTitle({ children }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        color: "var(--text-muted)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

export default function RfiInsightsStrip({ rfis, collapsed, onToggleCollapsed }) {
  const stats = useMemo(() => {
    const openRfis = rfis.filter((r) => !["Answered", "Closed"].includes(r.status));
    const overdue = rfis.filter((r) => isOverdue(r));
    const critical = rfis.filter((r) => r.priority === "Critical" && !["Closed"].includes(r.status));
    return {
      totalOpen: openRfis.length,
      avgAge: avgAgeDays(openRfis),
      oldest: oldestOpenRFIAgeDays(rfis),
      overdue: overdue.length,
      critical: critical.length,
      buckets: rfiAgingBuckets(rfis),
      bicSegments: ballInCourtSegments(openRfis),
      monthly: rfisByMonth(rfis),
    };
  }, [rfis]);

  return (
    <div className="rfi-insights-strip">
      {/* Header strip: 5 KPI tiles + collapse toggle */}
      <div className="rfi-insights-kpis">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? "Show charts" : "Hide charts"}
          style={{
            ...CARD,
            padding: "10px 10px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            cursor: "pointer",
            background: "var(--bg-surface-low)",
          }}
        >
          {collapsed ? <ChevronRight size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
            }}
          >
            Insights
          </span>
        </button>

        <StatTile label="TOTAL OPEN" value={stats.totalOpen} />
        <StatTile label="AVG AGE"    value={`${stats.avgAge}d`}   sub={stats.totalOpen ? "across open RFIs" : "no open RFIs"} />
        <StatTile label="OLDEST"     value={`${stats.oldest}d`}   color={stats.oldest > 14 ? "var(--status-warning)" : undefined} sub={stats.oldest > 14 ? "Over 2 weeks" : "Within 2 weeks"} />
        <StatTile label="OVERDUE"    value={stats.overdue}        color={stats.overdue > 0 ? "var(--danger)" : "var(--text-muted)"} />
        <StatTile label="CRITICAL"   value={stats.critical}       color={stats.critical > 0 ? "#FF6B35" : "var(--text-muted)"} />
      </div>

      {/* Charts panel */}
      {!collapsed && (
        <div className="rfi-insights-charts">
          {/* Aging buckets — re-used directly from rfiAgingBuckets */}
          <div style={CARD}>
            <PaneTitle>AGING BUCKETS</PaneTitle>
            <div
              style={{
                display: "flex",
                height: 8,
                borderRadius: 4,
                overflow: "hidden",
                marginBottom: 12,
                border: "1px solid var(--border-default)",
              }}
            >
              {stats.buckets.map((b, i) => (
                <div
                  key={i}
                  style={{ width: `${b.pct}%`, background: b.color }}
                  title={`${b.label}: ${b.count}`}
                />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
              {stats.buckets.map((b, i) => (
                <div
                  key={i}
                  style={{
                    padding: "6px 8px",
                    background: "var(--bg-surface-low)",
                    border: `1px solid color-mix(in srgb, ${b.color} 25%, transparent)`,
                    borderTop: `2px solid ${b.color}`,
                    borderRadius: 4,
                  }}
                >
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: b.color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                    {b.count}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 3 }}>
                    {b.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ball-in-Court donut */}
          <div style={CARD}>
            <PaneTitle>OPEN BY BALL-IN-COURT</PaneTitle>
            {stats.bicSegments.length > 0 ? (
              <DonutChartSVG segments={stats.bicSegments} size={150} innerRadius={42} outerRadius={62} />
            ) : (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", padding: "24px 0", textAlign: "center" }}>
                No open RFIs.
              </div>
            )}
          </div>

          {/* By-month bar chart */}
          <div style={CARD}>
            <PaneTitle>CREATED · LAST 6 MONTHS</PaneTitle>
            <CountBarChart data={stats.monthly} width={420} height={170} />
          </div>
        </div>
      )}
    </div>
  );
}
