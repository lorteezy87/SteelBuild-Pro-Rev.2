/**
 * useFinancials.js — Extracted financial calculations and CRUD.
 *
 * Moves ALL budget/cost/SOV calculations out of page components.
 * ONE place for financial math. ONE invalidation path.
 *
 * Usage:
 *   const {
 *     costCodes, expenses, sovItems, changeOrders,
 *     summary, costCodeRows, reviewFlags,
 *     expenseCrud, costCodeCrud, changeOrderCrud,
 *     refreshAll,
 *   } = useFinancials(projectId, project);
 */

import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { getQueryKey, invalidateEntities } from "@/services/cacheRegistry";
import { validate } from "@/services/validation";

// ─── Safe number helper ─────────────────────────────────────────────────
export function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrency(value) {
  const n = safeNumber(value);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatSigned(value) {
  if (value == null) return "—";
  const n = safeNumber(value);
  if (n === 0) return "$0";
  const prefix = n > 0 ? "+" : "";
  return prefix + formatCurrency(n);
}

export function varianceColor(value) {
  const n = safeNumber(value);
  if (n < 0) return "var(--status-error)";
  if (n > 0) return "var(--status-success)";
  return "var(--text-muted)";
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function useFinancials(projectId, project = null) {
  const qc = useQueryClient();

  // ── Queries ─────────────────────────────────────────────────────────
  const { data: costCodes = [], isLoading: loadingCC } = useQuery({
    queryKey: getQueryKey("cost_code", projectId),
    queryFn: () => base44.entities.CostCode.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: expenses = [], isLoading: loadingExp } = useQuery({
    queryKey: getQueryKey("expense", projectId),
    queryFn: () => base44.entities.Expense.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: sovItems = [], isLoading: loadingSOV } = useQuery({
    queryKey: getQueryKey("sov_item", projectId),
    queryFn: () => base44.entities.SOVItem.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: changeOrders = [], isLoading: loadingCO } = useQuery({
    queryKey: getQueryKey("change_order", projectId),
    queryFn: () => base44.entities.ChangeOrder.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const isLoading = loadingCC || loadingExp || loadingSOV || loadingCO;

  // ── Derived: active expenses (exclude voided) ───────────────────────
  const activeExpenses = useMemo(
    () => expenses.filter((e) => e.payment_status !== "Voided"),
    [expenses]
  );

  // ── Derived: approved COs ───────────────────────────────────────────
  const approvedCOs = useMemo(
    () => changeOrders.filter((co) => co.status === "Approved"),
    [changeOrders]
  );

  const approvedCOTotal = useMemo(
    () => approvedCOs.reduce((s, co) => s + safeNumber(co.co_amount), 0),
    [approvedCOs]
  );

  // ── Derived: CO amounts by cost_code_id ─────────────────────────────
  const coByCostCodeId = useMemo(() => {
    return approvedCOs.reduce((acc, co) => {
      const key = co.cost_code_id || "__unmapped__";
      acc[key] = (acc[key] || 0) + safeNumber(co.co_amount);
      return acc;
    }, {});
  }, [approvedCOs]);

  // ── Derived: cost code rows with budget calculations ────────────────
  const costCodeRows = useMemo(() => {
    return costCodes.map((cc) => {
      const relatedExpenses = activeExpenses.filter(
        (e) => e.cost_code === cc.cost_code_number || e.cost_code_id === cc.id
      );

      const actualCost = relatedExpenses
        .filter((e) => e.payment_status === "Paid")
        .reduce((s, e) => s + safeNumber(e.amount), 0);

      const committedCost = relatedExpenses.reduce((s, e) => s + safeNumber(e.amount), 0);

      const signedExtras = coByCostCodeId[cc.id] || 0;
      const revisedBudget = safeNumber(cc.budget_amount) + signedExtras;
      const originalEstimate = revisedBudget - signedExtras;
      const exposure = committedCost;
      const remainingBudget = revisedBudget - exposure;
      const usedPct = revisedBudget > 0 ? (exposure / revisedBudget) * 100 : 0;

      return {
        ...cc,
        actual_cost: actualCost,
        committed_cost: committedCost,
        signed_extras: signedExtras,
        revised_budget: revisedBudget,
        original_estimate: originalEstimate,
        exposure,
        remaining_budget: remainingBudget,
        used_pct: usedPct,
        is_over: remainingBudget < 0,
        expense_count: relatedExpenses.length,
      };
    });
  }, [costCodes, activeExpenses, coByCostCodeId]);

  // ── Derived: project-level summary ──────────────────────────────────
  const summary = useMemo(() => {
    const contractValue = safeNumber(project?.revised_contract_value || project?.original_contract_value);
    const sovTotal = sovItems.reduce((s, item) => s + safeNumber(item.scheduled_value), 0);
    const revisedBudget = costCodeRows.reduce((s, r) => s + r.revised_budget, 0);
    const actual = costCodeRows.reduce((s, r) => s + r.actual_cost, 0);
    const committed = costCodeRows.reduce((s, r) => s + r.committed_cost, 0);
    const exposure = committed;
    const marginAtRisk = contractValue - exposure;
    const totalRemaining = revisedBudget - committed;
    const totalPaid = activeExpenses
      .filter((e) => e.payment_status === "Paid")
      .reduce((s, e) => s + safeNumber(e.amount), 0);
    const totalOutstanding = activeExpenses
      .filter((e) => ["Unpaid", "Pending Approval"].includes(e.payment_status))
      .reduce((s, e) => s + safeNumber(e.amount), 0);
    const pctUsed = revisedBudget > 0 ? (committed / revisedBudget) * 100 : 0;

    return {
      contractValue,
      sovTotal,
      revisedBudget,
      actual,
      committed,
      exposure,
      marginAtRisk,
      totalRemaining,
      totalPaid,
      totalOutstanding,
      pctUsed,
      approvedCOTotal,
      pendingCOTotal: changeOrders
        .filter((co) => ["Submitted", "Under Review"].includes(co.status))
        .reduce((s, co) => s + safeNumber(co.co_amount), 0),
    };
  }, [costCodeRows, sovItems, activeExpenses, changeOrders, approvedCOTotal, project]);

  // ── Derived: review flags ───────────────────────────────────────────
  const reviewFlags = useMemo(() => {
    const flags = [];

    if (Math.abs(summary.sovTotal - summary.contractValue) > 1 && summary.contractValue > 0) {
      flags.push({ tone: "warning", message: "SOV total does not match contract value." });
    }
    if (summary.totalRemaining < 0) {
      flags.push({ tone: "error", message: "Budget overrun detected." });
    }

    const unmappedExpenses = activeExpenses.filter((e) => {
      if (!e.cost_code && !e.cost_code_id) return true;
      return !costCodes.some((cc) => cc.cost_code_number === e.cost_code || cc.id === e.cost_code_id);
    });
    if (unmappedExpenses.length > 0) {
      flags.push({ tone: "warning", message: `${unmappedExpenses.length} expense(s) unmapped to cost codes.` });
    }

    const zeroBuckets = costCodeRows.filter(
      (r) => r.revised_budget > 0 && r.committed_cost === 0 && r.actual_cost === 0
    );
    if (zeroBuckets.length > 0) {
      flags.push({ tone: "warning", message: `${zeroBuckets.length} cost code(s) with budget but zero committed/actual.` });
    }

    return flags;
  }, [summary, activeExpenses, costCodes, costCodeRows]);

  // ── Invalidation ────────────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    await invalidateEntities(qc, ["cost_code", "expense", "sov_item", "change_order", "project"], projectId);
  }, [qc, projectId]);

  // ── Expense CRUD ────────────────────────────────────────────────────
  const expenseCreateMut = useMutation({
    mutationFn: async (data) => {
      const errors = validate("expense", data, "create");
      if (errors.length) throw new Error(errors.map((e) => e.message).join(" "));
      return await base44.entities.Expense.create(data);
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["expense"], projectId);
      toast.success("Expense created");
    },
    onError: (err) => toast.error(`Failed to create expense: ${err.message}`),
  });

  const expenseUpdateMut = useMutation({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      return await base44.entities.Expense.update(id, data);
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["expense"], projectId);
      toast.success("Expense updated");
    },
    onError: (err) => toast.error(`Failed to update expense: ${err.message}`),
  });

  const expenseDeleteMut = useMutation({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await base44.entities.Expense.delete(id);
      return id;
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["expense"], projectId);
      toast.success("Expense deleted");
    },
    onError: (err) => toast.error(`Failed to delete expense: ${err.message}`),
  });

  // ── Cost Code CRUD ──────────────────────────────────────────────────
  const costCodeCreateMut = useMutation({
    mutationFn: async (data) => {
      const errors = validate("cost_code", data, "create");
      if (errors.length) throw new Error(errors.map((e) => e.message).join(" "));
      // Duplicate check
      const existing = costCodes.find(
        (cc) => cc.cost_code_number === data.cost_code_number
      );
      if (existing) throw new Error(`Cost code ${data.cost_code_number} already exists in this project.`);
      return await base44.entities.CostCode.create(data);
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["cost_code"], projectId);
      toast.success("Cost code created");
    },
    onError: (err) => toast.error(`Failed to create cost code: ${err.message}`),
  });

  const costCodeUpdateMut = useMutation({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      return await base44.entities.CostCode.update(id, data);
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["cost_code"], projectId);
      toast.success("Cost code updated");
    },
    onError: (err) => toast.error(`Failed to update cost code: ${err.message}`),
  });

  const costCodeDeleteMut = useMutation({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await base44.entities.CostCode.delete(id);
      return id;
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["cost_code"], projectId);
      toast.success("Cost code deleted");
    },
    onError: (err) => toast.error(`Failed to delete cost code: ${err.message}`),
  });

  // ── Change Order CRUD ───────────────────────────────────────────────
  const coCreateMut = useMutation({
    mutationFn: async (data) => {
      const errors = validate("change_order", data, "create");
      if (errors.length) throw new Error(errors.map((e) => e.message).join(" "));
      return await base44.entities.ChangeOrder.create(data);
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["change_order", "project"], projectId);
      toast.success("Change order created");
    },
    onError: (err) => toast.error(`Failed to create change order: ${err.message}`),
  });

  const coUpdateMut = useMutation({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      return await base44.entities.ChangeOrder.update(id, data);
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["change_order", "project"], projectId);
      toast.success("Change order updated");
    },
    onError: (err) => toast.error(`Failed to update change order: ${err.message}`),
  });

  const coDeleteMut = useMutation({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await base44.entities.ChangeOrder.delete(id);
      return id;
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["change_order", "project"], projectId);
      toast.success("Change order deleted");
    },
    onError: (err) => toast.error(`Failed to delete change order: ${err.message}`),
  });

  return {
    // Raw data
    costCodes,
    expenses,
    activeExpenses,
    sovItems,
    changeOrders,
    approvedCOs,
    isLoading,

    // Calculations
    costCodeRows,
    summary,
    reviewFlags,
    coByCostCodeId,

    // Helpers
    safeNumber,
    formatCurrency,
    formatSigned,
    varianceColor,

    // CRUD
    expenseCrud: { create: expenseCreateMut, update: expenseUpdateMut, delete: expenseDeleteMut },
    costCodeCrud: { create: costCodeCreateMut, update: costCodeUpdateMut, delete: costCodeDeleteMut },
    changeOrderCrud: { create: coCreateMut, update: coUpdateMut, delete: coDeleteMut },

    // Refresh
    refreshAll,
  };
}
