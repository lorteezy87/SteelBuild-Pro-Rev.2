/**
 * Expenses — project expense tracker with cost-code rollup, budget
 * analytics, and batch operations.
 *
 * After the carve-up this shell owns:
 *   1. React-Query fetches (expenses, projects, sov-items, work-
 *      packages, cost-codes).
 *   2. Mutations: create / update / delete / bulk-update / bulk-delete.
 *   3. Derived data: KPI rollups, spend-by-cost-code, budget-vs-
 *      actual, payment-status breakdown, top vendors, red-flag alerts.
 *   4. Composition of feature-folder components in `./expenses/`.
 *
 * Every visual block lives under `src/pages/expenses/`:
 *   constants / charts / utils / KpiStrip / AnalyticsGrid /
 *   AlertChips / FilterBar / ExpenseTable / BulkActionBar.
 */

import React, { useState, useEffect, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import DeleteDialog from "../components/shared/DeleteDialog";
import ExpenseFormModal from "../components/expenses/ExpenseFormModal";
import ExpenseImportModal from "../components/expenses/ExpenseImportModal";
import { formatCurrencyShort, roundCurrency } from "../components/shared/formatters";
import { COST_CODES } from "../components/shared/costCodes";
import { toast } from "sonner";
import { getNextNumber } from "../components/shared/numberSequencing";
// Invalidate the FULL expense family (project list + ["expenses-all"] used by
// Dashboard/Reports + cost rollups), not just the unscoped ["expenses"] prefix.
import { invalidateEntity } from "@/services/cacheRegistry";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";

import { buildRedFlagAlerts, exportExpensesCSV } from "./expenses/utils";
import {
  filterActiveExpenses,
  computeExpenseKpis,
  remainingTone,
  filterExpenses,
  pruneSelectedIds,
  computeSpendByCostCode,
  computeCostCodeBudgetVsActual,
  computeStatusBreakdown,
  computeTopVendors,
  nextKpiFilterState,
  toggleSelectedId,
  toggleSelectAllIds,
  filterVisibleAlerts,
  nextDismissedAlertKeys,
} from "./expenses/expensesPageHelpers";
import { computeCostCodeTotals } from "@/services/costRollup";
import KpiStrip      from "./expenses/KpiStrip";
import AnalyticsGrid from "./expenses/AnalyticsGrid";
import AlertChips    from "./expenses/AlertChips";
import FilterBar     from "./expenses/FilterBar";
import ExpenseTable  from "./expenses/ExpenseTable";
import BulkActionBar from "./expenses/BulkActionBar";
import ExpensesControlCenter from "./expenses/ExpensesControlCenter";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";

export default function ExpensesPage() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [costCodeFilter, setCostCodeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState("all");
  const [wpFilter, setWpFilter] = useState("all");
  const [selected, setSelected] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeKPI, setActiveKPI] = useState(null);
  const [dismissedAlerts, setDismissedAlerts] = useState([]);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  /* ── Queries ── */
  const {
    data: expenses = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["expenses", activeProject?.id],
    queryFn: async () => {
      if (!activeProject?.id) return [];
      const projectExpenses = await entities.Expense.filter({ project_id: activeProject.id });
      return projectExpenses.sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
    },
    enabled: !!activeProject?.id,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
  });

  const { data: sovItems = [] } = useQuery({
    queryKey: ["sov-items", activeProject?.id],
    queryFn: () => (activeProject?.id ? entities.SOVItem.filter({ project_id: activeProject.id }) : []),
    enabled: !!activeProject?.id,
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", activeProject?.id],
    queryFn: () => (activeProject?.id ? entities.WorkPackage.filter({ project_id: activeProject.id }) : []),
    enabled: !!activeProject?.id,
  });

  const { data: costCodes = [] } = useQuery({
    queryKey: ["cost-codes", activeProject?.id],
    queryFn: () =>
      activeProject?.id
        ? entities.CostCode.filter({ project_id: activeProject.id }, "cost_code_number")
        : [],
    select: (rows) => [...rows].sort((a, b) => (a.cost_code_number || "").localeCompare(b.cost_code_number || "", undefined, { numeric: true })),
    enabled: !!activeProject?.id,
  });

  /* ── Mutations ── */
  const createMut = useMutation({
    mutationFn: async (d) => {
      const scoped = withProjectId(d, activeProject?.id);
      let expenseNumber;
      try {
        expenseNumber = await getNextNumber(scoped.project_id, "EXPENSE");
      } catch {
        throw new Error("Unable to reserve an expense number. Please retry.");
      }
      if (!expenseNumber) throw new Error("Unable to reserve an expense number. Please retry.");
      return entities.Expense.create({ ...scoped, expense_number: expenseNumber });
    },
    onSuccess: () => {
      invalidateEntity(qc, "expense", activeProject?.id);
      setModalOpen(false);
      setEditing(null);
      toast.success("Expense created");
    },
    onError: (err) => toast.error(`Failed to create expense: ${toUserErrorMessage(err, "Unknown error")}`),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.Expense.update(id, data),
    onSuccess: () => {
      invalidateEntity(qc, "expense", activeProject?.id);
      setModalOpen(false);
      setEditing(null);
      toast.success("Expense updated");
    },
    onError: (err) => toast.error(`Failed to update expense: ${toUserErrorMessage(err, "Unknown error")}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.Expense.delete(id),
    onSuccess: (_, deletedId) => {
      invalidateEntity(qc, "expense", activeProject?.id);
      if (editing?.id === deletedId) {
        setEditing(null);
        setModalOpen(false);
      }
      if (deleteTarget?.id === deletedId) setDeleteTarget(null);
      toast.success("Expense deleted");
    },
    onError: (err) => toast.error(toUserErrorMessage(err, "Failed to delete expense")),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      let succeeded = 0, failed = 0;
      for (const id of ids) {
        try { await entities.Expense.update(id, data); succeeded++; } catch { failed++; }
      }
      if (failed > 0) throw new Error(`${failed} of ${ids.length} updates failed`);
      return { succeeded };
    },
    onSuccess: (result) => {
      invalidateEntity(qc, "expense", activeProject?.id);
      setSelected([]);
      toast.success(`${result.succeeded} expense(s) updated`);
    },
    onError: (err) => {
      invalidateEntity(qc, "expense", activeProject?.id);
      setSelected([]);
      toast.error(toUserErrorMessage(err, "Bulk update failed"));
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids) => {
      let succeeded = 0, failed = 0;
      for (const id of ids) {
        try { await entities.Expense.delete(id); succeeded++; } catch { failed++; }
      }
      if (failed > 0) throw new Error(`${failed} of ${ids.length} deletes failed`);
      return { succeeded };
    },
    onSuccess: (result) => {
      invalidateEntity(qc, "expense", activeProject?.id);
      setSelected([]);
      toast.success(`${result.succeeded} expense(s) deleted`);
    },
    onError: (err) => {
      invalidateEntity(qc, "expense", activeProject?.id);
      setSelected([]);
      toast.error(toUserErrorMessage(err, "Bulk delete failed"));
    },
  });

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  /* ── KPI rollups ── */
  const totalBudget     = roundCurrency(computeCostCodeTotals(costCodes).budget);
  const activeExpenses  = useMemo(() => filterActiveExpenses(expenses), [expenses]);
  const kpis = useMemo(
    () => computeExpenseKpis(activeExpenses, totalBudget),
    [activeExpenses, totalBudget],
  );
  const totalCommitted = roundCurrency(kpis.totalCommitted);
  const totalPaid = roundCurrency(kpis.totalPaid);
  const paidCount = kpis.paidCount;
  const totalRemaining = roundCurrency(kpis.totalRemaining);
  const pctUsed = kpis.pctUsed;
  const totalOutstanding = roundCurrency(kpis.totalOutstanding);

  const remainingColor = remainingTone(totalRemaining, pctUsed);
  const remainingBorderColor = remainingColor;

  /* ── KPI click routing (with a special sentinel for Outstanding) ── */
  const handleKPIClick = (kpiKey) => {
    const next = nextKpiFilterState(activeKPI, kpiKey);
    setActiveKPI(next.activeKPI);
    setStatusFilter(next.statusFilter);
  };

  /* ── Filtered list ── */
  const now = useMemo(() => new Date(), []);
  const filtered = useMemo(
    () => filterExpenses(expenses, {
      debouncedSearch,
      costCodeFilter,
      typeFilter,
      statusFilter,
      wpFilter,
      dateRangeFilter,
      now,
    }),
    [expenses, debouncedSearch, costCodeFilter, typeFilter, statusFilter, wpFilter, dateRangeFilter, now],
  );

  useEffect(() => {
    const visibleIds = new Set(filtered.map((expense) => expense.id));
    setSelected((current) => pruneSelectedIds(current, visibleIds));
  }, [filtered]);

  /* ── Spend by cost code (for donut) ── */
  const spendByCostCode = useMemo(
    () => computeSpendByCostCode(activeExpenses, COST_CODES),
    [activeExpenses],
  );

  /* ── Cost-code budget vs actual ── */
  const costCodeBudgetVsActual = useMemo(
    () => computeCostCodeBudgetVsActual(activeExpenses, costCodes, COST_CODES),
    [activeExpenses, costCodes],
  );

  /* ── Payment status breakdown ── */
  const statusBreakdown = useMemo(
    () => computeStatusBreakdown(expenses),
    [expenses],
  );

  /* ── Top vendors ── */
  const topVendors = useMemo(
    () => computeTopVendors(activeExpenses),
    [activeExpenses],
  );

  /* ── Red-flag alerts ── */
  const redFlagAlerts = useMemo(
    () => buildRedFlagAlerts({ totalCommitted, totalBudget, topVendors, activeExpenses, formatCurrencyShort }),
    [totalCommitted, totalBudget, topVendors, activeExpenses]
  );
  const visibleAlerts = filterVisibleAlerts(redFlagAlerts, dismissedAlerts);

  /* ── Selection + CSV handlers ── */
  const toggleSelect = (id) => setSelected((s) => toggleSelectedId(s, id));
  const toggleAll = () => setSelected(toggleSelectAllIds(selected, filtered.map((e) => e.id)));
  const handleExportCSV = () => exportExpensesCSV(filtered, activeProject?.name);

  /* ── Shared modals rendered inside the canonical control center ── */
  const modals = (
    <>
      <ExpenseFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        isSaving={createMut.isPending || updateMut.isPending}
        expense={editing}
        projects={projects}
        workPackages={workPackages}
        sovItems={sovItems}
        expenses={expenses}
        costCodes={costCodes}
        nextNumber=""
        defaultProjectId={activeProject?.id}
      />
      <ExpenseImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        activeProject={activeProject}
        workPackages={workPackages}
        onImported={() => invalidateEntity(qc, "expense", activeProject?.id)}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteMut.isPending && deleteTarget?.id) {
            deleteMut.mutate(deleteTarget.id);
          }
        }}
        title="Delete Expense"
        description={`Delete ${deleteTarget?.expense_number}? This cannot be undone.`}
      />
    </>
  );

  /* ── No active project: early return ── */
  if (!activeProject?.id) {
    return (
      <div className="sb-dashboard-reference-page" style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📌</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 20, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 6 }}>
          Select a project to view Expenses
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>
          Use the project selector in the top right.
        </div>
      </div>
    );
  }

  return (
    <div className="exp-page">
      <ListTruncationNotice count={expenses.length} label="expenses" />
      <ExpensesControlCenter
        projectName={activeProject?.name || "Project"}
        expenses={expenses}
        filtered={filtered}
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={(v) => { setStatusFilter(v); setActiveKPI(null); }}
        onRefresh={refetch}
        onExport={handleExportCSV}
        onImport={() => setImportOpen(true)}
        onCreate={() => { setEditing(null); setModalOpen(true); }}
        onOpenExpense={(e) => { setEditing(e); setModalOpen(true); }}
      >
        <KpiStrip
          activeKPI={activeKPI}
          onClick={handleKPIClick}
          totalBudget={totalBudget}
          totalCommitted={totalCommitted}
          totalPaid={totalPaid}
          paidCount={paidCount}
          totalRemaining={totalRemaining}
          totalOutstanding={totalOutstanding}
          pctUsed={pctUsed}
          remainingColor={remainingColor}
          remainingBorderColor={remainingBorderColor}
          expenses={expenses}
        />

        <AnalyticsGrid
          spendByCostCode={spendByCostCode}
          costCodeBudgetVsActual={costCodeBudgetVsActual}
          statusBreakdown={statusBreakdown}
          topVendors={topVendors}
          expenses={expenses}
          totalCommitted={totalCommitted}
        />

        <AlertChips
          alerts={visibleAlerts}
          onDismiss={(key) => setDismissedAlerts((prev) => nextDismissedAlertKeys(prev, key))}
        />

        <FilterBar
          search={search} onSearchChange={setSearch}
          costCodeFilter={costCodeFilter} onCostCodeFilter={setCostCodeFilter}
          typeFilter={typeFilter} onTypeFilter={setTypeFilter}
          statusFilter={statusFilter}
          onStatusFilter={(v) => { setStatusFilter(v); setActiveKPI(null); }}
          wpFilter={wpFilter} onWPFilter={setWpFilter} workPackages={workPackages}
          dateRangeFilter={dateRangeFilter} onDateRangeFilter={setDateRangeFilter}
          activeKPI={activeKPI}
          onClearKPI={() => { setActiveKPI(null); setStatusFilter("all"); }}
          onImport={() => setImportOpen(true)}
          onExport={handleExportCSV}
        />

        <ExpenseTable
          filtered={filtered}
          isLoading={isLoading}
          isError={isError}
          errorMessage={toUserErrorMessage(error, "Something went wrong. Try again.")}
          onRetry={() => refetch()}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onEdit={(e) => { setEditing(e); setModalOpen(true); }}
          onDelete={setDeleteTarget}
          onOpen={(e) => { setEditing(e); setModalOpen(true); }}
        />

        <BulkActionBar
          count={selected.length}
          isPending={bulkUpdateMut.isPending || bulkDeleteMut.isPending}
          onMarkPaid={() => {
            if (!bulkUpdateMut.isPending && !bulkDeleteMut.isPending) {
              bulkUpdateMut.mutate({ ids: selected, data: { payment_status: "Paid" } });
            }
          }}
          onMarkVoided={() => {
            if (!bulkUpdateMut.isPending && !bulkDeleteMut.isPending) {
              bulkUpdateMut.mutate({ ids: selected, data: { payment_status: "Voided" } });
            }
          }}
          onDelete={() => {
            if (!bulkDeleteMut.isPending && !bulkUpdateMut.isPending) {
              bulkDeleteMut.mutate(selected);
            }
          }}
          onClear={() => setSelected([])}
        />
      </ExpensesControlCenter>
      {modals}
    </div>
  );
}
