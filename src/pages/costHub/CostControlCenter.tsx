/**
 * CostControlCenter.tsx
 *
 * Command UI redesign for the Cost / Budget module (flag: command_ui).
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
import { DollarSign, TrendingDown, TrendingUp, Percent, Clock, BarChart2, ShieldAlert } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { useFinancials } from "@/hooks/useFinancials";
import type { CostCodeRow } from "@/hooks/useFinancials";
import { formatCurrency, formatCurrencyShort } from "@/components/shared/formatters";
import CostCodeFormModal from "@/components/financials/CostCodeFormModal";
import { usePermissions } from "@/services/permissions";
import { computeRevisedContractValue } from "@/services/costRollup";
import {
  buildBarChartData,
  buildCumulativeData,
  buildCategoryPieData,
  buildVarianceAlerts,
  buildCoAging,
  costStatusTone,
} from "./costControlCenter.derive";
import CostChartRow from "./CostChartRow";

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

  // chart data — derived from raw costCodes (denormalized columns like CostDashboard)
  const barData = useMemo(() => buildBarChartData(costCodes), [costCodes]);
  const cumData = useMemo(() => buildCumulativeData(costCodes), [costCodes]);
  const pieData = useMemo(() => buildCategoryPieData(costCodes), [costCodes]);
  const varianceAlerts = useMemo(() => buildVarianceAlerts(costCodes), [costCodes]);
  const coAging = useMemo(() => buildCoAging(changeOrders), [changeOrders]);

  // CO pipeline counts
  const coPending = changeOrders.filter((co) =>
    ["Submitted", "Under Review"].includes(co.status ?? ""),
  ).length;
  const coApproved = changeOrders.filter((co) => co.status === "Approved").length;
  const coStale = coAging.filter((co) => co.isStale).length;
  const topStaleCOs = coAging.filter((co) => co.isStale).slice(0, 5);

  // EAC from costCodes column rollup (CostDashboard model)
  const totalBudget = useMemo(
    () => costCodes.reduce((s, c) => s + Number(c.budget_amount || 0), 0),
    [costCodes],
  );
  const totalEAC = useMemo(
    () => costCodes.reduce((s, c) => s + Number(c.actual_cost || 0) + Number(c.forecast_to_complete || 0), 0),
    [costCodes],
  );

  // Budget Used %
  const budgetUsedPct = totalBudget > 0 ? (summary.committed / totalBudget) * 100 : 0;

  // Stale CO count for KPI
  const staleCOsCount = coAging.filter((co) => co.isStale).length;

  // Contingency left: total budget + project contingency - consumed overages
  const contingency = Number((project as Record<string, unknown>)?.contingency_amount ?? 0);
  const consumedContingency = costCodes.reduce((s, c) => {
    const v = Number(c.actual_cost || 0) - Number(c.budget_amount || 0);
    return s + Math.max(0, v);
  }, 0);
  const contingencyRemaining = Math.max(0, contingency - consumedContingency);

  // ── Hero ──
  const heroChips = [
    { label: `${costCodeRows.length} Cost Codes` },
    { label: `${overBudgetCodes.length} Over Budget`, tone: overBudgetCodes.length > 0 ? ("danger" as const) : ("good" as const) },
    { label: `${reviewFlags.length} Flags`, tone: reviewFlags.length > 0 ? ("warn" as const) : ("good" as const) },
  ];

  const heroStats = [
    { value: formatCurrencyShort(revisedContract), label: "Revised Contract" },
    { value: formatCurrencyShort(summary.marginAtRisk), label: "Margin at Risk" },
  ];

  // ── KPI strip ──
  const kpiCells: KpiCellDef[] = [
    { label: "Budget", value: formatCurrencyShort(totalBudget), sublabel: "revised", tone: "neutral", Icon: DollarSign },
    { label: "Actual", value: formatCurrencyShort(summary.actual), sublabel: "paid", tone: "neutral", Icon: TrendingUp },
    { label: "Committed", value: formatCurrencyShort(summary.committed), sublabel: "incl. unpaid", tone: "neutral", Icon: BarChart2 },
    { label: "Forecast (EAC)", value: formatCurrencyShort(totalEAC), sublabel: "est. at completion", tone: totalEAC > totalBudget ? "danger" : "good", Icon: TrendingUp },
    {
      label: "Variance",
      value: formatCurrencyShort(summary.committed - totalBudget),
      sublabel: summary.committed > totalBudget ? "over budget" : "under budget",
      tone: summary.committed > totalBudget ? "danger" : "good",
      Icon: TrendingDown,
    },
    { label: "Budget Used", value: `${budgetUsedPct.toFixed(1)}%`, sublabel: "committed / revised", tone: budgetUsedPct > 100 ? "danger" : budgetUsedPct > 85 ? "warn" : "good", Icon: Percent },
    { label: "Stale COs", value: staleCOsCount, sublabel: "open >30 days", tone: staleCOsCount > 0 ? "warn" : "neutral", Icon: Clock },
    { label: "Contingency Left", value: formatCurrencyShort(contingencyRemaining), sublabel: contingency > 0 ? `of ${formatCurrencyShort(contingency)}` : "not set", tone: contingency > 0 && consumedContingency > contingency ? "danger" : "neutral", Icon: ShieldAlert },
  ];

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
  ];

  // ── CSV export ──
  const handleExport = () => {
    const headers = ["Code", "Description", "Phase", "Budget", "Actual", "Committed", "Forecast", "EAC", "Variance", "% Used", "Status"];
    const rows = filteredRows.map((r) => {
      const v = r.committed_cost - r.revised_budget;
      const eac = r.actual_cost + Number((r as Record<string, unknown>).forecast_to_complete ?? 0);
      return [
        r.cost_code_number, r.description, r.phase,
        r.revised_budget, r.actual_cost, r.committed_cost,
        (r as Record<string, unknown>).forecast_to_complete ?? 0,
        eac, v, `${r.used_pct.toFixed(1)}%`,
        r.is_over ? "Over Budget" : r.used_pct > 85 ? "Watch" : "On Track",
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cost_control_center.csv";
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="cost-cc">
      <PageHero
        Icon={DollarSign}
        title="Cost Control Center"
        subtitle="Budget · Actual · Committed · Forecast · Variance"
        chips={heroChips}
        stats={heroStats}
      />

      <KpiStrip cells={kpiCells} />

      {/* Lifted Recharts charts — inline-styled wrapper */}
      <CostChartRow
        barData={barData}
        cumulativeData={cumData}
        pieData={pieData}
        totalBudget={totalBudget}
        contingency={contingency}
      />

      {/* Decision panels */}
      <div className="cmd-panels">
        <DecisionPanel title="Cost Control Flags">
          {reviewFlags.map((f, i) => (
            <div key={i} className="cmd-row">
              <Pill tone={f.tone === "error" ? "danger" : "warn"}>
                {f.tone === "error" ? "Error" : "Warning"}
              </Pill>
              <span className="cmd-row__meta" style={{ flex: 1, marginLeft: 8 }}>{f.message}</span>
            </div>
          ))}
          {varianceAlerts.slice(0, 3).map((a) => (
            <div key={a.id ?? a.code} className="cmd-row">
              <Pill tone="danger">Over</Pill>
              <div style={{ marginLeft: 8, flex: 1 }}>
                <div className="cmd-row__num">{a.code}</div>
                <div className="cmd-row__meta">
                  {a.description} · +{formatCurrencyShort(a.variance)} ({a.pctOver.toFixed(1)}% over)
                </div>
              </div>
            </div>
          ))}
          {reviewFlags.length === 0 && varianceAlerts.length === 0 && (
            <div className="cmd-row__meta">No flags — cost codes look clean.</div>
          )}
        </DecisionPanel>

        <DecisionPanel title="Margin at Risk">
          {overBudgetCodes
            .slice()
            .sort((a, b) => (b.committed_cost - b.revised_budget) - (a.committed_cost - a.revised_budget))
            .slice(0, 6)
            .map((r) => {
              const overage = r.committed_cost - r.revised_budget;
              return (
                <div key={r.id} className="cmd-row is-clickable" onClick={() => handleRowClick(r)}>
                  <div>
                    <div className="cmd-row__num">{r.cost_code_number}</div>
                    <div className="cmd-row__meta">{r.description}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Pill tone="danger">+{formatCurrencyShort(overage)}</Pill>
                    <span className="cmd-row__meta">{r.used_pct.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          {overBudgetCodes.length === 0 && (
            <div className="cmd-row__meta">No over-budget codes.</div>
          )}
        </DecisionPanel>

        <DecisionPanel title="Change Order Pipeline">
          {/* Summary counts */}
          <div className="cmd-row" style={{ justifyContent: "space-around" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--status-warning)" }}>{coPending}</div>
              <div className="cmd-row__meta">Pending</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--status-success)" }}>{coApproved}</div>
              <div className="cmd-row__meta">Approved</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: coStale > 0 ? "var(--status-error)" : "var(--text-muted)" }}>{coStale}</div>
              <div className="cmd-row__meta">Stale &gt;30d</div>
            </div>
          </div>
          {topStaleCOs.map((co) => (
            <div key={co.id} className="cmd-row" style={{ borderLeft: "3px solid var(--status-warning)", paddingLeft: 10 }}>
              <div>
                <div className="cmd-row__num">{co.co_number}</div>
                <div className="cmd-row__meta">{co.title}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--status-warning)" }}>
                  {co.daysOpen}d open
                </div>
                <div className="cmd-row__meta" style={{ color: co.co_amount >= 0 ? "var(--status-success)" : "var(--status-error)" }}>
                  {formatCurrencyShort(co.co_amount)}
                </div>
              </div>
            </div>
          ))}
          {coPending === 0 && coStale === 0 && (
            <div className="cmd-row__meta">No pending or stale change orders.</div>
          )}
        </DecisionPanel>
      </div>

      {/* Filter bar */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search cost code, description, or phase"
        onExport={handleExport}
        primaryLabel={can("create", "cost_code") ? "Add Cost Code" : undefined}
        onPrimary={can("create", "cost_code") ? () => { setEditingCode(null); setModalOpen(true); } : null}
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
        costCode={editingCode}
        projects={project ? [project] : []}
        existingCodes={costCodes}
        onSave={(data: Record<string, unknown>) => {
          if (editingCode) {
            costCodeCrud.update.mutate({ id: editingCode.id as string, ...data });
          } else {
            costCodeCrud.create.mutate({ ...data, project_id: projectId });
          }
          setModalOpen(false);
          setEditingCode(null);
        }}
      />
    </div>
  );
}
