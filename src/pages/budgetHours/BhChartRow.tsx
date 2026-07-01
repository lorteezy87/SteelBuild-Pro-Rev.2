/**
 * BhChartRow.tsx
 *
 * Recharts chart section for the Budget Hours Control Center.
 * Pure presentational — receives already-derived data, renders 2 charts
 * side by side in a white-card grid. Pattern mirrors CostChartRow.tsx.
 *
 * All styling is inline per worktree constraint (no edits to command.css).
 *
 * CSS classes a central author might want:
 *   .cmd-chart-section  — outer grid wrapper
 *   .cmd-chart-card     — individual card
 */
import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import type { HourBarDatum } from "./budgetHoursControlCenter.derive";
import { fmtHours } from "./budgetHoursControlCenter.derive";

// ─── Shared axis / legend styles ─────────────────────────────────────────────

const AXIS_TICK = { fill: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 };
const AXIS_LINE = { stroke: "var(--border-default)" };
const LEGEND_STYLE = { fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" };

const EMPTY_STYLE: React.CSSProperties = {
  textAlign: "center",
  padding: 32,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};

// ─── Pie colours ─────────────────────────────────────────────────────────────

const PIE_COLORS: Record<string, string> = {
  Shop: "var(--accent)",
  Field: "#3B82F6",
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--accent-border)",
      borderRadius: 8,
      padding: "10px 14px",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
      color: "var(--text-primary)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--accent)", fontSize: 11 }}>{label}</div>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.color }} />
          <span style={{ color: "var(--text-secondary)" }}>{entry.name}:</span>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{fmtHours(entry.value)} h</span>
        </div>
      ))}
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--bg-surface-high)",
      borderRadius: 12,
      border: "1px solid var(--border-default)",
      padding: 16,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      minWidth: 0,
    }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BhChartRowProps {
  barData: HourBarDatum[];
  pieData: { name: string; value: number }[];
  totalBudget: number;
  totalActual: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BhChartRow({ barData, pieData }: BhChartRowProps) {
  const hasBar = barData.length > 0;
  const hasPie = pieData.length > 0;
  if (!hasBar && !hasPie) return null;

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 14,
        margin: "4px 0 14px",
      }}
      aria-label="Budget hours charts"
    >
      {/* 1 — Grouped bar: Budget vs Actual per scope item */}
      <ChartCard title="Shop & Field Hours — Budget vs Actual">
        {!hasBar ? (
          <div style={EMPTY_STYLE}>No scope items to display</div>
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <BarChart
              data={barData}
              margin={{ top: 8, right: 10, left: 10, bottom: 58 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
              <XAxis
                dataKey="label"
                tick={{ ...AXIS_TICK, fontSize: 8 }}
                axisLine={AXIS_LINE}
                angle={-35}
                textAnchor="end"
                interval={0}
                height={64}
                tickFormatter={(v: string) => (v && v.length > 16 ? `${v.slice(0, 15)}…` : v)}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickFormatter={(v: number) => `${v}h`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" align="center" iconSize={8} height={24} wrapperStyle={{ ...LEGEND_STYLE, paddingBottom: 8 }} />
              <Bar dataKey="shopBudget" name="Shop Budget" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="shopActual" name="Shop Actual" fill="var(--accent-muted, #5ab0ff)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="fieldBudget" name="Field Budget" fill="#3B82F6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="fieldActual" name="Field Actual" fill="#93C5FD" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 2 — Pie: Shop vs Field budget split */}
      <ChartCard title="Shop vs Field — Budget Split">
        {!hasPie ? (
          <div style={EMPTY_STYLE}>No budget hours entered</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                dataKey="value"
                stroke="none"
                paddingAngle={2}
                label={({ name, value }: { name: string; value: number }) =>
                  `${name} ${fmtHours(value)}h`
                }
                labelLine={{ stroke: "var(--text-muted)", strokeWidth: 1 }}
              >
                {pieData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={PIE_COLORS[d.name] ?? "var(--accent)"}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={8} wrapperStyle={LEGEND_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </section>
  );
}
