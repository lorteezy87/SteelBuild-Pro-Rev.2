import React, { useMemo, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { useFinancials } from "@/hooks/useFinancials";
import { useCostCodes } from "@/hooks/useCostCodes";
import CostCodeFormModal from "@/components/financials/CostCodeFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, BulkActionBar } from "@/components/design-system";
import { PhoenixPanel } from "@/components/shared/PhoenixPanel";
import { Plus, RefreshCw, Trash2, Tag } from "lucide-react";
import PhoenixTable, { PTR, PTD } from "@/components/shared/PhoenixTable";
import { formatCurrency, formatCurrencyShort, formatPercent, formatBudgetPercent } from "@/components/shared/formatters";
import { invalidateCrudQueries } from "@/components/shared/crudFeedback";
import {
  mono,
  body,
  getFamilyMeta,
  safeNumber,
  formatSigned,
  varianceColor,
} from "@/pages/financials/utils";
import { SummaryCard, KPIStrip } from "@/pages/financials/KPIStrip";
import { SectionTabs, FilterBar, ReviewFlags } from "@/pages/financials/FilterBar";
import { COImpactDrawer } from "@/pages/financials/drawers/COImpactDrawer";
import { LaborDrawer } from "@/pages/financials/drawers/LaborDrawer";
import { BillingDrawer } from "@/pages/financials/drawers/BillingDrawer";
import { DSODrawer } from "@/pages/financials/drawers/DSODrawer";

export default function Financials() {
  const projectId = useProjectId();
  const [filterPhase, setFilterPhase] = useState("all");
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("summary");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCostCode, setEditingCostCode] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkPhaseTarget, setBulkPhaseTarget] = useState(null);
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const {
    costCodes,
    createCostCode,
    updateCostCode,
    deleteCostCode,
    bulkDeleteCostCodes,
    bulkUpdateCostCodes,
  } = useCostCodes(projectId);

  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: () => (projectId ? entities.ChangeOrder.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", projectId],
    queryFn: () => (projectId ? entities.Expense.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov-items", projectId],
    queryFn: () => (projectId ? entities.SOVItem.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  const costCodeQueryKeys = [["cost-codes", projectId], ["cost-codes"]];

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCostCodeRows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredCostCodeRows.map((r) => r.id)));
  };

  const selectedProject = projectId ? projects.find((project) => project.id === projectId) : null;

  // ── Executive KPIs via useFinancials (Phase 4) ─────────────────────
  // Uses the centralized hook ONLY for the four KPI objects.
  // Existing local queries + calculations below are intentionally untouched.
  const {
    changeOrderImpact,
    laborUtilization,
    billingVsCost,
    daysSalesOutstanding,
    isLoading: kpiLoading,
  } = useFinancials(projectId, selectedProject);
  const [activeDrawer, setActiveDrawer] = useState(null);

  const approvedChangeOrders = useMemo(() => changeOrders.filter((changeOrder) => changeOrder.status === "Approved"), [changeOrders]);
  const activeExpenses = useMemo(() => expenses.filter((expense) => expense.payment_status !== "Voided"), [expenses]);

  const costCodeRows = useMemo(() => {
    const byCostCodeId = approvedChangeOrders.reduce((acc, changeOrder) => {
      const key = changeOrder.cost_code_id || "__unmapped__";
      if (!acc[key]) acc[key] = 0;
      acc[key] += safeNumber(changeOrder.co_amount);
      return acc;
    }, {});

    return costCodes.map((costCode) => {
      // expenses.cost_code holds the cost-code NUMBER (text); the schema has
      // no cost_code_id on expenses, so matching by cost_code_number is the
      // only path. (change_orders / sov_items DO have cost_code_id — that is
      // why byCostCodeId on line above is correct for COs.)
      const relatedExpenses = activeExpenses.filter((expense) => expense.cost_code === costCode.cost_code_number);
      const actual = relatedExpenses
        .filter((expense) => expense.payment_status === "Paid")
        .reduce((sum, expense) => sum + safeNumber(expense.amount), 0);
      const committed = relatedExpenses.reduce((sum, expense) => sum + safeNumber(expense.amount), 0);
      const signedExtras = safeNumber(byCostCodeId[costCode.id]);
      const originalBudget = safeNumber(costCode.budget_amount);
      const revisedBudget = originalBudget + signedExtras;
      const originalEstimate = originalBudget;
      // Committed already includes paid (actual) amounts — don't double-count
      const exposure = committed;
      const remainingBudget = revisedBudget - exposure;
      const usedPct = revisedBudget > 0 ? (exposure / revisedBudget) * 100 : 0;
      const family = getFamilyMeta(`${costCode.phase || ""} ${costCode.description || ""}`);

      return {
        ...costCode,
        actual_cost: actual,
        committed_cost: committed,
        signed_extras: signedExtras,
        original_estimate: originalEstimate,
        revised_budget: revisedBudget,
        exposure,
        remaining_budget: remainingBudget,
        used_pct: usedPct,
        family_label: family.label,
        direct_billable: family.direct,
      };
    });
  }, [activeExpenses, approvedChangeOrders, costCodes]);

  const families = useMemo(() => [...new Set(costCodeRows.map((row) => row.phase).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))), [costCodeRows]);
  const costCodeMap = useMemo(() => new Map(costCodeRows.map((row) => [row.cost_code_number, row])), [costCodeRows]);

  const filteredCostCodeRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return costCodeRows.filter((row) => {
      const phaseMatch = filterPhase === "all" || row.phase === filterPhase;
      if (!phaseMatch) return false;
      if (!q) return true;
      return [row.cost_code_number, row.description, row.phase, row.family_label].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [costCodeRows, filterPhase, search]);

  const groupedSovRows = useMemo(() => {
    const familyTotals = {};
    sovItems.forEach((item) => {
      const family = getFamilyMeta(item.description);
      if (!familyTotals[family.key]) {
        familyTotals[family.key] = { scheduled: 0, budget: 0, actual: 0, committed: 0, remaining: 0 };
      }
      familyTotals[family.key].scheduled += safeNumber(item.scheduled_value);
    });

    costCodeRows.forEach((row) => {
      const family = getFamilyMeta(`${row.phase || ""} ${row.description || ""}`);
      if (!familyTotals[family.key]) {
        familyTotals[family.key] = { scheduled: 0, budget: 0, actual: 0, committed: 0, remaining: 0 };
      }
      familyTotals[family.key].budget += safeNumber(row.revised_budget);
      familyTotals[family.key].actual += safeNumber(row.actual_cost);
      familyTotals[family.key].committed += safeNumber(row.committed_cost);
      familyTotals[family.key].remaining += safeNumber(row.remaining_budget);
    });

    return sovItems.map((item) => {
      const scheduledValue = safeNumber(item.scheduled_value);
      const family = getFamilyMeta(item.description);
      const totals = familyTotals[family.key] || { scheduled: 0, budget: 0, actual: 0, committed: 0, remaining: 0 };
      const share = totals.scheduled > 0 ? scheduledValue / totals.scheduled : 0;
      const percentOfContract = safeNumber(selectedProject?.revised_contract_value || selectedProject?.original_contract_value) > 0
        ? (scheduledValue / safeNumber(selectedProject?.revised_contract_value || selectedProject?.original_contract_value)) * 100
        : 0;
      const expenseActual = activeExpenses
        .filter((expense) => expense.sov_line_item_id === item.id)
        .reduce((sum, expense) => sum + safeNumber(expense.amount), 0);

      return {
        ...item,
        family_label: family.label,
        direct_billable: family.direct,
        allocation_share: share,
        percent_of_contract: percentOfContract,
        allocated_budget: totals.budget * share,
        allocated_actual: expenseActual || totals.actual * share,
        allocated_committed: totals.committed * share,
        allocated_remaining: totals.remaining * share,
      };
    });
  }, [activeExpenses, costCodeRows, selectedProject, sovItems]);

  const filteredSovRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupedSovRows.filter((row) => !q || [row.line_item_number, row.description, row.family_label].some((value) => String(value || "").toLowerCase().includes(q)));
  }, [groupedSovRows, search]);

  const unmappedExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeExpenses
      .filter((expense) => {
        const costCode = expense.cost_code ? costCodeMap.get(expense.cost_code) : null;
        const isUnmapped = !expense.cost_code || !costCode;
        if (!isUnmapped) return false;
        if (!q) return true;
        return [expense.vendor, expense.description, expense.expense_type, expense.invoice_number, expense.cost_code].some((value) =>
          String(value || "").toLowerCase().includes(q)
        );
      })
      .map((expense) => ({
        ...expense,
        reason: !expense.cost_code ? "Missing cost code" : "Cost code not found in project budget",
      }));
  }, [activeExpenses, costCodeMap, search]);

  const summary = useMemo(() => {
    const contractValue = safeNumber(selectedProject?.revised_contract_value || selectedProject?.original_contract_value);
    const sovTotal = sovItems.reduce((sum, item) => sum + safeNumber(item.scheduled_value), 0);
    const revisedBudget = costCodeRows.reduce((sum, row) => sum + safeNumber(row.revised_budget), 0);
    const actual = costCodeRows.reduce((sum, row) => sum + safeNumber(row.actual_cost), 0);
    const committed = costCodeRows.reduce((sum, row) => sum + safeNumber(row.committed_cost), 0);
    const exposure = costCodeRows.reduce((sum, row) => sum + safeNumber(row.exposure), 0);
    const remainingBudget = revisedBudget - exposure;
    const approvedExtras = approvedChangeOrders.reduce((sum, changeOrder) => sum + safeNumber(changeOrder.co_amount), 0);
    const budgetSpentPct = revisedBudget > 0 ? (exposure / revisedBudget) * 100 : 0;
    const sovVsContract = contractValue > 0 ? sovTotal - contractValue : 0;
    const marginAtRisk = contractValue - exposure;

    return {
      contractValue,
      sovTotal,
      sovVsContract,
      revisedBudget,
      actual,
      committed,
      exposure,
      remainingBudget,
      approvedExtras,
      budgetSpentPct,
      marginAtRisk,
    };
  }, [approvedChangeOrders, costCodeRows, selectedProject, sovItems]);

  const reviewFlags = useMemo(() => {
    const flags = [];
    // SOV mismatch: only flag when SOV items actually exist — an empty SOV
    // is expected on new projects and shouldn't trigger a warning.
    if (summary.sovTotal > 0 && summary.contractValue > 0 && Math.abs(summary.sovVsContract) > 1) {
      flags.push({
        title: "SOV mismatch",
        body: `Schedule of values totals ${formatSigned(summary.sovVsContract)} against the project contract. The workbook treats this as a review item before billing.`,
        tone: "warning",
      });
    }
    if (summary.remainingBudget < 0) {
      flags.push({
        title: "Budget overrun",
        body: `Current exposure exceeds revised budget by ${formatCurrency(Math.abs(summary.remainingBudget))}.`,
        tone: "error",
      });
    }
    if (unmappedExpenses.length > 0) {
      flags.push({
        title: "Unmapped costs",
        body: `${unmappedExpenses.length} expense ${unmappedExpenses.length === 1 ? "record needs" : "records need"} review before they can be tied to a billable SOV line.`,
        tone: "warning",
      });
    }
    // Committed cost gap: only flag when at least some cost codes have
    // activity — if every code is at zero, the project is still in setup
    // and the flag is noise rather than a useful control.
    const codesWithBudget = costCodeRows.filter((row) => row.revised_budget > 0);
    const zeroCommitted = codesWithBudget.filter((row) => row.committed_cost === 0 && row.actual_cost === 0);
    const codesWithActivity = codesWithBudget.length - zeroCommitted.length;
    if (zeroCommitted.length > 0 && codesWithActivity > 0) {
      flags.push({
        title: "Committed cost gap",
        body: `${zeroCommitted.length} cost buckets have revised budget but no actual or committed cost. The spreadsheet treats this as a control check for missing POs or buyouts.`,
        tone: "warning",
      });
    }
    return flags;
  }, [costCodeRows, summary, unmappedExpenses.length]);

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>$</div>
        <div style={{ ...body, fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>
          Select a project to view financial control
        </div>
        <div style={{ ...body, fontSize: 12, color: "var(--text-muted)" }}>
          Use the project selector in the top right.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <CommandBar
        eyebrow={selectedProject?.name || "FINANCIALS"}
        title="Budget Control"
        count={costCodes.length}
        unit=" · COST CODES"
        subtitle={`Workbook-style financial control · ${formatCurrencyShort(summary.revisedBudget)} revised budget`}
      >
        <button
          onClick={() => {
            invalidateCrudQueries(qc, costCodeQueryKeys);
            qc.invalidateQueries({ queryKey: ["expenses", projectId] });
            qc.invalidateQueries({ queryKey: ["sov-items", projectId] });
            qc.invalidateQueries({ queryKey: ["change-orders", projectId] });
          }}
          title="Refresh"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "8px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase" }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
        <button
          onClick={() => { setEditingCostCode(null); setModalOpen(true); }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "var(--bg-base)", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> New Cost Code
        </button>
      </CommandBar>

      {/* ── Executive KPI Strip (Phase 4) ── */}
      <KPIStrip
        kpis={{ changeOrderImpact, laborUtilization, billingVsCost, daysSalesOutstanding }}
        loading={kpiLoading}
        onCardClick={(drawer) => setActiveDrawer(drawer)}
      />

      {reviewFlags.length > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          background: "var(--danger-muted)",
          border: "1px solid var(--danger-border)",
          borderLeft: "4px solid var(--status-error)",
          borderRadius: "var(--radius-card)",
          flexWrap: "wrap",
        }}>
          <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>
            ⚑ {reviewFlags.length} FLAG{reviewFlags.length > 1 ? "S" : ""} REQUIRE REVIEW
          </span>
          {reviewFlags.map((flag) => (
            <div key={flag.title} style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: flag.tone === "error" ? "rgba(255,61,61,0.12)" : "rgba(245,158,11,0.12)",
              border: `1px solid ${flag.tone === "error" ? "rgba(255,61,61,0.30)" : "rgba(245,158,11,0.30)"}`,
              borderRadius: 4,
              padding: "3px 10px",
            }}>
              <span style={{ ...mono, fontSize: 8, fontWeight: 700, color: flag.tone === "error" ? "var(--status-error)" : "var(--status-warning)", letterSpacing: "0.10em" }}>
                {flag.title.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      <SectionTabs active={activeView} onChange={setActiveView} />

      {costCodes.length === 0 && sovItems.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 14 }}>
          <div style={{ ...mono, fontSize: 48, opacity: 0.15, lineHeight: 1 }}>$</div>
          <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--text-disabled)" }}>
            Awaiting SOV Upload
          </div>
          <div style={{ ...body, fontSize: 12, color: "var(--text-muted)", maxWidth: 360, textAlign: "center", lineHeight: 1.6 }}>
            Add cost codes to build your budget, then upload a Schedule of Values to enable billing analysis and variance tracking.
          </div>
          <button
            onClick={() => { setEditingCostCode(null); setModalOpen(true); }}
            style={{
              marginTop: 8,
              padding: "9px 20px",
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              borderRadius: "var(--radius-btn)",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            + Add First Cost Code
          </button>
        </div>
      ) : (<>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <SummaryCard label="Contract Value" value={formatCurrencyShort(summary.contractValue)} detail={`Project ${selectedProject?.project_number || "—"}`} />
        <SummaryCard label="SOV Total" value={formatCurrencyShort(summary.sovTotal)} detail={`Variance to contract ${formatSigned(summary.sovVsContract)}`} tone={Math.abs(summary.sovVsContract) > 1 ? "var(--status-warning)" : "var(--accent)"} />
        <SummaryCard label="Revised Budget" value={formatCurrencyShort(summary.revisedBudget)} detail={`Approved extras ${formatCurrencyShort(summary.approvedExtras)}`} tone="var(--status-info)" />
        <SummaryCard label="Actual Cost" value={formatCurrencyShort(summary.actual)} detail={`Committed ${formatCurrencyShort(summary.committed)}`} tone="var(--status-warning)" />
        <SummaryCard label="Exposure" value={formatCurrencyShort(summary.exposure)} detail={`Budget used ${formatBudgetPercent(summary.budgetSpentPct, 1)}`} tone={summary.remainingBudget < 0 ? "var(--status-error)" : "var(--status-warning)"} />
        <SummaryCard label="Budget Remaining" value={formatSigned(summary.remainingBudget)} detail={`Margin at risk ${formatCurrencyShort(summary.marginAtRisk)}`} tone={summary.remainingBudget < 0 ? "var(--status-error)" : "var(--status-success)"} />
      </div>

      <FilterBar search={search} setSearch={setSearch} filterPhase={filterPhase} setFilterPhase={setFilterPhase} phases={families} />

      {activeView === "summary" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.9fr", gap: 16 }}>
          <PhoenixPanel title="Project Summary" count={selectedProject?.project_number || "—"}>
            <PhoenixTable
              columns={[
                { label: "Project" },
                { label: "Job #" },
                { label: "Manager" },
                { label: "Superintendent" },
                { label: "Contract", right: true },
                { label: "SOV Total", right: true },
                { label: "Revised Budget", right: true },
                { label: "Actual", right: true },
                { label: "Committed", right: true },
                { label: "Exposure", right: true },
                { label: "Remaining", right: true },
              ]}
            >
              <PTR>
                <PTD bold>{selectedProject?.name}</PTD>
                <PTD mono>{selectedProject?.project_number || "—"}</PTD>
                <PTD>{selectedProject?.project_manager || "—"}</PTD>
                <PTD>{selectedProject?.superintendent || "—"}</PTD>
                <PTD right mono>{formatCurrency(summary.contractValue)}</PTD>
                <PTD right mono>{formatCurrency(summary.sovTotal)}</PTD>
                <PTD right mono>{formatCurrency(summary.revisedBudget)}</PTD>
                <PTD right mono>{formatCurrency(summary.actual)}</PTD>
                <PTD right mono>{formatCurrency(summary.committed)}</PTD>
                <PTD right mono>{formatCurrency(summary.exposure)}</PTD>
                <PTD right mono style={{ color: varianceColor(summary.remainingBudget) }}>{formatSigned(summary.remainingBudget)}</PTD>
              </PTR>
            </PhoenixTable>
          </PhoenixPanel>

          <ReviewFlags flags={reviewFlags} />
        </div>
      )}

      {activeView === "sov" && (
        <PhoenixPanel title="SOV Analysis" count={filteredSovRows.length}>
          <PhoenixTable
            columns={[
              { label: "SOV Seq" },
              { label: "Description" },
              { label: "SOV Value", right: true },
              { label: "% Contract", right: true },
              { label: "Recommended Cost Family" },
              { label: "Alloc. Share", right: true },
              { label: "Allocated Revised Budget", right: true },
              { label: "Allocated Actual", right: true },
              { label: "Allocated Committed", right: true },
              { label: "Allocated Remaining", right: true },
            ]}
            empty="NO SOV ITEMS FOUND"
          >
            {filteredSovRows.map((row) => (
              <PTR key={row.id}>
                <PTD mono accent>{row.line_item_number || "—"}</PTD>
                <PTD style={{ maxWidth: 220, whiteSpace: "normal" }}>{row.description || "—"}</PTD>
                <PTD right mono>{formatCurrency(row.scheduled_value)}</PTD>
                <PTD right mono>{formatPercent(row.percent_of_contract, 1)}</PTD>
                <PTD>{row.family_label}</PTD>
                <PTD right mono>{formatPercent(row.allocation_share * 100, 1)}</PTD>
                <PTD right mono>{formatCurrency(row.allocated_budget)}</PTD>
                <PTD right mono>{formatCurrency(row.allocated_actual)}</PTD>
                <PTD right mono>{formatCurrency(row.allocated_committed)}</PTD>
                <PTD right mono style={{ color: varianceColor(row.allocated_remaining) }}>{formatSigned(row.allocated_remaining)}</PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}

      {activeView === "budget" && (
        <PhoenixPanel title="Budget Control" count={filteredCostCodeRows.length}>
          <PhoenixTable
            columns={[
              { label: <span onClick={toggleSelectAll} style={{ cursor: "pointer" }}>{selectedIds.size > 0 && selectedIds.size === filteredCostCodeRows.length ? "☑" : "☐"}</span> },
              { label: "Cost Bucket" },
              { label: "Original Estimate", right: true },
              { label: "Signed Extras", right: true },
              { label: "Revised Budget", right: true },
              { label: "Actual Cost", right: true },
              { label: "Committed Cost", right: true },
              { label: "Exposure", right: true },
              { label: "Remaining Budget", right: true },
              { label: "Used %", right: true },
              { label: "Suggested SOV Family" },
              { label: "Direct Billable?" },
              { label: "Actions", right: true },
            ]}
            empty="NO COST BUCKETS FOUND"
          >
            {filteredCostCodeRows.map((row) => (
              <PTR key={row.id} overdue={row.remaining_budget < 0} warn={row.used_pct > 85 && row.remaining_budget >= 0}>
                <PTD>
                  <span onClick={(e) => { e.stopPropagation(); toggleSelect(row.id); }} style={{ cursor: "pointer", fontSize: 13 }}>
                    {selectedIds.has(row.id) ? "☑" : "☐"}
                  </span>
                </PTD>
                <PTD style={{ maxWidth: 220, whiteSpace: "normal" }}>
                  <div style={{ ...mono, fontSize: 10, color: "var(--accent)", marginBottom: 2 }}>{row.cost_code_number || "—"}</div>
                  <div style={{ ...body, fontSize: 12, color: "var(--text-primary)" }}>{row.description || "—"}</div>
                  <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>{row.phase || "Unassigned"}</div>
                </PTD>
                <PTD right mono>{formatCurrency(row.original_estimate)}</PTD>
                <PTD right mono>{formatSigned(row.signed_extras)}</PTD>
                <PTD right mono>{formatCurrency(row.revised_budget)}</PTD>
                <PTD right mono>{formatCurrency(row.actual_cost)}</PTD>
                <PTD right mono>{formatCurrency(row.committed_cost)}</PTD>
                <PTD right mono>{formatCurrency(row.exposure)}</PTD>
                <PTD right mono style={{ color: varianceColor(row.remaining_budget) }}>{formatSigned(row.remaining_budget)}</PTD>
                <PTD right mono style={{ color: row.used_pct > 100 ? "var(--status-error)" : row.used_pct > 85 ? "var(--status-warning)" : "var(--text-secondary)" }}>{formatBudgetPercent(row.used_pct, 1)}</PTD>
                <PTD>{row.family_label}</PTD>
                <PTD mono>{row.direct_billable ? "YES" : "REVIEW"}</PTD>
                <PTD right>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        // Strip computed display fields so they don't poison the save payload.
                        // Pass only the original DB record from costCodes array.
                        const dbRecord = costCodes.find((c) => c.id === row.id) || row;
                        setEditingCostCode(dbRecord);
                        setModalOpen(true);
                      }}
                      style={{
                        background: "var(--bg-surface-low)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-btn)",
                        padding: "6px 8px",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(row);
                      }}
                      style={{
                        background: "var(--danger-muted)",
                        border: "1px solid var(--danger-border)",
                        borderRadius: "var(--radius-btn)",
                        padding: "6px 8px",
                        color: "var(--status-error)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}

      {activeView === "unmapped" && (
        <PhoenixPanel title="Unmapped Costs" count={unmappedExpenses.length}>
          <PhoenixTable
            columns={[
              { label: "Expense #" },
              { label: "Vendor" },
              { label: "Description" },
              { label: "Amount", right: true },
              { label: "Status" },
              { label: "Cost Code" },
              { label: "Reason" },
              { label: "Invoice Date" },
            ]}
            empty="NO UNMAPPED COSTS FOUND"
          >
            {unmappedExpenses.map((expense) => (
              <PTR key={expense.id} warn>
                <PTD mono accent>{expense.expense_number || "—"}</PTD>
                <PTD>{expense.vendor || "—"}</PTD>
                <PTD style={{ maxWidth: 260, whiteSpace: "normal" }}>{expense.description || "—"}</PTD>
                <PTD right mono>{formatCurrency(expense.amount)}</PTD>
                <PTD mono>{expense.payment_status || "—"}</PTD>
                <PTD mono>{expense.cost_code || "—"}</PTD>
                <PTD>{expense.reason}</PTD>
                <PTD mono>{expense.invoice_date || "—"}</PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}
      </>)}

      <CostCodeFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingCostCode(null);
        }}
        onSave={(data) => {
          const payload = { ...data, project_id: data.project_id || projectId };
          const onSuccess = () => { setModalOpen(false); setEditingCostCode(null); };
          if (editingCostCode?.id) updateCostCode.mutate({ id: editingCostCode.id, data: payload }, { onSuccess });
          else createCostCode.mutate(payload, { onSuccess });
        }}
        costCode={editingCostCode}
        projects={projects}
        existingCodes={costCodes}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteCostCode.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
        title="Delete Cost Code"
        description={`Delete ${deleteTarget?.cost_code_number || "cost code"}?`}
      />

      {/* ── CO Impact Detail Drawer (Phase 4 Step 2) ── */}
      <COImpactDrawer
        open={activeDrawer === "co"}
        onClose={() => setActiveDrawer(null)}
        kpi={changeOrderImpact}
        changeOrders={changeOrders}
        selectedProject={selectedProject}
      />

      {/* ── Labor Utilization Detail Drawer (Phase 4 Step 3) ── */}
      <LaborDrawer
        open={activeDrawer === "labor"}
        onClose={() => setActiveDrawer(null)}
        kpi={laborUtilization}
        selectedProject={selectedProject}
      />

      {/* ── Billing vs. Cost Detail Drawer (Phase 4 Step 4) ── */}
      <BillingDrawer
        open={activeDrawer === "billing"}
        onClose={() => setActiveDrawer(null)}
        kpi={billingVsCost}
        sovItems={sovItems}
      />

      {/* ── DSO Detail Drawer (Phase 4 Step 5) ── */}
      <DSODrawer
        open={activeDrawer === "dso"}
        onClose={() => setActiveDrawer(null)}
        kpi={daysSalesOutstanding}
        sovItems={sovItems}
      />

      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: "Change Phase",
            icon: Tag,
            onClick: () => {
              const phase = window.prompt("Enter new phase for selected cost codes:");
              if (phase != null) bulkUpdateCostCodes.mutate(
                { ids: [...selectedIds], data: { phase } },
                { onSuccess: () => { setSelectedIds(new Set()); setBulkPhaseTarget(null); } },
              );
            },
          },
          {
            label: "Delete Selected",
            icon: Trash2,
            variant: "danger",
            onClick: () => setBulkDeleteOpen(true),
          },
        ]}
      />

      <DeleteDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => bulkDeleteCostCodes.mutate([...selectedIds], { onSuccess: () => { setSelectedIds(new Set()); setBulkDeleteOpen(false); } })}
        title="Delete Cost Codes"
        description={`Delete ${selectedIds.size} selected cost code${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
      />
    </div>
  );
}
