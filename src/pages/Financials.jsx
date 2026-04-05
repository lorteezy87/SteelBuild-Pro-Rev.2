import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import CostCodeFormModal from "@/components/financials/CostCodeFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import PageHeader from "@/components/shared/PageHeader";
import { PhoenixPanel } from "@/components/shared/PhoenixPanel";
import PhoenixTable, { PTR, PTD } from "@/components/shared/PhoenixTable";
import { formatCurrency, formatCurrencyShort, formatPercent } from "@/components/shared/formatters";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";

const mono = { fontFamily: "var(--font-mono)" };
const body = { fontFamily: "var(--font-body)" };

const VIEW_TABS = [
  { key: "summary", label: "Project Summary" },
  { key: "sov", label: "SOV Analysis" },
  { key: "budget", label: "Budget Control" },
  { key: "unmapped", label: "Unmapped Costs" },
];

const FAMILY_RULES = [
  { key: "detailing", label: "Detailing / Engineering", direct: true, test: (text) => /detail|engineering/.test(text) },
  { key: "material_family", label: "Material / Fasteners", direct: true, test: (text) => /anchor|embed|raw material|material|fastener/.test(text) },
  { key: "joist_deck_family", label: "Joist / Deck Buyout", direct: true, test: (text) => /joist|deck/.test(text) },
  { key: "shop_fab_family", label: "Shop Labor & Fabrication", direct: true, test: (text) => /shop|fab|fabrication/.test(text) },
  { key: "field_family", label: "Field Labor", direct: true, test: (text) => /field|erection|install/.test(text) },
  { key: "equipment_family", label: "Equipment / Crane", direct: true, test: (text) => /equipment|crane/.test(text) },
  { key: "shipping", label: "Shipping", direct: true, test: (text) => /shipping|freight|truck/.test(text) },
  { key: "special_coatings", label: "Special Coatings", direct: true, test: (text) => /coat|galv|paint/.test(text) },
  { key: "travel", label: "Travel / Out-of-Town", direct: false, test: (text) => /travel|hotel|per diem|out of town/.test(text) },
  { key: "indirect", label: "Indirect / General Conditions", direct: false, test: (text) => /pm\/admin|admin|indirect/.test(text) },
];

function getFamilyMeta(text) {
  const normalized = String(text || "").toLowerCase();
  const match = FAMILY_RULES.find((rule) => rule.test(normalized));
  return match || { key: "misc_family", label: "Misc / Catch-All", direct: false };
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatSigned(value) {
  const num = safeNumber(value);
  if (num === 0) return "-";
  return `${num > 0 ? "+" : "-"}${formatCurrency(Math.abs(num))}`;
}

function varianceColor(value) {
  if (value < 0) return "var(--status-error)";
  if (value > 0) return "var(--status-success)";
  return "var(--text-muted)";
}

function SummaryCard({ label, value, detail, tone = "var(--accent)" }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
        borderTop: `2px solid ${tone}`,
      }}
    >
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: tone, marginBottom: 4 }}>
        {value}
      </div>
      {detail ? <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>{detail}</div> : null}
    </div>
  );
}

function SectionTabs({ active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {VIEW_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          style={{
            background: active === tab.key ? "var(--accent)" : "var(--bg-surface-low)",
            color: active === tab.key ? "var(--accent-text)" : "var(--text-secondary)",
            border: `1px solid ${active === tab.key ? "var(--accent-border)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-btn)",
            padding: "7px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function FilterBar({ search, setSearch, filterPhase, setFilterPhase, phases }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search cost buckets, SOV lines, vendors, notes..."
        style={{
          minWidth: 280,
          flex: 1,
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-input)",
          padding: "9px 12px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          fontSize: 12,
        }}
      />
      <select
        value={filterPhase}
        onChange={(event) => setFilterPhase(event.target.value)}
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-input)",
          padding: "9px 12px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
        }}
      >
        <option value="all">ALL COST FAMILIES</option>
        {phases.map((phase) => (
          <option key={phase} value={phase}>
            {phase.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReviewFlags({ flags }) {
  return (
    <PhoenixPanel title="Review Flags" count={flags.length}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px" }}>
        {flags.length === 0 ? (
          <div style={{ ...mono, fontSize: 9, color: "var(--status-success)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            No immediate financial flags
          </div>
        ) : (
          flags.map((flag) => (
            <div
              key={flag.title}
              style={{
                background: flag.tone === "error" ? "var(--danger-muted)" : "var(--warning-muted)",
                border: `1px solid ${flag.tone === "error" ? "var(--danger-border)" : "var(--warning-border)"}`,
                borderRadius: "var(--radius-card)",
                padding: "10px 12px",
              }}
            >
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: flag.tone === "error" ? "var(--status-error)" : "var(--status-warning)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                {flag.title}
              </div>
              <div style={{ ...body, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {flag.body}
              </div>
            </div>
          ))
        )}
      </div>
    </PhoenixPanel>
  );
}

export default function Financials() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [filterPhase, setFilterPhase] = useState("all");
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("summary");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCostCode, setEditingCostCode] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: costCodes = [] } = useQuery({
    queryKey: ["cost-codes", projectId],
    queryFn: () => (projectId ? base44.entities.CostCode.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: () => (projectId ? base44.entities.ChangeOrder.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", projectId],
    queryFn: () => (projectId ? base44.entities.Expense.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov-items", projectId],
    queryFn: () => (projectId ? base44.entities.SOVItem.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const costCodeQueryKeys = [["cost-codes", projectId], ["cost-codes"]];

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.CostCode.create(data),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, costCodeQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, costCodeQueryKeys);
      setModalOpen(false);
      setEditingCostCode(null);
    },
    onError: (error) => toastCrudError(error, "Failed to create cost code"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CostCode.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, costCodeQueryKeys, updated);
      await invalidateCrudQueries(qc, costCodeQueryKeys);
      setModalOpen(false);
      setEditingCostCode(null);
    },
    onError: (error) => toastCrudError(error, "Failed to update cost code"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.CostCode.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, costCodeQueryKeys, deletedId);
      await invalidateCrudQueries(qc, costCodeQueryKeys);
      setDeleteTarget(null);
    },
    onError: (error) => toastCrudError(error, "Failed to delete cost code"),
  });

  const selectedProject = projectId ? projects.find((project) => project.id === projectId) : null;
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
      const relatedExpenses = activeExpenses.filter((expense) => expense.cost_code === costCode.cost_code_number || expense.cost_code_id === costCode.id);
      const actual = relatedExpenses
        .filter((expense) => expense.payment_status === "Paid")
        .reduce((sum, expense) => sum + safeNumber(expense.amount), 0);
      const committed = relatedExpenses.reduce((sum, expense) => sum + safeNumber(expense.amount), 0);
      const signedExtras = safeNumber(byCostCodeId[costCode.id]);
      const revisedBudget = safeNumber(costCode.budget_amount);
      const originalEstimate = revisedBudget - signedExtras;
      const exposure = actual + committed;
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
    if (Math.abs(summary.sovVsContract) > 1) {
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
    const zeroCommitted = costCodeRows.filter((row) => row.committed_cost === 0 && row.actual_cost === 0 && row.revised_budget > 0);
    if (zeroCommitted.length > 0) {
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
      <PageHeader
        title="Budget Control"
        subtitle={`${selectedProject?.name || "Project"} • workbook-style financial control`}
        onAdd={() => {
          setEditingCostCode(null);
          setModalOpen(true);
        }}
        onRefresh={() => {
          invalidateCrudQueries(qc, costCodeQueryKeys);
          qc.invalidateQueries({ queryKey: ["expenses", projectId] });
          qc.invalidateQueries({ queryKey: ["sov-items", projectId] });
          qc.invalidateQueries({ queryKey: ["change-orders", projectId] });
        }}
        addLabel="New Cost Code"
      />

      <SectionTabs active={activeView} onChange={setActiveView} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <SummaryCard label="Contract Value" value={formatCurrencyShort(summary.contractValue)} detail={`Project ${selectedProject?.project_number || "—"}`} />
        <SummaryCard label="SOV Total" value={formatCurrencyShort(summary.sovTotal)} detail={`Variance to contract ${formatSigned(summary.sovVsContract)}`} tone={Math.abs(summary.sovVsContract) > 1 ? "var(--status-warning)" : "var(--accent)"} />
        <SummaryCard label="Revised Budget" value={formatCurrencyShort(summary.revisedBudget)} detail={`Approved extras ${formatCurrencyShort(summary.approvedExtras)}`} tone="var(--status-info)" />
        <SummaryCard label="Actual Cost" value={formatCurrencyShort(summary.actual)} detail={`Committed ${formatCurrencyShort(summary.committed)}`} tone="var(--status-warning)" />
        <SummaryCard label="Exposure" value={formatCurrencyShort(summary.exposure)} detail={`Budget used ${formatPercent(summary.budgetSpentPct, 1)}`} tone={summary.remainingBudget < 0 ? "var(--status-error)" : "var(--status-warning)"} />
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
                <PTD right mono style={{ color: row.used_pct > 100 ? "var(--status-error)" : row.used_pct > 85 ? "var(--status-warning)" : "var(--text-secondary)" }}>{formatPercent(row.used_pct, 1)}</PTD>
                <PTD>{row.family_label}</PTD>
                <PTD mono>{row.direct_billable ? "YES" : "REVIEW"}</PTD>
                <PTD right>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingCostCode(row);
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

      <CostCodeFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingCostCode(null);
        }}
        onSave={(data) => {
          const payload = { ...data, project_id: data.project_id || projectId };
          if (editingCostCode?.id) updateMut.mutate({ id: editingCostCode.id, data: payload });
          else createMut.mutate(payload);
        }}
        costCode={editingCostCode}
        projects={projects}
        existingCodes={costCodes}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete Cost Code"
        description={`Delete ${deleteTarget?.cost_code_number || "cost code"}?`}
      />
    </div>
  );
}
