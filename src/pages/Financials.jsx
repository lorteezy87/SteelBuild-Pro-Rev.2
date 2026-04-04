import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import CostCodeFormModal from "@/components/financials/CostCodeFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ExpenseFormModal from "@/components/expenses/ExpenseFormModal";
import SOVFormModal from "@/components/sov/SOVFormModal";
import PageHeader from "@/components/shared/PageHeader";
import { PhoenixPanel } from "@/components/shared/PhoenixPanel";
import PhoenixTable, { PTR, PTD } from "@/components/shared/PhoenixTable";
import { formatCurrency, formatCurrencyShort, formatPercent } from "@/components/shared/formatters";
import { getNextNumber } from "@/components/shared/numberSequencing";
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
  { key: "budget", label: "Budget Control" },
  { key: "sov", label: "SOV Control" },
  { key: "expenses", label: "Expense Ledger" },
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

function buildCostCodePayload(data, projects = []) {
  const project = projects.find((item) => item.id === data.project_id);
  return {
    cost_code_number: data.cost_code_number || "",
    description: data.description || "",
    budget_amount: safeNumber(data.budget_amount),
    actual_cost: safeNumber(data.actual_cost),
    committed_cost: safeNumber(data.committed_cost),
    forecast_to_complete: safeNumber(data.forecast_to_complete),
    project_id: data.project_id || "",
    project_name: project?.name || data.project_name || "",
    notes: data.notes || "",
    phase: data.phase || "Materials",
  };
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
            color: active === tab.key ? "#0A0A0B" : "var(--text-secondary)",
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

function ToolbarButton({ label, onClick, tone = "default" }) {
  const styles = {
    default: {
      background: "var(--bg-surface-low)",
      border: "1px solid var(--border-default)",
      color: "var(--text-secondary)",
    },
    accent: {
      background: "var(--accent)",
      border: "1px solid var(--accent-border)",
      color: "#0A0A0B",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...styles[tone],
        borderRadius: "var(--radius-btn)",
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export default function Financials() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const navigate = useNavigate();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [filterPhase, setFilterPhase] = useState("all");
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("summary");
  const [costCodeModalOpen, setCostCodeModalOpen] = useState(false);
  const [editingCostCode, setEditingCostCode] = useState(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [sovModalOpen, setSovModalOpen] = useState(false);
  const [editingSov, setEditingSov] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteMode, setDeleteMode] = useState(null);
  const qc = useQueryClient();

  const { data: projects = [], isLoading: projectsLoading, isError: projectsError, error: projectsErrorDetails } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: costCodes = [], isLoading: costCodesLoading, isError: costCodesError, error: costCodesErrorDetails } = useQuery({
    queryKey: ["cost-codes", projectId],
    queryFn: () => (projectId ? base44.entities.CostCode.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const { data: changeOrders = [], isLoading: changeOrdersLoading, isError: changeOrdersError, error: changeOrdersErrorDetails } = useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: () => (projectId ? base44.entities.ChangeOrder.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const { data: expenses = [], isLoading: expensesLoading, isError: expensesError, error: expensesErrorDetails } = useQuery({
    queryKey: ["expenses", projectId],
    queryFn: () => (projectId ? base44.entities.Expense.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const { data: sovItems = [], isLoading: sovItemsLoading, isError: sovItemsError, error: sovItemsErrorDetails } = useQuery({
    queryKey: ["sov-items", projectId],
    queryFn: () => (projectId ? base44.entities.SOVItem.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const { data: workPackages = [], isLoading: workPackagesLoading, isError: workPackagesError, error: workPackagesErrorDetails } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => (projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const costCodeQueryKeys = [["cost-codes", projectId], ["cost-codes"]];
  const expenseQueryKeys = [["expenses", projectId], ["expenses"]];
  const sovQueryKeys = [["sov-items", projectId], ["sov-items"]];

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.CostCode.create(buildCostCodePayload(data, projects)),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, costCodeQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, costCodeQueryKeys);
      setCostCodeModalOpen(false);
      setEditingCostCode(null);
    },
    onError: (error) => toastCrudError(error, "Failed to create cost code"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CostCode.update(id, buildCostCodePayload(data, projects)),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, costCodeQueryKeys, updated);
      await invalidateCrudQueries(qc, costCodeQueryKeys);
      setCostCodeModalOpen(false);
      setEditingCostCode(null);
    },
    onError: (error) => toastCrudError(error, "Failed to update cost code"),
  });

  const createExpenseMut = useMutation({
    mutationFn: (data) => base44.entities.Expense.create(data),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, expenseQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, expenseQueryKeys);
      setExpenseModalOpen(false);
      setEditingExpense(null);
    },
    onError: (error) => toastCrudError(error, "Failed to create expense"),
  });

  const updateExpenseMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Expense.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, expenseQueryKeys, updated);
      await invalidateCrudQueries(qc, expenseQueryKeys);
      setExpenseModalOpen(false);
      setEditingExpense(null);
    },
    onError: (error) => toastCrudError(error, "Failed to update expense"),
  });

  const createSovMut = useMutation({
    mutationFn: async (data) => {
      let sovId;
      try {
        sovId = projectId ? await getNextNumber(projectId, "SOV") : null;
      } catch {
        sovId = null;
      }
      return base44.entities.SOVItem.create({
        ...data,
        sov_id: data.sov_id || sovId || `SOV-${String(sovItems.length + 1).padStart(3, "0")}`,
      });
    },
    onSuccess: async (created) => {
      appendRecordToCaches(qc, sovQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateCrudQueries(qc, sovQueryKeys);
      setSovModalOpen(false);
      setEditingSov(null);
    },
    onError: (error) => toastCrudError(error, "Failed to create SOV item"),
  });

  const updateSovMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SOVItem.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, sovQueryKeys, updated);
      await invalidateCrudQueries(qc, sovQueryKeys);
      setSovModalOpen(false);
      setEditingSov(null);
    },
    onError: (error) => toastCrudError(error, "Failed to update SOV item"),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, mode }) => {
      if (mode === "cost-code") return base44.entities.CostCode.delete(id);
      if (mode === "expense") return base44.entities.Expense.delete(id);
      return base44.entities.SOVItem.delete(id);
    },
    onSuccess: async (_, payload) => {
      if (payload.mode === "cost-code") {
        removeRecordFromCaches(qc, costCodeQueryKeys, payload.id);
        await invalidateCrudQueries(qc, costCodeQueryKeys);
      } else if (payload.mode === "expense") {
        removeRecordFromCaches(qc, expenseQueryKeys, payload.id);
        await invalidateCrudQueries(qc, expenseQueryKeys);
      } else {
        removeRecordFromCaches(qc, sovQueryKeys, payload.id);
        await invalidateCrudQueries(qc, sovQueryKeys);
      }
      setDeleteTarget(null);
      setDeleteMode(null);
    },
    onError: (error) => toastCrudError(error, "Failed to delete record"),
  });

  const selectedProject = projectId ? projects.find((project) => project.id === projectId) : null;
  const approvedChangeOrders = useMemo(() => changeOrders.filter((changeOrder) => changeOrder.status === "Approved"), [changeOrders]);
  const activeExpenses = useMemo(() => expenses.filter((expense) => expense.payment_status !== "Voided"), [expenses]);
  const loadingFinancials = projectsLoading || costCodesLoading || changeOrdersLoading || expensesLoading || sovItemsLoading || workPackagesLoading;
  const financialsError =
    projectsErrorDetails ||
    costCodesErrorDetails ||
    changeOrdersErrorDetails ||
    expensesErrorDetails ||
    sovItemsErrorDetails ||
    workPackagesErrorDetails ||
    null;
  const hasFinancialsError = projectsError || costCodesError || changeOrdersError || expensesError || sovItemsError || workPackagesError;

  const costCodeRows = useMemo(() => {
    const byCostCodeId = approvedChangeOrders.reduce((acc, changeOrder) => {
      const key = changeOrder.cost_code_id || "__unmapped__";
      if (!acc[key]) acc[key] = 0;
      acc[key] += safeNumber(changeOrder.co_amount);
      return acc;
    }, {});

    return costCodes.map((costCode) => {
      const relatedExpenses = activeExpenses.filter((expense) => expense.cost_code === costCode.cost_code_number || expense.cost_code_id === costCode.id);
      const expenseActual = relatedExpenses
        .filter((expense) => expense.payment_status === "Paid")
        .reduce((sum, expense) => sum + safeNumber(expense.amount), 0);
      const expenseCommitted = relatedExpenses
        .filter((expense) => expense.payment_status !== "Paid")
        .reduce((sum, expense) => sum + safeNumber(expense.amount), 0);
      const manualActual = safeNumber(costCode.actual_cost);
      const manualCommitted = safeNumber(costCode.committed_cost);
      const manualForecast = safeNumber(costCode.forecast_to_complete);
      const actual = Math.max(manualActual, expenseActual);
      const committed = Math.max(manualCommitted, expenseCommitted);
      const signedExtras = safeNumber(byCostCodeId[costCode.id]);
      const revisedBudget = safeNumber(costCode.budget_amount);
      const originalEstimate = revisedBudget - signedExtras;
      const exposure = actual + committed;
      const forecastTotal = Math.max(manualForecast, exposure);
      const remainingBudget = revisedBudget - forecastTotal;
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
        forecast_total: forecastTotal,
        remaining_budget: remainingBudget,
        used_pct: usedPct,
        family_label: family.label,
        direct_billable: family.direct,
      };
    });
  }, [activeExpenses, approvedChangeOrders, costCodes]);

  const families = useMemo(() => [...new Set(costCodeRows.map((row) => row.phase).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))), [costCodeRows]);
  const costCodeMap = useMemo(() => new Map(costCodeRows.map((row) => [row.cost_code_number, row])), [costCodeRows]);
  const workPackageMap = useMemo(() => new Map(workPackages.map((row) => [row.id, row])), [workPackages]);
  const sovMap = useMemo(() => new Map(sovItems.map((row) => [row.id, row])), [sovItems]);

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
      const contractValue = safeNumber(selectedProject?.revised_contract_value || selectedProject?.original_contract_value);
      const percentOfContract = contractValue > 0 ? (scheduledValue / contractValue) * 100 : 0;
      const linkedExpenses = activeExpenses.filter((expense) => expense.sov_line_item_id === item.id);
      const expenseActual = linkedExpenses.reduce((sum, expense) => sum + safeNumber(expense.amount), 0);

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
        linked_expense_count: linkedExpenses.length,
      };
    });
  }, [activeExpenses, costCodeRows, selectedProject, sovItems]);

  const filteredSovRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupedSovRows.filter((row) => !q || [row.line_item_number, row.description, row.family_label].some((value) => String(value || "").toLowerCase().includes(q)));
  }, [groupedSovRows, search]);

  const expenseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeExpenses
      .map((expense) => {
        const linkedCostCode = costCodeMap.get(expense.cost_code);
        const linkedSov = expense.sov_line_item_id ? sovMap.get(expense.sov_line_item_id) : null;
        const linkedWorkPackage = expense.work_package_id ? workPackageMap.get(expense.work_package_id) : null;
        const family = getFamilyMeta(`${linkedCostCode?.phase || ""} ${linkedCostCode?.description || ""} ${expense.description || ""}`);
        return {
          ...expense,
          linked_cost_code: linkedCostCode,
          linked_sov: linkedSov,
          linked_work_package: linkedWorkPackage,
          family_label: family.label,
        };
      })
      .filter((expense) => {
        const phaseMatch = filterPhase === "all" || expense.linked_cost_code?.phase === filterPhase;
        if (!phaseMatch) return false;
        if (!q) return true;
        return [
          expense.expense_number,
          expense.description,
          expense.vendor,
          expense.cost_code,
          expense.sov_line_item_name,
          expense.linked_sov?.description,
          expense.linked_work_package?.name,
        ].some((value) => String(value || "").toLowerCase().includes(q));
      });
  }, [activeExpenses, costCodeMap, filterPhase, search, sovMap, workPackageMap]);

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
    const forecastTotal = costCodeRows.reduce((sum, row) => sum + safeNumber(row.forecast_total), 0);
    const remainingBudget = revisedBudget - forecastTotal;
    const approvedExtras = approvedChangeOrders.reduce((sum, changeOrder) => sum + safeNumber(changeOrder.co_amount), 0);
    const budgetSpentPct = revisedBudget > 0 ? (forecastTotal / revisedBudget) * 100 : 0;
    const sovVsContract = contractValue > 0 ? sovTotal - contractValue : 0;
    const marginAtRisk = contractValue - forecastTotal;
    const openExpenses = activeExpenses.filter((item) => item.payment_status !== "Paid").length;
    const unmappedCount = unmappedExpenses.length;
    const linkedExpenses = activeExpenses.filter((item) => item.sov_line_item_id).length;
    const directCosts = costCodeRows.filter((item) => item.direct_billable).reduce((sum, item) => sum + safeNumber(item.exposure), 0);

    return {
      contractValue,
      sovTotal,
      sovVsContract,
      revisedBudget,
      actual,
      committed,
      exposure,
      forecastTotal,
      remainingBudget,
      approvedExtras,
      budgetSpentPct,
      marginAtRisk,
      openExpenses,
      unmappedCount,
      linkedExpenses,
      directCosts,
    };
  }, [activeExpenses, approvedChangeOrders, costCodeRows, selectedProject, sovItems, unmappedExpenses.length]);

  const reviewFlags = useMemo(() => {
    const flags = [];
    if (Math.abs(summary.sovVsContract) > 1) {
      flags.push({
        title: "SOV mismatch",
        body: `Schedule of values totals ${formatSigned(summary.sovVsContract)} against the project contract. Review billing alignment before pay app cut-off.`,
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
        body: `${unmappedExpenses.length} expense ${unmappedExpenses.length === 1 ? "record needs" : "records need"} review before cost and billing are reconciled.`,
        tone: "warning",
      });
    }
    const zeroCommitted = costCodeRows.filter((row) => row.committed_cost === 0 && row.actual_cost === 0 && row.revised_budget > 0);
    if (zeroCommitted.length > 0) {
      flags.push({
        title: "Committed cost gap",
        body: `${zeroCommitted.length} cost buckets have revised budget but no actual or committed cost. Review buyout coverage and missing invoices.`,
        tone: "warning",
      });
    }
    const unlinkedSov = groupedSovRows.filter((row) => row.linked_expense_count === 0 && row.allocated_actual > 0);
    if (unlinkedSov.length > 0) {
      flags.push({
        title: "SOV not tied to actuals",
        body: `${unlinkedSov.length} SOV lines show allocated cost but no direct expense linkage. Add expense mappings before billing review.`,
        tone: "warning",
      });
    }
    return flags;
  }, [costCodeRows, groupedSovRows, summary, unmappedExpenses.length]);

  const nextSovId = useMemo(() => `SOV-${String((sovItems.length || 0) + 1).padStart(3, "0")}`, [sovItems.length]);
  const nextLineItemNumber = useMemo(() => sovItems.reduce((max, item) => Math.max(max, Number(item.line_item_number) || 0), 0) + 1, [sovItems]);

  const handleSaveCostCode = async (data) => {
    if (editingCostCode) {
      return updateMut.mutateAsync({ id: editingCostCode.id, data });
    }
    return createMut.mutateAsync(data);
  };

  const handleSaveExpense = async (data) => {
    const linkedSov = data.sov_line_item_id ? sovMap.get(data.sov_line_item_id) : null;
    const linkedWorkPackage = data.work_package_id ? workPackageMap.get(data.work_package_id) : null;
    const payload = {
      ...data,
      project_id: data.project_id || projectId,
      project_name: selectedProject?.name || data.project_name || "",
      sov_line_item_name: linkedSov?.description || data.sov_line_item_name || "",
      work_package_name: linkedWorkPackage ? `${linkedWorkPackage.wp_number} - ${linkedWorkPackage.name}` : data.work_package_name || "",
    };

    if (editingExpense) {
      return updateExpenseMut.mutateAsync({ id: editingExpense.id, data: payload });
    }
    return createExpenseMut.mutateAsync(payload);
  };

  const handleSaveSov = async (data) => {
    const payload = {
      ...data,
      project_id: data.project_id || projectId,
      project_name: selectedProject?.name || data.project_name || "",
    };
    if (editingSov) {
      return updateSovMut.mutateAsync({ id: editingSov.id, data: payload });
    }
    return createSovMut.mutateAsync(payload);
  };

  const openExpenseModal = (expense = null) => {
    setEditingExpense(expense);
    setExpenseModalOpen(true);
  };

  const openSovModal = (sov = null) => {
    setEditingSov(sov);
    setSovModalOpen(true);
  };

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>$</div>
        <div style={{ ...body, fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>
          Select a project to view cost control
        </div>
        <div style={{ ...body, fontSize: 12, color: "var(--text-muted)" }}>
          Use the project selector in the top right.
        </div>
      </div>
    );
  }

  if (loadingFinancials) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ ...mono, fontSize: 12, color: "var(--accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Loading Cost Control
        </div>
        <div style={{ ...body, fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          Pulling budgets, expenses, SOV lines, change orders, and work package ties.
        </div>
      </div>
    );
  }

  if (hasFinancialsError) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ ...mono, fontSize: 12, color: "var(--status-error)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Cost Control Failed To Load
        </div>
        <div style={{ ...body, fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          {financialsError?.message || "One or more financial datasets could not be loaded."}
        </div>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ ...mono, fontSize: 12, color: "var(--status-warning)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Project Data Missing
        </div>
        <div style={{ ...body, fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          The selected project record could not be resolved for Cost Control.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader
        title="Budget Control"
        subtitle={`${selectedProject?.name || "Project"} • integrated cost, SOV, and expense control`}
        onRefresh={() => {
          invalidateCrudQueries(qc, costCodeQueryKeys);
          invalidateCrudQueries(qc, expenseQueryKeys);
          invalidateCrudQueries(qc, sovQueryKeys);
          qc.invalidateQueries({ queryKey: ["change-orders", projectId] });
          qc.invalidateQueries({ queryKey: ["work-packages", projectId] });
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <SectionTabs active={activeView} onChange={setActiveView} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ToolbarButton label="Add Expense" tone="accent" onClick={() => openExpenseModal()} />
          <ToolbarButton label="Add SOV Item" onClick={() => openSovModal()} />
          <ToolbarButton
            label="Add Cost Code"
            onClick={() => {
              setEditingCostCode(null);
              setCostCodeModalOpen(true);
            }}
          />
          <ToolbarButton label="Open Expenses Page" onClick={() => navigate(`/Expenses?project=${projectId}`)} />
          <ToolbarButton label="Open SOV Page" onClick={() => navigate(`/SOV?project=${projectId}`)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <SummaryCard label="Contract Value" value={formatCurrencyShort(summary.contractValue)} detail={`Project ${selectedProject?.project_number || "—"}`} />
        <SummaryCard label="SOV Total" value={formatCurrencyShort(summary.sovTotal)} detail={`Variance to contract ${formatSigned(summary.sovVsContract)}`} tone={Math.abs(summary.sovVsContract) > 1 ? "var(--status-warning)" : "var(--accent)"} />
        <SummaryCard label="Revised Budget" value={formatCurrencyShort(summary.revisedBudget)} detail={`Approved extras ${formatCurrencyShort(summary.approvedExtras)}`} tone="var(--status-info)" />
        <SummaryCard label="Exposure" value={formatCurrencyShort(summary.exposure)} detail={`Forecast ${formatCurrencyShort(summary.forecastTotal)}`} tone={summary.remainingBudget < 0 ? "var(--status-error)" : "var(--status-warning)"} />
        <SummaryCard label="Open Expenses" value={String(summary.openExpenses)} detail={`${summary.unmappedCount} unmapped • ${summary.linkedExpenses} linked to SOV`} tone="var(--status-warning)" />
        <SummaryCard label="Budget Remaining" value={formatSigned(summary.remainingBudget)} detail={`Direct billable exposure ${formatCurrencyShort(summary.directCosts)}`} tone={summary.remainingBudget < 0 ? "var(--status-error)" : "var(--status-success)"} />
      </div>

      <FilterBar search={search} setSearch={setSearch} filterPhase={filterPhase} setFilterPhase={setFilterPhase} phases={families} />

      {activeView === "summary" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <PhoenixPanel title="Cost Control Summary" count={selectedProject?.project_number || "—"}>
              <PhoenixTable
                columns={[
                  { label: "Project" },
                  { label: "Contract", right: true },
                  { label: "SOV Total", right: true },
                  { label: "Revised Budget", right: true },
                  { label: "Actual", right: true },
                  { label: "Committed", right: true },
                  { label: "Exposure", right: true },
                  { label: "Remaining", right: true },
                  { label: "Budget Used", right: true },
                ]}
              >
                <PTR>
                  <PTD bold>{selectedProject?.name}</PTD>
                  <PTD right mono>{formatCurrency(summary.contractValue)}</PTD>
                  <PTD right mono>{formatCurrency(summary.sovTotal)}</PTD>
                  <PTD right mono>{formatCurrency(summary.revisedBudget)}</PTD>
                  <PTD right mono>{formatCurrency(summary.actual)}</PTD>
                  <PTD right mono>{formatCurrency(summary.committed)}</PTD>
                  <PTD right mono>{formatCurrency(summary.exposure)}</PTD>
                  <PTD right mono style={{ color: varianceColor(summary.remainingBudget) }}>{formatSigned(summary.remainingBudget)}</PTD>
                  <PTD right mono>{formatPercent(summary.budgetSpentPct, 1)}</PTD>
                </PTR>
              </PhoenixTable>
            </PhoenixPanel>

            <PhoenixPanel title="Workflow Reconciliation" count={3}>
              <PhoenixTable
                columns={[
                  { label: "Control Area" },
                  { label: "Live Value", right: true },
                  { label: "Expectation", right: true },
                  { label: "Gap", right: true },
                  { label: "Action" },
                ]}
              >
                <PTR warn={Math.abs(summary.sovVsContract) > 1}>
                  <PTD bold>SOV vs Contract</PTD>
                  <PTD right mono>{formatCurrency(summary.sovTotal)}</PTD>
                  <PTD right mono>{formatCurrency(summary.contractValue)}</PTD>
                  <PTD right mono style={{ color: varianceColor(-summary.sovVsContract) }}>{formatSigned(-summary.sovVsContract)}</PTD>
                  <PTD><button type="button" onClick={() => setActiveView("sov")} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", ...mono, fontSize: 9 }}>Review SOV lines</button></PTD>
                </PTR>
                <PTR warn={summary.unmappedCount > 0}>
                  <PTD bold>Mapped Expenses</PTD>
                  <PTD right mono>{summary.linkedExpenses}</PTD>
                  <PTD right mono>{activeExpenses.length}</PTD>
                  <PTD right mono>{summary.unmappedCount}</PTD>
                  <PTD><button type="button" onClick={() => setActiveView("unmapped")} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", ...mono, fontSize: 9 }}>Resolve gaps</button></PTD>
                </PTR>
                <PTR warn={summary.remainingBudget < 0}>
                  <PTD bold>Forecast vs Budget</PTD>
                  <PTD right mono>{formatCurrency(summary.forecastTotal)}</PTD>
                  <PTD right mono>{formatCurrency(summary.revisedBudget)}</PTD>
                  <PTD right mono style={{ color: varianceColor(summary.remainingBudget) }}>{formatSigned(summary.remainingBudget)}</PTD>
                  <PTD><button type="button" onClick={() => setActiveView("budget")} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", ...mono, fontSize: 9 }}>Review buckets</button></PTD>
                </PTR>
              </PhoenixTable>
            </PhoenixPanel>
          </div>

          <ReviewFlags flags={reviewFlags} />
        </div>
      )}

      {activeView === "budget" && (
        <PhoenixPanel title="Budget Control" count={filteredCostCodeRows.length}>
          <PhoenixTable
            columns={[
              { label: "Cost Bucket" }, { label: "Original Estimate", right: true }, { label: "Signed Extras", right: true },
              { label: "Revised Budget", right: true }, { label: "Actual Cost", right: true }, { label: "Committed Cost", right: true },
              { label: "Exposure", right: true }, { label: "Remaining Budget", right: true }, { label: "Used %", right: true },
              { label: "Suggested SOV Family" }, { label: "Direct Billable?" }, { label: "Actions", right: true },
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
                <PTD right><div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <button type="button" onClick={() => { setEditingCostCode(row); setCostCodeModalOpen(true); }} style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "6px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", cursor: "pointer" }}>Edit</button>
                  <button type="button" onClick={() => { setDeleteTarget(row); setDeleteMode("cost-code"); }} style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: "var(--radius-btn)", padding: "6px 8px", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", cursor: "pointer" }}>Delete</button>
                </div></PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}

      {activeView === "sov" && (
        <PhoenixPanel title="SOV Control" count={filteredSovRows.length}>
          <PhoenixTable
            columns={[
              { label: "Line #" }, { label: "Description" }, { label: "SOV Value", right: true }, { label: "% Contract", right: true },
              { label: "Cost Family" }, { label: "Linked Expenses", right: true }, { label: "Allocated Budget", right: true },
              { label: "Actual Cost", right: true }, { label: "Committed", right: true }, { label: "Remaining", right: true }, { label: "Actions", right: true },
            ]}
            empty="NO SOV ITEMS FOUND"
          >
            {filteredSovRows.map((row) => (
              <PTR key={row.id}>
                <PTD mono accent>{row.line_item_number || "—"}</PTD>
                <PTD style={{ maxWidth: 220, whiteSpace: "normal" }}>
                  <div style={{ ...body, fontSize: 12 }}>{row.description || "—"}</div>
                  <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", marginTop: 4 }}>{row.status || "Draft"}</div>
                </PTD>
                <PTD right mono>{formatCurrency(row.scheduled_value)}</PTD>
                <PTD right mono>{formatPercent(row.percent_of_contract, 1)}</PTD>
                <PTD>{row.family_label}</PTD>
                <PTD right mono>{row.linked_expense_count}</PTD>
                <PTD right mono>{formatCurrency(row.allocated_budget)}</PTD>
                <PTD right mono>{formatCurrency(row.allocated_actual)}</PTD>
                <PTD right mono>{formatCurrency(row.allocated_committed)}</PTD>
                <PTD right mono style={{ color: varianceColor(row.allocated_remaining) }}>{formatSigned(row.allocated_remaining)}</PTD>
                <PTD right><div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <button type="button" onClick={() => openExpenseModal({ project_id: projectId, sov_line_item_id: row.id, sov_line_item_name: row.description })} style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-btn)", padding: "6px 8px", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", cursor: "pointer" }}>Add Expense</button>
                  <button type="button" onClick={() => openSovModal(row)} style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "6px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", cursor: "pointer" }}>Edit</button>
                  <button type="button" onClick={() => { setDeleteTarget(row); setDeleteMode("sov"); }} style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: "var(--radius-btn)", padding: "6px 8px", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", cursor: "pointer" }}>Delete</button>
                </div></PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}

      {activeView === "expenses" && (
        <PhoenixPanel title="Expense Ledger" count={expenseRows.length}>
          <PhoenixTable
            columns={[
              { label: "Expense #" }, { label: "Date" }, { label: "Vendor" }, { label: "Description" }, { label: "Cost Code" },
              { label: "SOV Link" }, { label: "Work Package" }, { label: "Amount", right: true }, { label: "Status" }, { label: "Actions", right: true },
            ]}
            empty="NO EXPENSES FOUND"
          >
            {expenseRows.map((row) => (
              <PTR key={row.id} warn={!row.linked_cost_code}>
                <PTD mono accent>{row.expense_number || "—"}</PTD>
                <PTD mono>{row.expense_date || "—"}</PTD>
                <PTD>{row.vendor || "—"}</PTD>
                <PTD style={{ maxWidth: 220, whiteSpace: "normal" }}>{row.description || "—"}</PTD>
                <PTD mono>{row.cost_code || "—"}</PTD>
                <PTD style={{ maxWidth: 180, whiteSpace: "normal" }}>{row.linked_sov?.description || row.sov_line_item_name || "Unlinked"}</PTD>
                <PTD style={{ maxWidth: 160, whiteSpace: "normal" }}>{row.linked_work_package?.name || row.work_package_name || "—"}</PTD>
                <PTD right mono>{formatCurrency(row.amount)}</PTD>
                <PTD mono>{row.payment_status || "—"}</PTD>
                <PTD right><div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <button type="button" onClick={() => openExpenseModal(row)} style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-btn)", padding: "6px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", cursor: "pointer" }}>Edit</button>
                  <button type="button" onClick={() => { setDeleteTarget(row); setDeleteMode("expense"); }} style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: "var(--radius-btn)", padding: "6px 8px", color: "var(--status-error)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", cursor: "pointer" }}>Delete</button>
                </div></PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}

      {activeView === "unmapped" && (
        <PhoenixPanel title="Unmapped Costs" count={unmappedExpenses.length}>
          <PhoenixTable
            columns={[
              { label: "Expense #" }, { label: "Vendor" }, { label: "Description" }, { label: "Amount", right: true }, { label: "Status" },
              { label: "Cost Code" }, { label: "Reason" }, { label: "Invoice Date" }, { label: "Action" },
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
                <PTD><button type="button" onClick={() => openExpenseModal(expense)} style={{ background: "var(--accent-muted)", border: "1px solid var(--accent-border)", borderRadius: "var(--radius-btn)", padding: "6px 8px", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", cursor: "pointer" }}>Fix Mapping</button></PTD>
              </PTR>
            ))}
          </PhoenixTable>
        </PhoenixPanel>
      )}

      <CostCodeFormModal
        open={costCodeModalOpen}
        onClose={() => { setCostCodeModalOpen(false); setEditingCostCode(null); }}
        onSave={(data) => handleSaveCostCode({ ...data, project_id: data.project_id || projectId })}
        costCode={editingCostCode}
        projects={projects}
        existingCodes={costCodes}
      />

      <ExpenseFormModal
        open={expenseModalOpen}
        onClose={() => { setExpenseModalOpen(false); setEditingExpense(null); }}
        onSave={handleSaveExpense}
        isSaving={createExpenseMut.isPending || updateExpenseMut.isPending}
        expense={editingExpense}
        projects={projects}
        workPackages={workPackages}
        sovItems={sovItems}
        expenses={expenses}
        costCodes={costCodes}
        nextNumber={`EXP-${String((expenses.length || 0) + 1).padStart(3, "0")}`}
        defaultProjectId={projectId}
      />

      <SOVFormModal
        open={sovModalOpen}
        onClose={() => { setSovModalOpen(false); setEditingSov(null); }}
        onSave={handleSaveSov}
        sov={editingSov}
        projects={projects}
        nextId={nextSovId}
        nextLineItemNumber={nextLineItemNumber}
        activeProject={selectedProject}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteMode(null); }}
        onConfirm={() => deleteTarget && deleteMode && deleteMut.mutateAsync({ id: deleteTarget.id, mode: deleteMode })}
        title={`Delete ${deleteMode === "expense" ? "Expense" : deleteMode === "sov" ? "SOV Item" : "Cost Code"}`}
        description={deleteMode === "expense" ? `Delete ${deleteTarget?.expense_number || "expense"}?` : deleteMode === "sov" ? `Delete ${deleteTarget?.sov_id || "SOV item"}?` : `Delete ${deleteTarget?.cost_code_number || "cost code"}?`}
      />
    </div>
  );
}
