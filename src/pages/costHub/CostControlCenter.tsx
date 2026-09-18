/**
 * CostControlCenter.tsx
 *
 * Canonical presentation for the Cost / Budget module.
 *
 * Composition:
 *   PageHero    — title, chips, stats
 *   KpiStrip    — 8 KPIs across the full width
 *   CostChartRow — lifted Recharts charts (Budget/Actual/Committed bar,
 *                   cumulative area, spend-by-category pie)
 *   3× DecisionPanel — flags, margin at risk, CO pipeline
 *   FilterBar   — search, phase chips, "Over Budget" chip, Export, Add Cost Code
 *   DataTable   — per-row cost codes with status pill
 *   CostCodeFormModal — reused from CostDashboard/Financials
 *
 * Data source: useFinancials(projectId, project) — the single hook.
 * No raw Supabase calls here.
 */
import React, { useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import "@/styles/command.css";
import {
  AttentionQueue,
  OperationalSummary,
  PageHeader,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { AttentionItem, Column } from "@/components/command";
import { useFinancials } from "@/hooks/useFinancials";
import type { CostCodeRow } from "@/hooks/useFinancials";
import { formatCurrency, formatCurrencyShort } from "@/components/shared/formatters";
import CostCodeFormModal from "@/components/financials/CostCodeFormModal";
import { usePermissions } from "@/services/permissions";
import { computeRevisedContractValue } from "@/services/costRollup";
import { isCoApproved, isCoPending } from "@/lib/entityPredicates";
import { exportToCSV } from "@/lib/csv";
import type { CsvCell } from "@/lib/csv";
import {
  buildBarChartData,
  buildCumulativeData,
  buildCategoryPieData,
  buildVarianceAlerts,
  buildCoAging,
  costStatusTone,
} from "./costControlCenter.derive";
import CostChartRow from "./CostChartRow";
import { persistCostCode } from "./costCodeSave";

// CostCodeFormModal is untyped JS; its default-`[]` props infer as never[]. Cast so it accepts our data.
const CostCodeForm = CostCodeFormModal as unknown as React.ComponentType<Record<string, unknown>>;

// ─── Props ───────────────────────────────────────────────────────────────────

export interface CostControlCenterProps {
  projectId: string;
  project: Parameters<typeof useFinancials>[1];
}

// ─── Component ───────────────────────────────────────────────────────────────

const PHASE_OPTIONS = ["All", "Labor", "Materials", "Subcontractor", "Equipment", "Misc.", "Overhead"];

export default function CostControlCenter({ projectId, project }: CostControlCenterProps) {
  useCommandSkin();
  const { can } = usePermissions();

  // ── state ──
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("All");
  const [overBudgetOnly, setOverBudgetOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<CostCodeRow | null>(null);

  // ── data ──
  const {
    costCodeRows,
    costCodes,
    changeOrders,
    summary,
    reviewFlags,
    isLoading,
    costCodeCrud,
  } = useFinancials(projectId, project);

  // ── derived ──

  const revisedContract = useMemo(
    () => computeRevisedContractValue(project, changeOrders),
    [project, changeOrders],
  );

  const overBudgetCodes = useMemo(
    () => costCodeRows.filter((r) => r.is_over),
    [costCodeRows],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return costCodeRows.filter((r) => {
      if (phaseFilter !== "All" && r.phase !== phaseFilter) return false;
      if (overBudgetOnly && !r.is_over) return false;
      if (q) {
        return (
          (r.cost_code_number ?? "").toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q) ||
          (r.phase ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [costCodeRows, phaseFilter, overBudgetOnly, search]);

  // Chart data uses costCodeRows from useFinancials, whose actual_cost /
  // committed_cost are resolved with preferManualActual: a typed-in column on
  // the cost code WINS when > 0, else the expense rollup (Paid expenses matched
  // by cost_code_number). Never the sum of both. This keeps the bars / spend
  // curve / category donut / variance consistent with the "Actual"/"Committed"
  // KPI cards, which read summary.actual/committed from the same rollup.
  const barData = useMemo(() => buildBarChartData(costCodeRows), [costCodeRows]);
  const cumData = useMemo(() => buildCumulativeData(costCodeRows), [costCodeRows]);
  const pieData = useMemo(() => buildCategoryPieData(costCodeRows), [costCodeRows]);
  const varianceAlerts = useMemo(() => buildVarianceAlerts(costCodeRows), [costCodeRows]);
  const coAging = useMemo(() => buildCoAging(changeOrders), [changeOrders]);

  // CO pipeline counts
  const coPending = changeOrders.filter(isCoPending).length;
  const coApproved = changeOrders.filter(isCoApproved).length;
  const coStale = coAging.filter((co) => co.isStale).length;
  const topStaleCOs = coAging.filter((co) => co.isStale).slice(0, 5);

  // Budget KPI = revised budget (original + CO signed extras), matching the
  // per-row "Budget" column and its Variance below — the strip previously
  // summed raw budget_amount while labeled "revised", so the KPI Variance
  // disagreed with the table on any project with approved COs.
  const totalBudget = summary.revisedBudget;
  // EAC from the expense-rolled actuals + forecast-to-complete. Read off the
  // shared summary rather than re-reduced here, so this card and the Margin at
  // Risk stat above it can never be computed from two different definitions.
  const totalEAC = summary.eac;

  // Budget Used %
  const budgetUsedPct = totalBudget > 0 ? (summary.committed / totalBudget) * 100 : 0;

  // Stale CO count for KPI
  const staleCOsCount = coAging.filter((co) => co.isStale).length;

  // Contingency consumed = Σ per-code overage. Measured COMMITTED vs REVISED
  // budget, the same test as `is_over` and the table's Variance column — it
  // compared `actual_cost` to raw `budget_amount`, so a code whose overage was
  // committed-but-unpaid, or whose budget already carried an approved CO, ate
  // contingency on this card while reading On Track two rows below.
  const contingency = Number((project as Record<string, unknown>)?.contingency_amount ?? 0);
  const consumedContingency = costCodeRows.reduce(
    (s, c) => s + Math.max(0, c.committed_cost - c.revised_budget),
    0,
  );
  const contingencyRemaining = Math.max(0, contingency - consumedContingency);

  const projectLabel = String((project as Record<string, unknown>)?.name || (project as Record<string, unknown>)?.project_name || "Project");

  const operationalMetrics = [
    { label: "Revised Budget", value: formatCurrencyShort(totalBudget), sublabel: "approved budget", tone: "neutral" as const },
    { label: "Actual", value: formatCurrencyShort(summary.actual), sublabel: "paid", tone: "neutral" as const },
    { label: "Committed", value: formatCurrencyShort(summary.committed), sublabel: "incl. unpaid", tone: budgetUsedPct > 100 ? "danger" as const : budgetUsedPct > 85 ? "warn" as const : "neutral" as const },
    { label: "Forecast (EAC)", value: formatCurrencyShort(totalEAC), sublabel: "est. at completion", tone: totalEAC > totalBudget ? "danger" as const : "good" as const },
    { label: "Variance", value: formatCurrencyShort(summary.committed - totalBudget), sublabel: summary.committed > totalBudget ? "over budget" : "under budget", tone: summary.committed > totalBudget ? "danger" as const : "good" as const },
    { label: "Budget Used", value: `${budgetUsedPct.toFixed(1)}%`, sublabel: "committed / revised", tone: budgetUsedPct > 100 ? "danger" as const : budgetUsedPct > 85 ? "warn" as const : "good" as const },
    { label: "Stale COs", value: staleCOsCount, sublabel: "open >30 days", tone: staleCOsCount > 0 ? "warn" as const : "good" as const },
    { label: "Contingency Left", value: formatCurrencyShort(contingencyRemaining), sublabel: contingency > 0 ? `of ${formatCurrencyShort(contingency)}` : "not set", tone: contingency > 0 && consumedContingency > contingency ? "danger" as const : "neutral" as const },
  ];

  const attentionItems: AttentionItem[] = [
    ...(summary.unallocatedCOTotal !== 0 ? [({
      id: "unallocated-co",
      issue: "Approved CO value not allocated to cost codes",
      deadline: null,
      risk: `${formatCurrencyShort(summary.unallocatedCOTotal)} in revised contract but outside revised budget`,
      owner: "Project controls",
      nextAction: "Allocate approved CO value to cost codes",
      tone: "danger" as const,
    }] : []),
    ...reviewFlags.map((flag, index): AttentionItem => ({
      id: `review-${index}`,
      issue: flag.message,
      deadline: null,
      risk: flag.tone === "error" ? "Cost-control error" : "Cost-control warning",
      owner: "Project controls",
      nextAction: "Review financial source data",
      tone: flag.tone === "error" ? "danger" as const : "warn" as const,
    })),
    ...varianceAlerts.slice(0, 6).map((alert): AttentionItem => ({
      id: String(alert.id ?? alert.code),
      issue: `${alert.code} · ${alert.description || "Cost code"}`,
      deadline: null,
      risk: `+${formatCurrencyShort(alert.variance)} · ${alert.pctOver.toFixed(1)}% over`,
      owner: null,
      nextAction: "Review forecast / commitment and recovery plan",
      tone: "danger" as const,
      onOpen: () => {
        const row = costCodeRows.find((item) => String(item.id) === String(alert.id) || item.cost_code_number === alert.code);
        if (row) handleRowClick(row);
      },
    })),
    ...topStaleCOs.map((co): AttentionItem => ({
      id: `stale-${co.id}`,
      issue: `${co.co_number || "CO"} · ${co.title || "Change order"}`,
      deadline: null,
      risk: `${co.daysOpen}d open · ${formatCurrencyShort(co.co_amount)}`,
      owner: "Commercial follow-up",
      nextAction: "Advance CO decision",
      tone: "warn" as const,
    })),
  ].slice(0, 12);

  // ── Columns ──
  const columns: Column<CostCodeRow>[] = [
    { key: "code", header: "Code", render: (r) => <span className="cmd-row__num">{r.cost_code_number}</span> },
    { key: "desc", header: "Description", render: (r) => r.description || "—" },
    { key: "phase", header: "Phase", render: (r) => r.phase || "—" },
    { key: "budget", header: "Budget", align: "right", render: (r) => <span className="sbd-num">{formatCurrency(r.revised_budget)}</span> },
    { key: "actual", header: "Actual", align: "right", render: (r) => <span className="sbd-num">{formatCurrency(r.actual_cost)}</span> },
    { key: "committed", header: "Committed", align: "right", render: (r) => <span className="sbd-num">{formatCurrency(r.committed_cost)}</span> },
    { key: "forecast", header: "Forecast", align: "right", render: (r) => <span className="sbd-num">{formatCurrency(Number((r as Record<string, unknown>).forecast_to_complete ?? 0))}</span> },
    {
      key: "eac",
      header: "EAC",
      align: "right",
      render: (r) => {
        const eac = r.actual_cost + Number((r as Record<string, unknown>).forecast_to_complete ?? 0);
        return <span className="sbd-num" style={{ color: eac > r.revised_budget ? "var(--status-error)" : "inherit" }}>{formatCurrency(eac)}</span>;
      },
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      render: (r) => {
        const v = r.committed_cost - r.revised_budget;
        return (
          <span className="sbd-num" style={{ color: v > 0 ? "var(--status-error)" : "var(--status-success)", fontWeight: 700 }}>
            {v > 0 ? "+" : ""}{formatCurrency(v)}
          </span>
        );
      },
    },
    {
      key: "pct",
      header: "Used %",
      align: "right",
      render: (r) => <span className="sbd-num">{r.used_pct.toFixed(1)}%</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Pill tone={costStatusTone(r)}>{r.is_over ? "Over Budget" : r.used_pct > 85 ? "Watch" : "On Track"}</Pill>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => can("delete", "cost_code") ? (
        <button
          type="button"
          className="cmd-btn cmd-btn--secondary"
          style={{ fontSize: 10, padding: "4px 8px" }}
          onClick={(event) => {
            event.stopPropagation();
            if (!window.confirm(`Archive cost code ${r.cost_code_number}? Historical expenses remain; the code is hidden from active budgets.`)) {
              return;
            }
            costCodeCrud.delete.mutate(r.id);
          }}
        >
          Archive
        </button>
      ) : null,
    },
  ];

  // ── CSV export ──
  const handleExport = () => {
    const headers = ["Code", "Description", "Phase", "Budget", "Actual", "Committed", "Forecast", "EAC", "Variance", "% Used", "Status"];
    const rows: CsvCell[][] = filteredRows.map((r) => {
      const v = r.committed_cost - r.revised_budget;
      const eac = r.actual_cost + Number((r as Record<string, unknown>).forecast_to_complete ?? 0);
      return [
        r.cost_code_number, r.description, r.phase,
        r.revised_budget, r.actual_cost, r.committed_cost,
        Number((r as Record<string, unknown>).forecast_to_complete ?? 0),
        eac, v, `${r.used_pct.toFixed(1)}%`,
        r.is_over ? "Over Budget" : r.used_pct > 85 ? "Watch" : "On Track",
      ];
    });
    // The canonical exporter: RFC 4180 quote-doubling plus formula
    // neutralisation. The inline version here wrapped each cell in bare quotes,
    // so a description containing a quote split across columns and shifted
    // every money column to its right by one.
    exportToCSV({ filename: "cost_control_center.csv", headers, rows });
  };

  // ── Row click → edit ──
  const handleRowClick = (row: CostCodeRow) => {
    if (can("edit", "cost_code")) {
      setEditingCode(row);
      setModalOpen(true);
    }
  };

  // ── Loading guard ──
  if (isLoading) {
    return (
      <div style={{ padding: "40px 24px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
        Loading cost data…
      </div>
    );
  }

  return (
    <div className="cost-cc sbp-command-page">
      <PageHeader
        eyebrow={`${projectLabel} / Commercial`}
        title="Budget Control"
        subtitle="Budget, actual, committed, forecast, margin exposure, and change-order impact."
        meta={`${costCodeRows.length} cost codes · ${formatCurrencyShort(revisedContract)} revised contract · ${formatCurrencyShort(summary.marginAtRisk)} margin vs projected cost`}
        actions={(
          <>
            <button type="button" className="cmd-btn cmd-btn--ghost" onClick={handleExport}><Download size={14} /> Export</button>
            {can("create", "cost_code") ? (
              <button type="button" className="cmd-btn cmd-btn--primary" onClick={() => { setEditingCode(null); setModalOpen(true); }}>
                <Plus size={14} /> Add Cost Code
              </button>
            ) : null}
          </>
        )}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Budget operational summary" />

      <AttentionQueue title="Cost Attention" items={attentionItems} emptyMessage="No current cost-control exceptions." />

      <CostChartRow
        barData={barData}
        cumulativeData={cumData}
        pieData={pieData}
        totalBudget={totalBudget}
        contingency={contingency}
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>Margin at Risk</h2></div>
          <div>
            {overBudgetCodes.length === 0 ? <div className="sbp-attention__empty">No over-budget cost codes.</div> : overBudgetCodes
              .slice()
              .sort((a, b) => (b.committed_cost - b.revised_budget) - (a.committed_cost - a.revised_budget))
              .slice(0, 6)
              .map((row) => {
                const overage = row.committed_cost - row.revised_budget;
                return (
                  <button type="button" className="cmd-row is-clickable" key={row.id} onClick={() => handleRowClick(row)} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}>
                    <div><div className="cmd-row__num">{row.cost_code_number}</div><div className="cmd-row__meta">{row.description}</div></div>
                    <div style={{ textAlign: "right" }}><div style={{ color: "var(--status-error)" }}>+{formatCurrencyShort(overage)}</div><div className="cmd-row__meta">{row.used_pct.toFixed(0)}%</div></div>
                  </button>
                );
              })}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head"><h2>Change Order Pipeline</h2></div>
          <div>
            <div className="cmd-row">
              <div><div className="cmd-row__num">{coPending} pending</div><div className="cmd-row__meta">{coApproved} approved</div></div>
              <div style={{ textAlign: "right" }}><div className="cmd-row__num">{coStale} stale</div><div className="cmd-row__meta">open &gt;30d</div></div>
            </div>
            {topStaleCOs.map((co) => (
              <div className="cmd-row" key={co.id}>
                <div><div className="cmd-row__num">{co.co_number}</div><div className="cmd-row__meta">{co.title}</div></div>
                <div style={{ textAlign: "right" }}><div>{co.daysOpen}d open</div><div className="cmd-row__meta">{formatCurrencyShort(co.co_amount)}</div></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Filter bar */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search cost code, description, or phase"
        filters={
          <>
            {PHASE_OPTIONS.map((phase) => (
              <button
                key={phase}
                type="button"
                className={`cmd-chip-btn${phaseFilter === phase ? " is-active" : ""}`}
                onClick={() => setPhaseFilter(phase)}
              >
                {phase}
              </button>
            ))}
            <button
              type="button"
              className={`cmd-chip-btn${overBudgetOnly ? " is-active" : ""}`}
              style={overBudgetOnly ? { borderColor: "var(--status-error)", color: "var(--status-error)" } : undefined}
              onClick={() => setOverBudgetOnly((v) => !v)}
            >
              Over Budget
            </button>
          </>
        }
      />

      {/* Data table */}
      <DataTable
        columns={columns}
        rows={filteredRows}
        onRowClick={can("edit", "cost_code") ? handleRowClick : undefined}
        emptyMessage={costCodeRows.length === 0 ? "No cost codes yet. Add one to start tracking budget." : "No cost codes match your filters."}
      />

      {/* Reuse CostDashboard's CostCodeFormModal */}
      <CostCodeForm
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingCode(null); }}
        costCode={editingCode ? (costCodes.find((c) => c.id === editingCode.id) ?? editingCode) : null}
        projects={project ? [project] : []}
        existingCodes={costCodes}
        onSave={async (data: Record<string, unknown>) => {
          await persistCostCode({
            editingId: editingCode?.id as string | null,
            data,
            projectId,
            createMutation: costCodeCrud.create,
            updateMutation: costCodeCrud.update,
          });
          setModalOpen(false);
          setEditingCode(null);
        }}
      />
    </div>
  );
}
