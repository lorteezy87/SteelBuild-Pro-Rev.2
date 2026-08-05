/**
 * Financial Scorecard — per-project financial health at a glance.
 *
 * 15 KPIs grouped into five sections, each with traffic-light grading:
 *   EVM        — CPI, SPI, EAC vs BAC, VAC, TCPI
 *   Budget     — Budget Utilization, Cost Variance, Committed vs Budget
 *   Revenue    — Billing Position, DSO, Retainage %
 *   Profit     — Gross Margin %, Projected Margin, CO Growth %
 *   Risk       — Total Risk Exposure, Labor Burn Rate
 *
 * Project-scoped: reads from the active project context.
 * No new DB tables — uses existing entities + calcEVM / calcContractValue.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "@/components/shared/ProjectContext";
import {
  calcContractValue,
  calcEVM,
  calcWpProgress,
  calcLaborBurn,
} from "@/utils/projectKpis";
import { calculateMarginRisk } from "@/services/marginRiskEngine";
import { computeCostCodeTotals } from "@/services/costRollup";
import ReportShell from "./ReportShell";
import { mono, body, CARD, LABEL, HEALTH_COLORS } from "./constants";
import {
  formatCurrency,
  exportTableCSV,
} from "./utils";

/* ─── Helpers ─────────────────────────────────────────────────────── */

function healthColor(h) {
  return HEALTH_COLORS[h] || "var(--text-muted)";
}

function grade(value, thresholds) {
  if (value == null) return { health: "neutral", label: "N/A" };
  if (value >= thresholds.green[0] && value <= thresholds.green[1])
    return { health: "good", label: "Good" };
  if (value >= thresholds.amber[0] && value <= thresholds.amber[1])
    return { health: "watch", label: "Watch" };
  return { health: "risk", label: "At Risk" };
}

function gradeInverse(value, thresholds) {
  // Lower is better (e.g. DSO, budget %)
  if (value == null) return { health: "neutral", label: "N/A" };
  if (value <= thresholds.green) return { health: "good", label: "Good" };
  if (value <= thresholds.amber) return { health: "watch", label: "Watch" };
  return { health: "risk", label: "At Risk" };
}

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

/* ─── KPI Card ────────────────────────────────────────────────────── */

function KpiCard({ label, value, unit, health, gradeLabel, description, benchmark }) {
  const c = healthColor(health);
  return (
    <div style={{
      ...CARD,
      borderLeft: `3px solid ${c}`,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      minWidth: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ ...LABEL }}>{label}</div>
        <span style={{
          ...mono,
          fontSize: 8,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 4,
          background: health === "good" ? "color-mix(in srgb, var(--status-success) 10%, transparent)" :
            health === "watch" ? "color-mix(in srgb, var(--status-warning) 10%, transparent)" :
            health === "risk" ? "color-mix(in srgb, var(--status-error) 10%, transparent)" :
            "color-mix(in srgb, var(--text-muted) 10%, transparent)",
          color: c,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          {gradeLabel || health?.toUpperCase() || "N/A"}
        </span>
      </div>
      <div style={{ ...mono, fontSize: 24, fontWeight: 800, color: c, lineHeight: 1.1 }}>
        {value}{unit && <span style={{ fontSize: 14, fontWeight: 600 }}>{unit}</span>}
      </div>
      {description && (
        <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {description}
        </div>
      )}
      {benchmark && (
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
          Target: {benchmark}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      ...mono, fontSize: 11, fontWeight: 800, color: "var(--text-primary)",
      textTransform: "uppercase", letterSpacing: "0.14em",
      padding: "12px 0 6px", borderBottom: "1px solid var(--border-default)",
      marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

/* ─── Component ───────────────────────────────────────────────────── */

export default function FinancialScorecard() {
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;

  const { data: project } = useQuery({
    queryKey: ["project-detail", projectId],
    queryFn: () => entities.Project.get(projectId),
    enabled: !!projectId,
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", projectId],
    queryFn: () => entities.Expense.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: () => entities.ChangeOrder.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov-items", projectId],
    queryFn: () => entities.SOVItem.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: costCodes = [] } = useQuery({
    queryKey: ["cost-codes", projectId],
    queryFn: () => entities.CostCode.filter({ project_id: projectId }, "cost_code_number"),
    select: (rows) => [...rows].sort((a, b) => (a.cost_code_number || "").localeCompare(b.cost_code_number || "", undefined, { numeric: true })),
    enabled: !!projectId,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis-scorecard", projectId],
    queryFn: () => entities.RFI.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries-scorecard", projectId],
    queryFn: () => entities.Delivery.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: inspections = [] } = useQuery({
    queryKey: ["inspections-scorecard", projectId],
    queryFn: () => entities.Inspection.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["schedule-tasks-scorecard", projectId],
    queryFn: () => entities.ScheduleTask.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  /* ── Computed KPIs ── */
  const kpis = useMemo(() => {
    if (!project) return null;

    const validExpenses = expenses.filter((e) => e.payment_status !== "Voided");
    const cv = calcContractValue(project, changeOrders);
    const evm = calcEVM(workPackages);
    const wp = calcWpProgress(workPackages);
    const labor = calcLaborBurn(workPackages);

    // Budget
    const totalBudget = computeCostCodeTotals(costCodes).budget;
    const committed = validExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const paid = validExpenses
      .filter((e) => e.payment_status === "Paid")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const budgetUsedPct = cv.revised > 0 ? (committed / cv.revised) * 100 : null;
    const costVariance = totalBudget > 0 ? totalBudget - committed : null;
    const costVariancePct = totalBudget > 0 ? ((totalBudget - committed) / totalBudget) * 100 : null;
    const committedVsBudget = totalBudget > 0 ? committed / totalBudget : null;

    // Billing
    const certLines = latestCertifiedPerLineItem(sovItems);
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
    const billingRatio = committed > 0 ? billed / committed : null;
    const retainagePct = billed > 0 ? (retention / billed) * 100 : null;

    // DSO
    const dsoValues = [];
    for (const s of sovItems) {
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

    // Profitability
    const marginPct = cv.revised > 0 ? ((cv.revised - committed) / cv.revised) * 100 : null;
    const projectedMargin = cv.revised > 0 && evm.eac > 0
      ? ((cv.revised - evm.eac) / cv.revised) * 100
      : marginPct;
    const coGrowthPct = cv.original > 0
      ? (cv.approvedCOTotal / cv.original) * 100
      : null;

    // Risk
    let riskExposure = 0;
    try {
      const riskResult = calculateMarginRisk({
        rfis, submittals: [], workPackages, deliveries,
        inspections, scheduleTasks, changeOrders,
      });
      riskExposure = riskResult.totalExposure || 0;
    } catch {
      riskExposure = 0;
    }

    return {
      // EVM
      cpi: evm.cpi,
      spi: evm.spi,
      eac: evm.eac,
      bac: evm.bac,
      vac: evm.vac,
      tcpi: evm.tcpi,
      ev: evm.ev,
      ac: evm.ac,
      // Budget
      budgetUsedPct,
      costVariance,
      costVariancePct,
      committedVsBudget,
      totalBudget,
      committed,
      paid,
      // Revenue
      billingRatio,
      avgDSO,
      retainagePct,
      billed,
      collected,
      retention,
      // Profit
      marginPct,
      projectedMargin,
      coGrowthPct,
      // Contract
      original: cv.original,
      revised: cv.revised,
      approvedCOs: cv.approvedCOTotal,
      pendingCOs: cv.pendingCOValue,
      pendingCOCount: cv.pendingCOCount,
      // Risk
      riskExposure,
      laborBurnPct: labor.burnPct,
      // Progress
      wpPct: wp.pct,
    };
  }, [project, workPackages, expenses, changeOrders, sovItems, costCodes, rfis, deliveries, inspections, scheduleTasks]);

  /* ── Overall health score ── */
  const overallScore = useMemo(() => {
    if (!kpis) return null;
    let score = 0;
    let count = 0;
    const check = (value, green, amber) => {
      if (value == null) return;
      count++;
      if (value >= green) score += 3;
      else if (value >= amber) score += 2;
      else score += 1;
    };
    const checkInv = (value, green, amber) => {
      if (value == null) return;
      count++;
      if (value <= green) score += 3;
      else if (value <= amber) score += 2;
      else score += 1;
    };
    check(kpis.cpi, 0.95, 0.85);
    check(kpis.spi, 0.95, 0.85);
    check(kpis.marginPct, 15, 5);
    check(kpis.billingRatio, 0.9, 0.75);
    checkInv(kpis.budgetUsedPct, 85, 95);
    checkInv(kpis.avgDSO, 30, 45);
    checkInv(kpis.coGrowthPct, 5, 10);
    checkInv(kpis.laborBurnPct, 100, 110);

    if (count === 0) return null;
    const pct = (score / (count * 3)) * 100;
    return {
      pct: Math.round(pct),
      label: pct >= 80 ? "Strong" : pct >= 60 ? "Moderate" : "Weak",
      health: pct >= 80 ? "good" : pct >= 60 ? "watch" : "risk",
    };
  }, [kpis]);

  if (!projectId) {
    return (
      <ReportShell title="Financial Scorecard" subtitle="Select a project to view its financial health scorecard.">
        <div style={{ ...CARD, textAlign: "center", padding: 60 }}>
          <div style={{ ...body, fontSize: 14, color: "var(--text-muted)" }}>
            Select a project from the project picker to view its financial scorecard.
          </div>
        </div>
      </ReportShell>
    );
  }

  if (!kpis) {
    return (
      <ReportShell title="Financial Scorecard" subtitle="Loading...">
        <div style={{ ...CARD, textAlign: "center", padding: 60 }}>
          <div style={{ ...body, fontSize: 14, color: "var(--text-muted)" }}>Loading project data...</div>
        </div>
      </ReportShell>
    );
  }

  const projectName = project?.name || "Project";
  const projectNumber = project?.project_number || "";

  return (
    <ReportShell
      title="Financial Scorecard"
      subtitle={`${projectNumber} — ${projectName}`}
      onExportCSV={() => {
        const rows = [
          { kpi: "CPI", value: kpis.cpi?.toFixed(2) || "N/A", target: ">= 0.95" },
          { kpi: "SPI", value: kpis.spi?.toFixed(2) || "N/A", target: ">= 0.95" },
          { kpi: "EAC", value: kpis.eac?.toFixed(0) || "N/A", target: "<= BAC" },
          { kpi: "VAC", value: kpis.vac?.toFixed(0) || "N/A", target: ">= 0" },
          { kpi: "TCPI", value: kpis.tcpi?.toFixed(2) || "N/A", target: "<= 1.1" },
          { kpi: "Budget Utilization", value: kpis.budgetUsedPct?.toFixed(1) + "%" || "N/A", target: "<= 85%" },
          { kpi: "Cost Variance", value: kpis.costVariance?.toFixed(0) || "N/A", target: ">= 0" },
          { kpi: "Billing Position", value: kpis.billingRatio?.toFixed(2) || "N/A", target: "0.9-1.1x" },
          { kpi: "DSO", value: kpis.avgDSO ? `${kpis.avgDSO}d` : "N/A", target: "<= 30d" },
          { kpi: "Retainage", value: kpis.retainagePct?.toFixed(1) + "%" || "N/A", target: "5-10%" },
          { kpi: "Gross Margin", value: kpis.marginPct?.toFixed(1) + "%" || "N/A", target: ">= 15%" },
          { kpi: "Projected Margin", value: kpis.projectedMargin?.toFixed(1) + "%" || "N/A", target: ">= 15%" },
          { kpi: "CO Growth", value: kpis.coGrowthPct?.toFixed(1) + "%" || "N/A", target: "<= 5%" },
          { kpi: "Risk Exposure", value: kpis.riskExposure?.toFixed(0) || "0", target: "Minimize" },
          { kpi: "Labor Burn", value: kpis.laborBurnPct?.toFixed(0) + "%" || "N/A", target: "<= 100%" },
        ];
        exportTableCSV({
          filename: `financial_scorecard_${projectNumber}`,
          columns: [
            { key: "kpi", label: "KPI" },
            { key: "value", label: "Value" },
            { key: "target", label: "Target" },
          ],
          rows,
          summary: {
            Project: `${projectNumber} — ${projectName}`,
            "Overall Score": overallScore ? `${overallScore.pct}% (${overallScore.label})` : "N/A",
            "Generated": new Date().toLocaleString(),
          },
        });
      }}
    >
      {/* ── Overall Health Score ── */}
      {overallScore && (
        <div style={{
          ...CARD,
          display: "flex",
          alignItems: "center",
          gap: 20,
          borderLeft: `4px solid ${healthColor(overallScore.health)}`,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            border: `3px solid ${healthColor(overallScore.health)}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <span style={{ ...mono, fontSize: 22, fontWeight: 800, color: healthColor(overallScore.health) }}>
              {overallScore.pct}
            </span>
          </div>
          <div>
            <div style={{ ...mono, fontSize: 14, fontWeight: 800, color: "var(--text-primary)" }}>
              Financial Health: {overallScore.label}
            </div>
            <div style={{ ...body, fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
              Composite score across {kpis.cpi != null ? "8" : "4-8"} key financial indicators.
              {overallScore.health === "good" && " Project financials are performing well."}
              {overallScore.health === "watch" && " Some metrics need attention — review amber/red KPIs below."}
              {overallScore.health === "risk" && " Multiple financial metrics are in the danger zone. Immediate review recommended."}
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
              CONTRACT VALUE
            </div>
            <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              {formatCurrency(kpis.revised)}
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
              {formatCurrency(kpis.original)} base + {formatCurrency(kpis.approvedCOs)} COs
              {kpis.pendingCOCount > 0 && ` · ${kpis.pendingCOCount} pending (${formatCurrency(kpis.pendingCOs)})`}
            </div>
          </div>
        </div>
      )}

      {/* ── EVM Section ── */}
      <SectionTitle>Earned Value Management</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        <KpiCard
          label="Cost Performance Index (CPI)"
          value={kpis.cpi != null ? kpis.cpi.toFixed(2) : "—"}
          {...(kpis.cpi != null ? grade(kpis.cpi, { green: [0.95, 999], amber: [0.85, 0.9499] }) : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.cpi != null ? (kpis.cpi >= 1 ? "Earning more value than spending" : `Spending $${(1 / kpis.cpi).toFixed(2)} for every $1 of value earned`) : "Populate WP budgets and actuals to calculate"}
          benchmark=">= 1.00"
        />
        <KpiCard
          label="Schedule Performance Index (SPI)"
          value={kpis.spi != null ? kpis.spi.toFixed(2) : "—"}
          {...(kpis.spi != null ? grade(kpis.spi, { green: [0.95, 999], amber: [0.85, 0.9499] }) : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.spi != null ? (kpis.spi >= 1 ? "Ahead of planned value" : "Behind planned value baseline") : "Uses BAC as PV proxy"}
          benchmark=">= 1.00"
        />
        <KpiCard
          label="Estimate at Completion (EAC)"
          value={kpis.eac > 0 ? formatCurrency(kpis.eac) : "—"}
          {...(kpis.eac > 0 && kpis.bac > 0
            ? grade(kpis.bac / kpis.eac, { green: [0.95, 999], amber: [0.85, 0.9499] })
            : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.eac > 0 && kpis.bac > 0
            ? `BAC: ${formatCurrency(kpis.bac)} · Variance: ${formatCurrency(kpis.vac)}`
            : "Projected total cost based on current CPI"}
          benchmark={kpis.bac > 0 ? `<= ${formatCurrency(kpis.bac)} (BAC)` : "<= BAC"}
        />
        <KpiCard
          label="To-Complete Performance Index"
          value={kpis.tcpi != null ? kpis.tcpi.toFixed(2) : "—"}
          {...(kpis.tcpi != null ? grade(2 - kpis.tcpi, { green: [0.9, 999], amber: [0.8, 0.8999] }) : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.tcpi != null
            ? (kpis.tcpi <= 1.0 ? "Achievable — current pace sufficient" :
               kpis.tcpi <= 1.1 ? "Tight — need efficiency gains" :
               "Difficult — significant correction needed")
            : "Efficiency needed to meet BAC"}
          benchmark="<= 1.00"
        />
      </div>

      {/* ── Budget Section ── */}
      <SectionTitle>Budget Performance</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        <KpiCard
          label="Budget Utilization"
          value={kpis.budgetUsedPct != null ? kpis.budgetUsedPct.toFixed(0) : "—"}
          unit="%"
          {...(kpis.budgetUsedPct != null ? gradeInverse(kpis.budgetUsedPct, { green: 85, amber: 95 }) : { health: "neutral", gradeLabel: "No Data" })}
          description={`${formatCurrency(kpis.committed)} committed of ${formatCurrency(kpis.revised)} contract`}
          benchmark="<= 85%"
        />
        <KpiCard
          label="Cost Variance"
          value={kpis.costVariance != null ? formatCurrency(Math.abs(kpis.costVariance)) : "—"}
          {...(kpis.costVariancePct != null
            ? grade(kpis.costVariancePct, { green: [0, 999], amber: [-5, -0.01] })
            : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.costVariance != null
            ? (kpis.costVariance >= 0 ? "Under budget" : "Over budget")
            : "Budget minus committed costs"}
          benchmark="Positive (under budget)"
        />
        <KpiCard
          label="Committed vs Budget"
          value={kpis.committedVsBudget != null ? kpis.committedVsBudget.toFixed(2) : "—"}
          unit="x"
          {...(kpis.committedVsBudget != null
            ? grade(2 - kpis.committedVsBudget, { green: [1, 999], amber: [0.9, 0.9999] })
            : { health: "neutral", gradeLabel: "No Data" })}
          description={`${formatCurrency(kpis.totalBudget)} budgeted across cost codes`}
          benchmark="<= 1.00x"
        />
      </div>

      {/* ── Revenue Section ── */}
      <SectionTitle>Billing & Collections</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        <KpiCard
          label="Billing Position"
          value={kpis.billingRatio != null ? kpis.billingRatio.toFixed(2) : "—"}
          unit="x"
          {...(kpis.billingRatio != null
            ? grade(kpis.billingRatio, { green: [0.9, 1.1], amber: [0.75, 0.8999] })
            : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.billingRatio != null
            ? (kpis.billingRatio > 1.05 ? "Over-billed — potential future shortfall" :
               kpis.billingRatio < 0.9 ? "Under-billed — cash flow risk" :
               "Balanced billing-to-cost ratio")
            : `${formatCurrency(kpis.billed)} billed / ${formatCurrency(kpis.committed)} committed`}
          benchmark="0.95–1.05x"
        />
        <KpiCard
          label="Days Sales Outstanding"
          value={kpis.avgDSO != null ? String(kpis.avgDSO) : "—"}
          unit="d"
          {...(kpis.avgDSO != null ? gradeInverse(kpis.avgDSO, { green: 30, amber: 45 }) : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.avgDSO != null
            ? `Average time from SOV submission to payment`
            : "No completed payment cycles yet"}
          benchmark="<= 30 days"
        />
        <KpiCard
          label="Retainage Held"
          value={kpis.retainagePct != null ? kpis.retainagePct.toFixed(1) : "—"}
          unit="%"
          health="neutral"
          gradeLabel={kpis.retainagePct != null ? `${formatCurrency(kpis.retention)}` : "No Data"}
          description={`${formatCurrency(kpis.collected)} collected of ${formatCurrency(kpis.billed)} billed`}
          benchmark="5-10% typical"
        />
      </div>

      {/* ── Profitability Section ── */}
      <SectionTitle>Profitability</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        <KpiCard
          label="Gross Margin"
          value={kpis.marginPct != null ? kpis.marginPct.toFixed(1) : "—"}
          unit="%"
          {...(kpis.marginPct != null
            ? grade(kpis.marginPct, { green: [15, 999], amber: [5, 14.99] })
            : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.marginPct != null
            ? `${formatCurrency(kpis.revised - kpis.committed)} gross profit`
            : "Revenue minus committed costs"}
          benchmark=">= 15%"
        />
        <KpiCard
          label="Projected Margin at Completion"
          value={kpis.projectedMargin != null ? kpis.projectedMargin.toFixed(1) : "—"}
          unit="%"
          {...(kpis.projectedMargin != null
            ? grade(kpis.projectedMargin, { green: [15, 999], amber: [5, 14.99] })
            : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.eac > 0 ? `Based on EAC of ${formatCurrency(kpis.eac)}` : "Based on current committed costs"}
          benchmark=">= 15%"
        />
        <KpiCard
          label="Change Order Growth"
          value={kpis.coGrowthPct != null ? kpis.coGrowthPct.toFixed(1) : "—"}
          unit="%"
          {...(kpis.coGrowthPct != null
            ? gradeInverse(kpis.coGrowthPct, { green: 5, amber: 10 })
            : { health: "neutral", gradeLabel: "No Data" })}
          description={`${formatCurrency(kpis.approvedCOs)} approved COs on ${formatCurrency(kpis.original)} base`}
          benchmark="<= 5%"
        />
      </div>

      {/* ── Risk Section ── */}
      <SectionTitle>Risk Exposure</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        <KpiCard
          label="Total Risk Exposure"
          value={formatCurrency(kpis.riskExposure)}
          health={kpis.riskExposure > kpis.revised * 0.05 ? "risk" : kpis.riskExposure > kpis.revised * 0.02 ? "watch" : "good"}
          gradeLabel={kpis.riskExposure > kpis.revised * 0.05 ? "High" : kpis.riskExposure > kpis.revised * 0.02 ? "Moderate" : "Low"}
          description="Aggregate margin-at-risk from RFIs, late deliveries, inspection failures, schedule slips, and unsigned COs"
          benchmark="< 2% of contract value"
        />
        <KpiCard
          label="Shop Labor Burn Rate"
          value={kpis.laborBurnPct > 0 ? String(kpis.laborBurnPct) : "—"}
          unit="%"
          {...(kpis.laborBurnPct > 0
            ? gradeInverse(kpis.laborBurnPct, { green: 100, amber: 110 })
            : { health: "neutral", gradeLabel: "No Data" })}
          description={kpis.laborBurnPct > 100 ? "Over budget on shop labor hours" : "Shop hours actual vs budgeted"}
          benchmark="<= 100%"
        />
      </div>
    </ReportShell>
  );
}
