/**
 * CostChartRow.tsx
 *
 * Lifted Recharts chart section from CostDashboard.jsx.
 * Pure presentational — receives already-derived data, renders 3 charts side
 * by side in a white-card grid. Wrapped in an inline-styled <section> per the
 * canonical presentation worktree constraint (no edits to command.css).
 *
 * CSS classes you'd want centrally if this pattern repeats:
 *   .cmd-chart-section   — the outer <section> wrapper (3-col grid on wide, 1-col on ≤900)
 *   .cmd-chart-card      — individual card (bg-surface-high, rounded-12, padding-16)
 *   .cmd-chart-empty     — centred empty-state inside a card
 */
import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  AreaChart, Area, ReferenceLine,
} from "recharts";
import { formatCurrencyShort, formatCurrency } from "@/components/shared/formatters";
import type { BarChartDatum, CumulativeDatum, PieDatum } from "./costControlCenter.derive";
import { CATEGORY_COLORS } from "./costControlCenter.derive";

// ─── Shared tooltip ──────────────────────────────────────────────────────────

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
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Axis style helpers ──────────────────────────────────────────────────────

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

export interface CostChartRowProps {
  barData: BarChartDatum[];
  cumulativeData: CumulativeDatum[];
  pieData: PieDatum[];
  totalBudget: number;
  contingency?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CostChartRow({
  barData,
  cumulativeData,
  pieData,
  totalBudget,
  contingency = 0,
}: CostChartRowProps) {
  // Don't render the whole section if there's genuinely no data
  const hasAny = barData.length > 0 || cumulativeData.length > 1 || pieData.length > 0;
  if (!hasAny) return null;

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: 14,
        margin: "4px 0 14px",
      }}
      aria-label="Cost charts"
    >
      {/* 1 — Budget vs Actual vs Committed bar chart */}
      <ChartCard title="Budget vs Actual vs Committed">
        {barData.length === 0 ? (
          <div style={EMPTY_STYLE}>No cost data to display</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickFormatter={(v) => formatCurrencyShort(v)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={8} wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="budget" name="Budget" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#3B82F6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="committed" name="Committed" fill="#FFB300" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 2 — Cumulative spend area chart */}
      <ChartCard title="Cumulative Spend Curve">
        {cumulativeData.length < 2 ? (
          <div style={EMPTY_STYLE}>Need 2+ cost codes for a curve</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={cumulativeData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="ccc-budgetGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.20} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ccc-actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.20} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={AXIS_LINE} />
              <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} tickFormatter={(v) => formatCurrencyShort(v)} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={8} wrapperStyle={LEGEND_STYLE} />
              {contingency > 0 && (
                <ReferenceLine
                  y={totalBudget + contingency}
                  stroke="var(--status-error)"
                  strokeDasharray="5 5"
                  label={{ value: "Contingency Limit", fill: "var(--status-error)", fontSize: 9, fontFamily: "var(--font-mono)" }}
                />
              )}
              <Area type="monotone" dataKey="budget" name="Budget" stroke="var(--accent)" fill="url(#ccc-budgetGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="actual" name="Actual" stroke="#3B82F6" fill="url(#ccc-actualGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* 3 — Spend by category pie chart */}
      <ChartCard title="Spend by Category">
        {pieData.length === 0 ? (
          <div style={EMPTY_STYLE}>No spend data</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                stroke="none"
                paddingAngle={2}
              >
                {pieData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={(CATEGORY_COLORS as Record<string, string>)[d.name] ?? "var(--accent)"}
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
