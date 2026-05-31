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

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/ProjectContext";
import { CommandBar } from "@/components/design-system";
import DeleteDialog from "../components/shared/DeleteDialog";
import { Plus, RefreshCw } from "lucide-react";
import ExpenseFormModal from "../components/expenses/ExpenseFormModal";
import ExpenseImportModal from "../components/expenses/ExpenseImportModal";
import { formatCurrencyShort, roundCurrency } from "../components/shared/formatters";
import { COST_CODES } from "../components/shared/costCodes";
import { toast } from "sonner";
import { getNextNumber } from "../components/shared/numberSequencing";

import { safeNum, buildRedFlagAlerts, exportExpensesCSV } from "./expenses/utils";
import KpiStrip      from "./expenses/KpiStrip";
import AnalyticsGrid from "./expenses/AnalyticsGrid";
import AlertChips    from "./expenses/AlertChips";
import FilterBar     from "./expenses/FilterBar";
import ExpenseTable  from "./expenses/ExpenseTable";
import BulkActionBar from "./expenses/BulkActionBar";

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
  const { data: expenses = [], isLoading, refetch } = useQuery({
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
      let expenseNumber;
      try {
        expenseNumber = activeProject?.id ? await getNextNumber(activeProject.id, "EXPENSE") : null;
      } catch {
        expenseNumber = null;
      }
      if (!expenseNumber) expenseNumber = `EXP-${String((expenses.length || 0) + 1).padStart(3, "0")}`;
      return entities.Expense.create({ ...d, expense_number: expenseNumber, project_id: d.project_id || activeProject?.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Expense created");
    },
    onError: (err) => toast.error("Failed to create expense: " + (err?.message || "Unknown error")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.Expense.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setModalOpen(false);
      setEditing(null);
      toast.success("Expense updated");
    },
    onError: (err) => toast.error("Failed to update expense: " + (err?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.Expense.delete(id),
    onSuccess: (_, deletedId) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      if (editing?.id === deletedId) {
        setEditing(null);
        setModalOpen(false);
      }
      if (deleteTarget?.id === deletedId) setDeleteTarget(null);
      toast.success("Expense deleted");
    },
    onError: () => toast.error("Failed to delete expense"),
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
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setSelected([]);
      toast.success(`${result.succeeded} expense(s) updated`);
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setSelected([]);
      toast.error(err.message);
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
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setSelected([]);
      toast.success(`${result.succeeded} expense(s) deleted`);
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setSelected([]);
      toast.error(err.message);
    },
  });

  const handleSave = (d) => {
    if (editing) updateMut.mutate({ id: editing.id, data: d });
    else createMut.mutate(d);
  };

  /* ── KPI rollups ── */
  const totalBudget     = roundCurrency(costCodes.reduce((s, c) => s + safeNum(c.budget_amount), 0));
  const activeExpenses  = useMemo(() => expenses.filter((e) => e.payment_status !== "Voided"), [expenses]);
  const totalCommitted  = roundCurrency(activeExpenses.reduce((s, e) => s + safeNum(e.amount), 0));
  const totalPaid       = roundCurrency(activeExpenses.filter((e) => e.payment_status === "Paid").reduce((s, e) => s + safeNum(e.amount), 0));
  const paidCount       = activeExpenses.filter((e) => e.payment_status === "Paid").length;
  const totalRemaining  = roundCurrency(totalBudget - totalCommitted);
  const pctUsed         = totalBudget > 0 ? Math.min(100, Math.round((totalCommitted / totalBudget) * 100)) : 0;
  const totalOutstanding = roundCurrency(
    activeExpenses
      .filter((e) => e.payment_status === "Unpaid" || e.payment_status === "Pending Approval")
      .reduce((s, e) => s + safeNum(e.amount), 0)
  );

  const remainingColor =
    totalRemaining < 0 ? "var(--status-error)" :
    100 - pctUsed < 10 ? "var(--status-warning)" :
                         "var(--status-success)";
  const remainingBorderColor = remainingColor;

  /* ── KPI click routing (with a special sentinel for Outstanding) ── */
  const handleKPIClick = (kpiKey) => {
    if (activeKPI === kpiKey) {
      setActiveKPI(null);
      setStatusFilter("all");
      return;
    }
    setActiveKPI(kpiKey);
    if (kpiKey === "paid") setStatusFilter("Paid");
    else if (kpiKey === "outstanding") setStatusFilter("_outstanding");
    else setStatusFilter("all");
  };

  /* ── Date-range filter helper ── */
  const now = useMemo(() => new Date(), []);
  const filterByDate = useCallback((e) => {
    if (dateRangeFilter === "all") return true;
    const d = new Date(e.expense_date);
    if (dateRangeFilter === "this_month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (dateRangeFilter === "last_30") return now - d <= 30 * 86400000;
    if (dateRangeFilter === "this_quarter") {
      const q = Math.floor(now.getMonth() / 3);
      return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === now.getFullYear();
    }
    return true;
  }, [dateRangeFilter, now]);

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch =
        !q ||
        e.description?.toLowerCase().includes(q) ||
        e.expense_number?.toLowerCase().includes(q) ||
        e.vendor?.toLowerCase().includes(q);
      const matchCC = costCodeFilter === "all" || e.cost_code === costCodeFilter;
      const matchType = typeFilter === "all" || e.expense_type === typeFilter;
      const matchStatus =
        statusFilter === "all" ? true :
        statusFilter === "_outstanding"
          ? e.payment_status === "Unpaid" || e.payment_status === "Pending Approval"
          : e.payment_status === statusFilter;
      const matchWP = wpFilter === "all" || e.work_package_id === wpFilter;
      return matchSearch && matchCC && matchType && matchStatus && matchWP && filterByDate(e);
    });
  }, [expenses, debouncedSearch, costCodeFilter, typeFilter, statusFilter, wpFilter, filterByDate]);

  /* ── Spend by cost code (for donut) ── */
  const spendByCostCode = useMemo(() => {
    const map = {};
    activeExpenses.forEach((e) => {
      if (!e.cost_code) return;
      map[e.cost_code] = (map[e.cost_code] || 0) + safeNum(e.amount);
    });
    const totalSpend = Object.values(map).reduce((s, v) => s + v, 0);
    return COST_CODES
      .filter((cc) => map[cc.code] > 0)
      .map((cc) => ({
        ...cc,
        spend: map[cc.code],
        pct: totalSpend > 0 ? Math.round((map[cc.code] / totalSpend) * 100) : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [activeExpenses]);

  /* ── Cost-code budget vs actual ── */
  const costCodeBudgetVsActual = useMemo(() => {
    const spendMap = {};
    activeExpenses.forEach((e) => {
      if (!e.cost_code) return;
      spendMap[e.cost_code] = (spendMap[e.cost_code] || 0) + safeNum(e.amount);
    });
    const items = [];
    const seen = new Set();
    costCodes.forEach((cc) => {
      const code = cc.code || cc.cost_code;
      if (!code || seen.has(code)) return;
      seen.add(code);
      const meta = COST_CODES.find((c) => c.code === code) || {};
      const budget = safeNum(cc.budget_amount);
      const actual = spendMap[code] || 0;
      if (budget > 0 || actual > 0) {
        items.push({
          code,
          name: meta.name || cc.name || code,
          category: meta.category || cc.category || "Misc.",
          budget,
          actual,
          pctUsed: budget > 0 ? Math.round((actual / budget) * 100) : actual > 0 ? 999 : 0,
        });
      }
    });
    // Also include cost codes with spend but no budget record
    Object.entries(spendMap).forEach(([code, actual]) => {
      if (seen.has(code)) return;
      const meta = COST_CODES.find((c) => c.code === code) || {};
      items.push({
        code,
        name: meta.name || code,
        category: meta.category || "Misc.",
        budget: 0,
        actual,
        pctUsed: 999,
      });
    });
    return items.sort((a, b) => b.actual - a.actual);
  }, [activeExpenses, costCodes]);

  /* ── Payment status breakdown ── */
  const statusBreakdown = useMemo(() => {
    const map = {};
    expenses.forEach((e) => {
      const s = e.payment_status || "Unknown";
      if (!map[s]) map[s] = { count: 0, total: 0 };
      map[s].count++;
      map[s].total += safeNum(e.amount);
    });
    return Object.entries(map)
      .map(([status, d]) => ({ status, ...d }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  /* ── Top vendors ── */
  const topVendors = useMemo(() => {
    const map = {};
    activeExpenses.forEach((e) => {
      const v = e.vendor?.trim() || "(No Vendor)";
      map[v] = (map[v] || 0) + safeNum(e.amount);
    });
    return Object.entries(map)
      .map(([vendor, total]) => ({ vendor, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [activeExpenses]);

  /* ── Red-flag alerts ── */
  const redFlagAlerts = useMemo(
    () => buildRedFlagAlerts({ totalCommitted, totalBudget, topVendors, activeExpenses, formatCurrencyShort }),
    [totalCommitted, totalBudget, topVendors, activeExpenses]
  );
  const visibleAlerts = redFlagAlerts.filter((a) => !dismissedAlerts.includes(a.key));

  /* ── Selection + CSV handlers ── */
  const toggleSelect = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((e) => e.id));
  const handleExportCSV = () => exportExpensesCSV(filtered, activeProject?.name);

  /* ── No active project: early return ── */
  if (!activeProject?.id) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
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
    <div style={{ paddingBottom: selected.length > 0 ? 72 : 0 }}>
      <CommandBar
        eyebrow={activeProject?.name || "COST"}
        title="Expenses"
        count={expenses.length}
        unit=" · ENTRIES"
        subtitle={`${formatCurrencyShort(totalCommitted)} committed · ${formatCurrencyShort(totalPaid)} paid`}
      >
        <button
          onClick={refetch}
          title="Refresh"
          className="sbd-btn"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--accent)", color: "var(--bg-base)", border: "none", borderRadius: "var(--radius-btn)", padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >
          <Plus size={12} /> New Expense
        </button>
      </CommandBar>

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
        onDismiss={(key) => setDismissedAlerts((prev) => [...prev, key])}
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
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        onEdit={(e) => { setEditing(e); setModalOpen(true); }}
        onDelete={setDeleteTarget}
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
        nextNumber={`EXP-${String((expenses.length || 0) + 1).padStart(3, "0")}`}
        defaultProjectId={activeProject?.id}
      />

      <ExpenseImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        activeProject={activeProject}
        workPackages={workPackages}
        onImported={() => qc.invalidateQueries({ queryKey: ["expenses"] })}
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
    </div>
  );
}
