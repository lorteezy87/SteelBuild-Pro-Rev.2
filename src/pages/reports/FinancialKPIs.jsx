/**
 * Financial KPIs — Portfolio-level financial health dashboard.
 *
 * Cross-project executive view of the most popular PM financial metrics:
 *   • EVM (CPI, SPI) scatter plot by project
 *   • Budget health matrix with traffic-light grading
 *   • Cash flow waterfall (contract → billed → collected → outstanding)
 *   • Margin analysis by project
 *   • AR aging buckets
 *   • Automated financial alerts
 *
 * No new DB tables — everything derives from existing entities:
 * projects, work_packages, expenses, change_orders, sov_items.
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import {
  calcContractValue,
  calcEVM,
  calcWpProgress,
  calcLaborBurn,
} from "@/utils/projectKpis";
import ReportShell from "./ReportShell";
import { FilterBar, SearchInput } from "./ReportFilters";
import { mono, body, CARD, CARD_TITLE, LABEL, HEALTH_COLORS } from "./constants";
import {
  formatCurrency,
  formatCurrencyFull,
  formatPercent,
  exportTableCSV,
} from "./utils";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Cell, BarChart, Bar,
} from "recharts";
import { getChartTheme } from "@/components/shared/RechartsThemeConfig";
import {
  trafficLight,
  healthColor as healthColorFromMap,
  buildProjectFinancialMetrics,
  filterFinancialProjectMetrics,
  aggregateFinancialKpis,
  buildFinancialAlerts,
  buildEvmScatterData,
  buildCashFlowChartData,
  buildMarginChartData,
  buildArAgingBuckets,
  kpiScatterColors,
  kpiBarColors,
  chartTooltipStyle,
} from "./financialKpisHelpers";

/* ─── Presentational helpers ──────────────────────────────────────── */

function healthColor(health) {
  return healthColorFromMap(health, HEALTH_COLORS);
}

function HealthDot({ health, label }) {
  const c = healthColor(health);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: c,
        boxShadow: health === "risk" ? `0 0 6px ${c}` : "none",
      }} />
      {label && (
        <span style={{ ...mono, fontSize: 9, color: c, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </span>
      )}
    </span>
  );
}

function KpiTile({ label, value, subtext, health, prefix, suffix }) {
  const c = health ? healthColor(health) : "var(--text-primary)";
  return (
    <div style={{ ...CARD, flex: "1 1 160px", minWidth: 160, textAlign: "center" }}>
      <div style={{ ...LABEL, marginBottom: 8 }}>{label}</div>
      <div style={{ ...mono, fontSize: 22, fontWeight: 800, color: c, lineHeight: 1.2 }}>
        {prefix}{value}{suffix}
      </div>
      {subtext && (
        <div style={{ ...body, fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ ...CARD_TITLE, marginBottom: 12, marginTop: 8, borderBottom: "1px solid var(--border-default)", paddingBottom: 8 }}>
      {children}
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────────── */

export default function FinancialKPIs() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const chartTheme = getChartTheme();
  const chartAxisTick = { ...mono, fontSize: 9, fill: chartTheme.axis.fill };
  const tooltipStyle = chartTooltipStyle(chartTheme);

  /* ── Queries ── */
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages-global"],
    queryFn: () => entities.WorkPackage.list(),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => entities.Expense.list(),
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders-global"],
    queryFn: () => entities.ChangeOrder.list(),
  });
  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov-items-all"],
    queryFn: () => entities.SOVItem.list(),
  });

  /* ── Per-project computed metrics ── */
  const projectMetrics = useMemo(
    () =>
      buildProjectFinancialMetrics({
        projects,
        workPackages,
        changeOrders,
        expenses,
        sovItems,
        calcContractValue,
        calcEVM,
        calcWpProgress,
        calcLaborBurn,
      }),
    [projects, workPackages, expenses, changeOrders, sovItems],
  );

  /* ── Filtered ── */
  const filtered = useMemo(
    () => filterFinancialProjectMetrics(projectMetrics, search),
    [projectMetrics, search],
  );

  /* ── Aggregate KPIs ── */
  const agg = useMemo(() => aggregateFinancialKpis(filtered), [filtered]);

  /* ── Alerts ── */
  const alerts = useMemo(() => buildFinancialAlerts(filtered), [filtered]);

  /* ── Chart data ── */
  const scatterData = useMemo(() => buildEvmScatterData(filtered), [filtered]);

  const cashFlowData = useMemo(
    () =>
      buildCashFlowChartData(agg, {
        primary: chartTheme.colors.primary,
        info: chartTheme.colors.info,
        success: chartTheme.colors.success,
        warning: chartTheme.colors.warning,
        muted: chartTheme.text.muted,
      }),
    [agg, chartTheme],
  );

  const marginData = useMemo(() => buildMarginChartData(filtered), [filtered]);

  /* ── AR Aging ── */
  const arAging = useMemo(() => buildArAgingBuckets(sovItems), [sovItems]);

  const SCATTER_COLORS = kpiScatterColors(chartTheme);
  const BAR_COLORS = kpiBarColors(chartTheme);

  return (
    <ReportShell
      title="Financial KPIs"
      count={filtered.length}
      unit=" PROJECTS"
      subtitle={`${formatCurrency(agg.totalRevised)} portfolio value · ${formatCurrency(agg.totalCommitted)} committed`}
      onExportCSV={() =>
        exportTableCSV({
          filename: "financial_kpis",
          columns: [
            { key: "number", label: "Project #" },
            { key: "name", label: "Project" },
            { key: "revised", label: "Revised Value", csvValue: (r) => r.revised },
            { key: "committed", label: "Committed", csvValue: (r) => r.committed },
            { key: "cpi", label: "CPI", csvValue: (r) => r.cpi?.toFixed(2) || "" },
            { key: "spi", label: "SPI", csvValue: (r) => r.spi?.toFixed(2) || "" },
            { key: "marginPct", label: "Margin %", csvValue: (r) => r.marginPct.toFixed(1) },
            { key: "billed", label: "Billed", csvValue: (r) => r.billed },
            { key: "collected", label: "Collected", csvValue: (r) => r.collected },
            { key: "avgDSO", label: "Avg DSO", csvValue: (r) => r.avgDSO || "" },
          ],
          rows: filtered,
          summary: {
            "Total Portfolio Value": formatCurrencyFull(agg.totalRevised),
            "Total Committed": formatCurrencyFull(agg.totalCommitted),
            "Portfolio CPI": agg.portfolioCPI?.toFixed(2) || "N/A",
            "Portfolio Margin": formatPercent(agg.portfolioMargin, 1),
            "Generated": new Date().toLocaleString(),
          },
        })
      }
      filters={
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search projects..." />
        </FilterBar>
      }
    >
      {/* ── Executive KPI Strip ──────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiTile
          label="Portfolio Value"
          value={formatCurrency(agg.totalRevised)}
          subtext={`${filtered.length} active projects`}
        />
        <KpiTile
          label="Total Committed"
          value={formatCurrency(agg.totalCommitted)}
          subtext={`${formatPercent(agg.totalRevised > 0 ? (agg.totalCommitted / agg.totalRevised) * 100 : 0, 0)} of value`}
          health={agg.totalRevised > 0 && (agg.totalCommitted / agg.totalRevised) > 0.95 ? "risk" : agg.totalRevised > 0 && (agg.totalCommitted / agg.totalRevised) > 0.85 ? "watch" : "good"}
        />
        <KpiTile
          label="Portfolio CPI"
          value={agg.portfolioCPI != null ? agg.portfolioCPI.toFixed(2) : "—"}
          subtext={agg.portfolioCPI != null ? (agg.portfolioCPI >= 1 ? "Under budget" : "Over budget") : "No EVM data"}
          health={agg.portfolioCPI != null ? (agg.portfolioCPI >= 0.95 ? "good" : agg.portfolioCPI >= 0.85 ? "watch" : "risk") : "neutral"}
        />
        <KpiTile
          label="Portfolio Margin"
          value={formatPercent(agg.portfolioMargin, 1)}
          subtext={formatCurrency(agg.totalRevised - agg.totalCommitted) + " profit"}
          health={agg.portfolioMargin >= 15 ? "good" : agg.portfolioMargin >= 5 ? "watch" : "risk"}
        />
        <KpiTile
          label="AR Outstanding"
          value={formatCurrency(agg.totalAR)}
          subtext={`${formatCurrency(agg.totalRetention)} in retention`}
          health={agg.totalAR > agg.totalRevised * 0.15 ? "risk" : agg.totalAR > agg.totalRevised * 0.08 ? "watch" : "good"}
        />
        <KpiTile
          label="Avg DSO"
          value={agg.avgDSO != null ? `${agg.avgDSO}d` : "—"}
          subtext={agg.avgDSO != null ? (agg.avgDSO <= 30 ? "Healthy" : agg.avgDSO <= 45 ? "Acceptable" : "Slow collections") : "No payment data"}
          health={agg.avgDSO != null ? (agg.avgDSO <= 30 ? "good" : agg.avgDSO <= 45 ? "watch" : "risk") : "neutral"}
        />
        <KpiTile
          label="Backlog"
          value={formatCurrency(agg.totalBacklog)}
          subtext="Contract value - billed"
        />
        <KpiTile
          label="Unbilled Revenue"
          value={formatCurrency(agg.totalUnbilled)}
          subtext="Work done, not yet billed"
          health={agg.totalUnbilled > agg.totalRevised * 0.2 ? "watch" : "good"}
        />
      </div>

      {/* ── Financial Alerts ─────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div style={CARD}>
          <div style={CARD_TITLE}>Financial Alerts ({alerts.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
            {alerts.slice(0, 20).map((a, i) => (
              <div
                key={i}
                onClick={() => navigate(createPageUrl("Projects") + `?id=${a.project.id}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  background: a.severity === "risk"
                    ? "color-mix(in srgb, var(--status-error) 6%, transparent)"
                    : "color-mix(in srgb, var(--status-warning) 6%, transparent)",
                  border: `1px solid ${a.severity === "risk"
                    ? "color-mix(in srgb, var(--status-error) 20%, transparent)"
                    : "color-mix(in srgb, var(--status-warning) 20%, transparent)"}`,
                  borderRadius: 6, cursor: "pointer",
                }}
              >
                <HealthDot health={a.severity} />
                <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-primary)", minWidth: 70 }}>
                  {a.type}
                </span>
                <span style={{ ...mono, fontSize: 10, color: "var(--text-secondary)", flex: 1 }}>
                  {a.project.number} — {a.project.name}
                </span>
                <span style={{ ...mono, fontSize: 10, color: healthColor(a.severity) }}>
                  {a.msg}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Project Health Matrix ────────────────────────────────────── */}
      <div style={CARD}>
        <div style={CARD_TITLE}>Project Financial Health Matrix</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", ...mono, fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                {["Project", "Contract Value", "CPI", "SPI", "Budget", "Billing", "Margin %", "DSO", "CO Growth"].map((h) => (
                  <th key={h} style={{
                    ...LABEL, padding: "8px 10px", textAlign: h === "Project" ? "left" : "right",
                    whiteSpace: "nowrap",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(createPageUrl("Projects") + `?id=${r.id}`)}
                  style={{
                    cursor: "pointer", borderBottom: "1px solid var(--border-default)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-low)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "10px 10px" }}>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{r.number}</div>
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--text-primary)" }}>
                    {formatCurrency(r.revised)}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <span style={{ color: healthColor(r.cpiHealth) }}>
                      {r.cpi != null ? r.cpi.toFixed(2) : "—"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <span style={{ color: r.spi != null ? healthColor(trafficLight(r.spi, { green: [0.95, 999], amber: [0.85, 0.9499] })) : "var(--text-muted)" }}>
                      {r.spi != null ? r.spi.toFixed(2) : "—"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <HealthDot health={r.budgetHealth} label={formatPercent(r.budgetUsedPct, 0)} />
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <HealthDot
                      health={r.billingHealth}
                      label={r.billingRatio != null ? r.billingRatio.toFixed(2) + "x" : "—"}
                    />
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <span style={{ color: healthColor(r.marginHealth) }}>
                      {formatPercent(r.marginPct, 1)}
                    </span>
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--text-secondary)" }}>
                    {r.avgDSO != null ? `${r.avgDSO}d` : "—"}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <span style={{
                      color: r.coGrowthPct > 10 ? "var(--status-error)" :
                        r.coGrowthPct > 5 ? "var(--status-warning)" : "var(--text-secondary)",
                    }}>
                      {r.original > 0 ? formatPercent(r.coGrowthPct, 1) : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", ...body, fontSize: 13 }}>
            {projects.length === 0
              ? "No projects yet — create one to populate this report."
              : "No projects match the current filter."}
          </div>
        )}
      </div>

      {/* ── Charts Row ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* CPI vs SPI Scatter */}
        <div style={CARD}>
          <div style={CARD_TITLE}>CPI vs SPI by Project</div>
          {scatterData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.text.muted} opacity={0.35} />
                <XAxis
                  dataKey="spi" type="number" name="SPI"
                  domain={[0.5, 1.5]}
                  tick={chartAxisTick}
                  label={{ value: "SPI", position: "insideBottom", offset: -5, style: chartAxisTick }}
                />
                <YAxis
                  dataKey="cpi" type="number" name="CPI"
                  domain={[0.5, 1.5]}
                  tick={chartAxisTick}
                  label={{ value: "CPI", angle: -90, position: "insideLeft", style: chartAxisTick }}
                />
                {/* Reference lines at 1.0 */}
                <RTooltip
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ ...tooltipStyle, padding: "8px 12px", fontSize: 10 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name} — {d.fullName}</div>
                        <div>CPI: {d.cpi} · SPI: {d.spi}</div>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} fill={chartTheme.colors.primary}>
                  {scatterData.map((d, i) => (
                    <Cell key={i} fill={SCATTER_COLORS[d.health] || "var(--text-muted)"} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", ...body, fontSize: 12 }}>
              No EVM data available. Populate work package budgets and actuals.
            </div>
          )}
          <div style={{ ...body, fontSize: 10, color: "var(--text-muted)", marginTop: 4, textAlign: "center" }}>
            Green = healthy (CPI & SPI &ge; 0.95) · Amber = watch · Red = at risk (&lt; 0.85)
          </div>
        </div>

        {/* Cash Flow Waterfall */}
        <div style={CARD}>
          <div style={CARD_TITLE}>Cash Flow Overview</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={cashFlowData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.text.muted} opacity={0.35} />
              <XAxis dataKey="name" tick={{ ...chartAxisTick, fontSize: 8 }} />
              <YAxis
                tick={chartAxisTick}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <RTooltip
                content={({ payload }) => {
                  if (!payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ ...tooltipStyle, padding: "8px 12px", fontSize: 10 }}>
                      <div style={{ fontWeight: 700 }}>{d.name}</div>
                      <div>{formatCurrencyFull(d.value)}</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {cashFlowData.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Margin by Project */}
        <div style={CARD}>
          <div style={CARD_TITLE}>Margin % by Project</div>
          {marginData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={marginData} layout="vertical" margin={{ top: 5, right: 40, bottom: 5, left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.text.muted} opacity={0.35} />
                <XAxis
                  type="number"
                  tick={chartAxisTick}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  dataKey="name" type="category"
                  tick={chartAxisTick}
                  width={50}
                />
                <RTooltip
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ ...tooltipStyle, padding: "8px 12px", fontSize: 10 }}>
                        <div style={{ fontWeight: 700 }}>{d.name} — {d.fullName}</div>
                        <div>Margin: {d.margin}%</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                  {marginData.map((d, i) => (
                    <Cell key={i} fill={BAR_COLORS[d.health] || "var(--text-muted)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", ...body, fontSize: 12 }}>
              No contract value data to calculate margins.
            </div>
          )}
        </div>

        {/* AR Aging */}
        <div style={CARD}>
          <div style={CARD_TITLE}>Accounts Receivable Aging</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={arAging} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.text.muted} opacity={0.35} />
              <XAxis dataKey="name" tick={chartAxisTick} />
              <YAxis
                tick={chartAxisTick}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <RTooltip
                content={({ payload }) => {
                  if (!payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ ...tooltipStyle, padding: "8px 12px", fontSize: 10 }}>
                      <div style={{ fontWeight: 700 }}>{d.name} days</div>
                      <div>{formatCurrencyFull(d.value)}</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {arAging.map((d, i) => (
                  <Cell
                    key={i}
                    fill={
                      d.name === "0-30" ? chartTheme.colors.success :
                      d.name === "31-60" ? chartTheme.colors.info :
                      d.name === "61-90" ? chartTheme.colors.warning :
                      chartTheme.colors.error
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ ...body, fontSize: 10, color: "var(--text-muted)", marginTop: 4, textAlign: "center" }}>
            Based on SOV submission dates for certified, unpaid line items
          </div>
        </div>
      </div>
    </ReportShell>
  );
}
