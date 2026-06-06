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

/* ─── Helpers ─────────────────────────────────────────────────────── */

function trafficLight(value, thresholds) {
  // thresholds = { green: [lo, hi], amber: [lo, hi] }
  // anything outside green+amber = red
  if (value == null) return "neutral";
  if (value >= thresholds.green[0] && value <= thresholds.green[1]) return "good";
  if (value >= thresholds.amber[0] && value <= thresholds.amber[1]) return "watch";
  return "risk";
}

function healthColor(health) {
  return HEALTH_COLORS[health] || "var(--text-muted)";
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

/* latestCertifiedPerLineItem — deduplicate SOV rows */
function latestCertifiedPerLineItem(sovItems) {
  const map = new Map();
  for (const s of sovItems) {
    if (!["Certified", "Paid"].includes(s.status)) continue;
    const key = `${s.project_id}::${s.line_item_number}`;
    const existing = map.get(key);
    if (!existing || (Number(s.application_number) || 0) > (Number(existing.application_number) || 0)) {
      map.set(key, s);
    }
  }
  return [...map.values()];
}

/* ─── Component ───────────────────────────────────────────────────── */

export default function FinancialKPIs() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

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
  const projectMetrics = useMemo(() => {
    return projects.map((p) => {
      const pWPs = workPackages.filter((w) => w.project_id === p.id);
      const pCOs = changeOrders.filter((c) => c.project_id === p.id);
      const pExp = expenses.filter((e) => e.project_id === p.id && e.payment_status !== "Voided");
      const pSOV = sovItems.filter((s) => s.project_id === p.id);

      const cv = calcContractValue(p, pCOs);
      const evm = calcEVM(pWPs);
      const wp = calcWpProgress(pWPs);
      const labor = calcLaborBurn(pWPs);

      const committed = pExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const paid = pExp.filter((e) => e.payment_status === "Paid")
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);

      // Billing from deduped SOV
      const certLines = latestCertifiedPerLineItem(pSOV);
      const billed = certLines.reduce(
        (s, l) => s + (Number(l.scheduled_value) || 0) * ((Number(l.current_percent_complete) || 0) / 100),
        0
      );
      const collected = certLines
        .filter((l) => l.payment_received_date)
        .reduce(
          (s, l) => s + (Number(l.scheduled_value) || 0) * ((Number(l.current_percent_complete) || 0) / 100),
          0
        );
      const retention = certLines.reduce(
        (s, l) => {
          const toDate = (Number(l.scheduled_value) || 0) * ((Number(l.current_percent_complete) || 0) / 100);
          return s + toDate * ((Number(l.retainage_percent) || 0) / 100);
        },
        0
      );

      // DSO from SOV payment cycles
      const dsoValues = [];
      for (const s of pSOV) {
        if (s.submitted_date && s.payment_received_date && ["Certified", "Paid"].includes(s.status)) {
          const days = Math.ceil(
            (new Date(s.payment_received_date).getTime() - new Date(s.submitted_date).getTime()) / 86400000
          );
          if (days > 0) dsoValues.push(days);
        }
      }
      const avgDSO = dsoValues.length > 0
        ? Math.round(dsoValues.reduce((a, b) => a + b, 0) / dsoValues.length)
        : null;

      // Budget health
      const budgetUsedPct = cv.revised > 0 ? (committed / cv.revised) * 100 : 0;
      const budgetHealth = trafficLight(budgetUsedPct, {
        green: [0, 85], amber: [85.01, 95],
      });

      // CPI health
      const cpiHealth = evm.cpi != null
        ? trafficLight(evm.cpi, { green: [0.95, 999], amber: [0.85, 0.9499] })
        : "neutral";

      // Billing position
      const billingRatio = committed > 0 ? billed / committed : null;
      const billingHealth = billingRatio != null
        ? trafficLight(billingRatio, { green: [0.9, 1.1], amber: [0.75, 0.8999] })
        : "neutral";

      // Projected margin
      const projectedFinal = committed > 0 ? committed * (cv.revised / Math.max(committed, 1)) : 0;
      const marginPct = cv.revised > 0 ? ((cv.revised - committed) / cv.revised) * 100 : 0;
      const marginHealth = trafficLight(marginPct, {
        green: [15, 999], amber: [5, 14.99],
      });

      // CO growth
      const coGrowthPct = cv.original > 0
        ? (cv.approvedCOTotal / cv.original) * 100
        : 0;

      return {
        id: p.id,
        name: p.name || "Untitled",
        number: p.project_number || `P-${p.id}`,
        phase: p.phase || "",
        healthStatus: p.health_status || "",
        original: cv.original,
        revised: cv.revised,
        approvedCOs: cv.approvedCOTotal,
        pendingCOs: cv.pendingCOValue,
        committed,
        paid,
        billed,
        collected,
        retention,
        unbilled: Math.max(0, cv.revised - billed),
        arOutstanding: Math.max(0, billed - collected),
        cpi: evm.cpi,
        spi: evm.spi,
        eac: evm.eac,
        vac: evm.vac,
        bac: evm.bac,
        ev: evm.ev,
        ac: evm.ac,
        wpPct: wp.pct,
        laborBurnPct: labor.burnPct,
        budgetUsedPct,
        budgetHealth,
        cpiHealth,
        billingHealth,
        billingRatio,
        marginPct,
        marginHealth,
        coGrowthPct,
        avgDSO,
        raw: p,
      };
    });
  }, [projects, workPackages, expenses, changeOrders, sovItems]);

  /* ── Filtered ── */
  const filtered = useMemo(() => {
    if (!search.trim()) return projectMetrics;
    const q = search.trim().toLowerCase();
    return projectMetrics.filter(
      (r) => r.name.toLowerCase().includes(q) || r.number.toLowerCase().includes(q)
    );
  }, [projectMetrics, search]);

  /* ── Aggregate KPIs ── */
  const agg = useMemo(() => {
    const totalRevised = filtered.reduce((s, r) => s + r.revised, 0);
    const totalCommitted = filtered.reduce((s, r) => s + r.committed, 0);
    const totalBilled = filtered.reduce((s, r) => s + r.billed, 0);
    const totalCollected = filtered.reduce((s, r) => s + r.collected, 0);
    const totalRetention = filtered.reduce((s, r) => s + r.retention, 0);
    const totalUnbilled = filtered.reduce((s, r) => s + r.unbilled, 0);
    const totalAR = filtered.reduce((s, r) => s + r.arOutstanding, 0);

    // Weighted CPI/SPI (weighted by BAC)
    const totalBAC = filtered.reduce((s, r) => s + r.bac, 0);
    const totalEV = filtered.reduce((s, r) => s + r.ev, 0);
    const totalAC = filtered.reduce((s, r) => s + r.ac, 0);
    const portfolioCPI = totalAC > 0 ? totalEV / totalAC : null;
    const portfolioSPI = totalBAC > 0 ? totalEV / totalBAC : null;

    // Weighted margin
    const portfolioMargin = totalRevised > 0
      ? ((totalRevised - totalCommitted) / totalRevised) * 100
      : 0;

    // Average DSO
    const dsoProjects = filtered.filter((r) => r.avgDSO != null);
    const avgDSO = dsoProjects.length > 0
      ? Math.round(dsoProjects.reduce((s, r) => s + r.avgDSO, 0) / dsoProjects.length)
      : null;

    // Backlog
    const totalBacklog = Math.max(0, totalRevised - totalBilled);

    return {
      totalRevised, totalCommitted, totalBilled, totalCollected,
      totalRetention, totalUnbilled, totalAR, totalBacklog,
      portfolioCPI, portfolioSPI, portfolioMargin, avgDSO,
    };
  }, [filtered]);

  /* ── Alerts ── */
  const alerts = useMemo(() => {
    const items = [];
    for (const p of filtered) {
      if (p.cpi != null && p.cpi < 0.9)
        items.push({ project: p, type: "CPI", msg: `CPI ${p.cpi.toFixed(2)} — over budget`, severity: "risk" });
      else if (p.cpi != null && p.cpi < 0.95)
        items.push({ project: p, type: "CPI", msg: `CPI ${p.cpi.toFixed(2)} — trending over`, severity: "watch" });

      if (p.budgetUsedPct > 95)
        items.push({ project: p, type: "Budget", msg: `${p.budgetUsedPct.toFixed(0)}% budget consumed`, severity: "risk" });
      else if (p.budgetUsedPct > 85)
        items.push({ project: p, type: "Budget", msg: `${p.budgetUsedPct.toFixed(0)}% budget consumed`, severity: "watch" });

      if (p.marginPct < 5 && p.revised > 0)
        items.push({ project: p, type: "Margin", msg: `${p.marginPct.toFixed(1)}% margin — critical`, severity: "risk" });
      else if (p.marginPct < 10 && p.revised > 0)
        items.push({ project: p, type: "Margin", msg: `${p.marginPct.toFixed(1)}% margin — low`, severity: "watch" });

      if (p.avgDSO != null && p.avgDSO > 60)
        items.push({ project: p, type: "DSO", msg: `${p.avgDSO}d avg payment cycle`, severity: "risk" });
      else if (p.avgDSO != null && p.avgDSO > 45)
        items.push({ project: p, type: "DSO", msg: `${p.avgDSO}d avg payment cycle`, severity: "watch" });

      if (p.coGrowthPct > 10 && p.original > 0)
        items.push({ project: p, type: "CO Growth", msg: `${p.coGrowthPct.toFixed(1)}% CO growth`, severity: "risk" });
    }
    return items.sort((a, b) => (a.severity === "risk" ? -1 : 1) - (b.severity === "risk" ? -1 : 1));
  }, [filtered]);

  /* ── Chart data ── */
  const scatterData = useMemo(
    () => filtered.filter((r) => r.cpi != null && r.spi != null).map((r) => ({
      name: r.number,
      fullName: r.name,
      cpi: Number(r.cpi.toFixed(2)),
      spi: Number(r.spi.toFixed(2)),
      size: Math.max(r.revised / 100000, 4),
      health: r.cpiHealth,
    })),
    [filtered]
  );

  const cashFlowData = useMemo(() => [
    { name: "Contract Value", value: agg.totalRevised, fill: "var(--accent)" },
    { name: "Billed", value: agg.totalBilled, fill: "var(--status-info)" },
    { name: "Collected", value: agg.totalCollected, fill: "var(--status-success)" },
    { name: "AR Outstanding", value: agg.totalAR, fill: "var(--status-warning)" },
    { name: "Retention Held", value: agg.totalRetention, fill: "var(--text-muted)" },
  ], [agg]);

  const marginData = useMemo(
    () => filtered
      .filter((r) => r.revised > 0)
      .sort((a, b) => a.marginPct - b.marginPct)
      .map((r) => ({
        name: r.number,
        fullName: r.name,
        margin: Number(r.marginPct.toFixed(1)),
        health: r.marginHealth,
      })),
    [filtered]
  );

  /* ── AR Aging ── */
  const arAging = useMemo(() => {
    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const now = Date.now();
    for (const s of sovItems) {
      if (!s.submitted_date || s.payment_received_date) continue;
      if (!["Certified"].includes(s.status)) continue;
      const days = Math.ceil((now - new Date(s.submitted_date).getTime()) / 86400000);
      const amt = (Number(s.scheduled_value) || 0) * ((Number(s.current_percent_complete) || 0) / 100);
      if (days <= 30) buckets["0-30"] += amt;
      else if (days <= 60) buckets["31-60"] += amt;
      else if (days <= 90) buckets["61-90"] += amt;
      else buckets["90+"] += amt;
    }
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [sovItems]);

  const SCATTER_COLORS = {
    good: "var(--status-success)",
    watch: "var(--status-warning)",
    risk: "var(--status-error)",
    neutral: "var(--text-muted)",
  };

  const BAR_COLORS = {
    good: "var(--status-success)",
    watch: "var(--status-warning)",
    risk: "var(--status-error)",
  };

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
                  background: a.severity === "risk" ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)",
                  border: `1px solid ${a.severity === "risk" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`,
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                <XAxis
                  dataKey="spi" type="number" name="SPI"
                  domain={[0.5, 1.5]}
                  tick={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}
                  label={{ value: "SPI", position: "insideBottom", offset: -5, style: { ...mono, fontSize: 9, fill: "var(--text-muted)" } }}
                />
                <YAxis
                  dataKey="cpi" type="number" name="CPI"
                  domain={[0.5, 1.5]}
                  tick={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}
                  label={{ value: "CPI", angle: -90, position: "insideLeft", style: { ...mono, fontSize: 9, fill: "var(--text-muted)" } }}
                />
                {/* Reference lines at 1.0 */}
                <RTooltip
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ ...CARD, padding: "8px 12px", fontSize: 10 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name} — {d.fullName}</div>
                        <div>CPI: {d.cpi} · SPI: {d.spi}</div>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatterData} fill="var(--accent)">
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis dataKey="name" tick={{ ...mono, fontSize: 8, fill: "var(--text-muted)" }} />
              <YAxis
                tick={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <RTooltip
                content={({ payload }) => {
                  if (!payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ ...CARD, padding: "8px 12px", fontSize: 10 }}>
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                <XAxis
                  type="number"
                  tick={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  dataKey="name" type="category"
                  tick={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}
                  width={50}
                />
                <RTooltip
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ ...CARD, padding: "8px 12px", fontSize: 10 }}>
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis dataKey="name" tick={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }} />
              <YAxis
                tick={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <RTooltip
                content={({ payload }) => {
                  if (!payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ ...CARD, padding: "8px 12px", fontSize: 10 }}>
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
                      d.name === "0-30" ? "var(--status-success)" :
                      d.name === "31-60" ? "var(--status-info)" :
                      d.name === "61-90" ? "var(--status-warning)" :
                      "var(--status-error)"
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
