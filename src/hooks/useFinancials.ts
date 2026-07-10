/**
 * useFinancials.ts — Extracted financial calculations and CRUD.
 *
 * Moves ALL budget/cost/SOV calculations out of page components.
 * ONE place for financial math. ONE invalidation path.
 *
 * Usage:
 *   const {
 *     costCodes, expenses, sovItems, changeOrders,
 *     summary, costCodeRows, reviewFlags,
 *     costCodeCrud,
 *     refreshAll,
 *   } = useFinancials(projectId, project);
 *
 * Only costCodeCrud is exposed — it's the one write path with a live consumer
 * (Cost Control Center). Expenses and change orders are written by their own
 * page mutations (Expenses.jsx, ChangeOrders.jsx), which own their validation.
 */

import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import type { Insert, Update, RowWithAliases } from "@/api/supabaseClient";
import { getQueryKey, invalidateEntities } from "@/services/cacheRegistry";
import { validate } from "@/services/validation";
import { computeRevisedContractValue, preferManualActual } from "@/services/costRollup";
import { COST_CODES } from "@/components/shared/costCodes";
import { calcEVM } from "@/utils/projectKpis";

export type CostCode = RowWithAliases<'cost_codes'>;
export type Expense = RowWithAliases<'expenses'>;
export type SOVItem = RowWithAliases<'sov_items'>;
export type ChangeOrder = RowWithAliases<'change_orders'>;
export type WorkPackage = RowWithAliases<'work_packages'>;

// Project is passed in by the caller. NOTE: there is no revised_contract_value
// column on projects — the current contract value is DERIVED as
// original + Σ approved COs via computeRevisedContractValue (costRollup.ts).
// Keep the shape permissive to match real-world call sites.
export type ProjectLike = Partial<RowWithAliases<'projects'>> & {
  original_contract_value?: number | null;
  scope_complete_pct_override?: number | null;
};

// ─── Safe number helper ─────────────────────────────────────────────────
export function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrency(value: unknown): string {
  const n = safeNumber(value);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatSigned(value: unknown): string {
  if (value == null) return "—";
  const n = safeNumber(value);
  if (n === 0) return "$0";
  const prefix = n > 0 ? "+" : "";
  return prefix + formatCurrency(n);
}

export function varianceColor(value: unknown): string {
  const n = safeNumber(value);
  if (n < 0) return "var(--status-error)";
  if (n > 0) return "var(--status-success)";
  return "var(--text-muted)";
}

export type CostCodeRow = CostCode & {
  actual_cost: number;
  committed_cost: number;
  signed_extras: number;
  revised_budget: number;
  original_estimate: number;
  exposure: number;
  remaining_budget: number;
  used_pct: number;
  is_over: boolean;
  expense_count: number;
};

export type FinancialSummary = {
  contractValue: number;
  sovTotal: number;
  revisedBudget: number;
  actual: number;
  committed: number;
  exposure: number;
  marginAtRisk: number;
  totalRemaining: number;
  totalPaid: number;
  totalOutstanding: number;
  pctUsed: number;
  approvedCOTotal: number;
  pendingCOTotal: number;
};

export type ReviewFlag = { tone: 'warning' | 'error'; message: string };

// ─── Hook ───────────────────────────────────────────────────────────────

export function useFinancials(projectId: string | null | undefined, project: ProjectLike | null = null) {
  const qc = useQueryClient();

  // ── Queries ─────────────────────────────────────────────────────────
  const { data: costCodes = [], isLoading: loadingCC } = useQuery<CostCode[]>({
    queryKey: getQueryKey("cost_code", projectId),
    queryFn: () => entities.CostCode.filter({ project_id: projectId }, "cost_code_number", 2000),
    select: (rows) => [...rows].sort((a, b) => (a.cost_code_number || "").localeCompare(b.cost_code_number || "", undefined, { numeric: true })),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const { data: expenses = [], isLoading: loadingExp } = useQuery<Expense[]>({
    queryKey: getQueryKey("expense", projectId),
    queryFn: () => entities.Expense.filter({ project_id: projectId }, "-created_at", 2000),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const { data: sovItems = [], isLoading: loadingSOV } = useQuery<SOVItem[]>({
    queryKey: getQueryKey("sov_item", projectId),
    queryFn: () => entities.SOVItem.filter({ project_id: projectId }, undefined, 2000),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const { data: changeOrders = [], isLoading: loadingCO } = useQuery<ChangeOrder[]>({
    queryKey: getQueryKey("change_order", projectId),
    queryFn: () => entities.ChangeOrder.filter({ project_id: projectId }, undefined, 2000),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // Work packages — needed for EVM-derived scope % in Labor Utilization KPI
  const { data: workPackages = [], isLoading: loadingWP } = useQuery<WorkPackage[]>({
    queryKey: getQueryKey("work_package", projectId),
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }, undefined, 2000),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const isLoading = loadingCC || loadingExp || loadingSOV || loadingCO || loadingWP;

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
  const coByCostCodeId = useMemo<Record<string, number>>(() => {
    return approvedCOs.reduce<Record<string, number>>((acc, co) => {
      const key = co.cost_code_id || "__unmapped__";
      acc[key] = (acc[key] || 0) + safeNumber(co.co_amount);
      return acc;
    }, {});
  }, [approvedCOs]);

  // ── Derived: cost code rows with budget calculations ────────────────
  const costCodeRows = useMemo<CostCodeRow[]>(() => {
    return costCodes.map((cc) => {
      // expenses.cost_code holds the cost-code NUMBER (text); the schema has
      // no cost_code_id on expenses (only on change_orders / sov_items), so
      // matching by cost_code_number is the only path.
      const relatedExpenses = activeExpenses.filter(
        (e) => e.cost_code === cc.cost_code_number
      );

      // Actual/Committed prefer a MANUALLY-entered figure typed onto the cost
      // code (cc.actual_cost / cc.committed_cost columns) when the user set one
      // (> 0); otherwise they roll up from this code's expenses. This lets a PM
      // either type a summary actual directly OR let logged expenses drive it,
      // without double-counting. (User-chosen model 2026-06-30: "typed-in number
      // wins, fall back to expenses." Previously expenses always won, so a typed
      // actual saved to the column but never displayed → looked like it "didn't save".)
      const expenseActual = relatedExpenses
        .filter((e) => e.payment_status === "Paid")
        .reduce((s, e) => s + safeNumber(e.amount), 0);
      const expenseCommitted = relatedExpenses.reduce((s, e) => s + safeNumber(e.amount), 0);

      const actualCost = preferManualActual(cc.actual_cost, expenseActual);
      const committedCost = preferManualActual(cc.committed_cost, expenseCommitted);

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
  const summary = useMemo<FinancialSummary>(() => {
    const contractValue = computeRevisedContractValue(project, changeOrders);
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
      .filter((e) => ["Unpaid", "Pending Approval"].includes(e.payment_status as string))
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
        .filter((co) => ["Submitted", "Under Review"].includes(co.status as string))
        .reduce((s, co) => s + safeNumber(co.co_amount), 0),
    };
  }, [costCodeRows, sovItems, activeExpenses, changeOrders, approvedCOTotal, project]);

  // ── Derived: review flags ───────────────────────────────────────────
  const reviewFlags = useMemo<ReviewFlag[]>(() => {
    const flags: ReviewFlag[] = [];

    // SOV mismatch: only flag when SOV items actually exist
    if (summary.sovTotal > 0 && summary.contractValue > 0 && Math.abs(summary.sovTotal - summary.contractValue) > 1) {
      flags.push({ tone: "warning", message: "SOV total does not match contract value." });
    }
    if (summary.totalRemaining < 0) {
      flags.push({ tone: "error", message: "Budget overrun detected." });
    }

    const unmappedExpenses = activeExpenses.filter((e) => {
      if (!e.cost_code) return true;
      return !costCodes.some((cc) => cc.cost_code_number === e.cost_code);
    });
    if (unmappedExpenses.length > 0) {
      flags.push({ tone: "warning", message: `${unmappedExpenses.length} expense(s) unmapped to cost codes.` });
    }

    // Committed cost gap: only flag when at least one code has activity
    const codesWithBudget = costCodeRows.filter((r) => r.revised_budget > 0);
    const zeroBuckets = codesWithBudget.filter((r) => r.committed_cost === 0 && r.actual_cost === 0);
    const codesWithActivity = codesWithBudget.length - zeroBuckets.length;
    if (zeroBuckets.length > 0 && codesWithActivity > 0) {
      flags.push({ tone: "warning", message: `${zeroBuckets.length} cost code(s) with budget but zero committed/actual.` });
    }

    return flags;
  }, [summary, activeExpenses, costCodes, costCodeRows]);

  // ═══════════════════════════════════════════════════════════════════════
  //  EXECUTIVE KPIs — Phase 2
  //  Four pure computations derived from existing queries.
  //  Reactive to cache invalidation: when any upstream entity (CO, SOV, cost
  //  code, expense, work package, project) is invalidated, React Query
  //  re-fetches, and these useMemo blocks recalculate automatically.
  // ═══════════════════════════════════════════════════════════════════════

  // ── KPI 1: Change Order Impact ─────────────────────────────────────
  const changeOrderImpact = useMemo(() => {
    const approved = changeOrders.filter((co) => co.status === "Approved");
    const pending  = changeOrders.filter((co) => ["Submitted", "Under Review"].includes(co.status as string));
    const rejected = changeOrders.filter((co) => ["Rejected", "Void"].includes(co.status as string));

    const approvedTotal        = approved.reduce((s, co) => s + safeNumber(co.co_amount), 0);
    const approvedMarginDollar = approved.reduce(
      (s, co) => s + safeNumber(co.co_amount) * safeNumber(co.margin_percent) / 100, 0
    );
    const approvedAvgMargin = approvedTotal > 0
      ? (approvedMarginDollar / approvedTotal) * 100
      : 0;

    const pendingTotal        = pending.reduce((s, co) => s + safeNumber(co.co_amount), 0);
    const pendingMarginDollar = pending.reduce(
      (s, co) => s + safeNumber(co.co_amount) * safeNumber(co.margin_percent) / 100, 0
    );
    const pendingAvgMargin = pendingTotal > 0
      ? (pendingMarginDollar / pendingTotal) * 100
      : 0;

    const rejectedTotal = rejected.reduce((s, co) => s + safeNumber(co.co_amount), 0);

    const originalContractValue = safeNumber(project?.original_contract_value);
    const currentContractValue  = computeRevisedContractValue(project, changeOrders);

    const contractGrowthPercent = originalContractValue > 0
      ? (approvedTotal / originalContractValue) * 100
      : 0;

    const marginImpactOnContract = currentContractValue > 0
      ? (approvedMarginDollar / currentContractValue) * 100
      : 0;

    let health: 'green' | 'amber' | 'red' = "amber";
    if (approved.length === 0) {
      health = "green";
    } else if (contractGrowthPercent > 15 || approvedAvgMargin < 10) {
      health = "red";
    } else if (contractGrowthPercent <= 5 && approvedAvgMargin >= 15) {
      health = "green";
    }

    return {
      approved: {
        count: approved.length,
        totalValue: approvedTotal,
        totalMarginDollars: approvedMarginDollar,
        avgMarginPercent: approvedAvgMargin,
      },
      pending: {
        count: pending.length,
        totalValue: pendingTotal,
        totalMarginDollars: pendingMarginDollar,
        avgMarginPercent: pendingAvgMargin,
      },
      rejected: { count: rejected.length, totalValue: rejectedTotal },
      contractGrowthPercent,
      marginImpactOnContract,
      health,
    };
  }, [changeOrders, project]);

  // ── KPI 2: Labor Cost Utilization ──────────────────────────────────
  const laborUtilization = useMemo(() => {
    // Filter cost code rows to Labor category using the canonical COST_CODES catalog
    const laborRows = costCodeRows.filter((r) => {
      const def = COST_CODES.find((c: { code: string; category: string }) => c.code === r.cost_code_number);
      return def?.category === "Labor";
    });

    const laborBudget = laborRows.reduce((s, r) => s + r.revised_budget, 0);
    const laborActual = laborRows.reduce((s, r) => s + r.actual_cost, 0);
    const percentLaborConsumed = laborBudget > 0
      ? (laborActual / laborBudget) * 100
      : 0;

    // EVM-derived scope % from work packages (always computed for transparency)
    const evm = calcEVM(workPackages);
    const evmDerivedPct = evm.bac > 0 ? (evm.ev / evm.bac) * 100 : 0;

    // PM override from project entity (null when not set)
    const overridePct = project?.scope_complete_pct_override != null
      ? safeNumber(project.scope_complete_pct_override)
      : null;

    // Effective: COALESCE(override, evm_derived)
    const percentScopeComplete = overridePct ?? evmDerivedPct;
    const percentScopeCompleteSource: 'override' | 'derived' = overridePct != null ? "override" : "derived";

    // Guard: division by zero when scope is 0%
    const utilizationRatio = percentScopeComplete > 0
      ? percentLaborConsumed / percentScopeComplete
      : null;

    const variance = percentLaborConsumed - percentScopeComplete;

    // Projected final = laborActual / (scope% / 100)
    // If scope is 0%, projection is meaningless → null
    const projectedFinalLaborCost = percentScopeComplete > 0
      ? laborActual / (percentScopeComplete / 100)
      : null;

    const projectedOverrun = projectedFinalLaborCost != null
      ? projectedFinalLaborCost - laborBudget
      : null;

    let health: 'green' | 'amber' | 'red' = "amber";
    if (utilizationRatio == null) {
      health = "amber"; // Insufficient data (0% scope)
    } else if (utilizationRatio <= 1.0) {
      health = "green";
    } else if (utilizationRatio <= 1.1) {
      health = "amber";
    } else {
      health = "red";
    }

    return {
      laborRows, // per-code breakdown for drawer tables
      laborBudget,
      laborActual,
      percentLaborConsumed,
      percentScopeComplete,
      percentScopeCompleteSource,
      evmDerivedPct,
      overridePct,
      utilizationRatio,
      variance,
      projectedFinalLaborCost,
      projectedOverrun,
      health,
    };
  }, [costCodeRows, workPackages, project]);

  // ── KPI 3: Billing vs. Cost Ratio ─────────────────────────────────
  const billingVsCost = useMemo(() => {
    const cumulativeBillings = sovItems.reduce(
      (s, item) => s + safeNumber(item.scheduled_value) * safeNumber(item.current_percent_complete) / 100, 0
    );

    const cumulativeCost = summary.actual;

    // Guard: division by zero when no costs recorded yet
    const ratio = cumulativeCost > 0 ? cumulativeBillings / cumulativeCost : null;

    let position: 'balanced' | 'over-billed' | 'under-billed' = "balanced";
    if (ratio != null) {
      if (ratio > 1.02) position = "over-billed";
      else if (ratio < 0.98) position = "under-billed";
    }

    const overUnderDollars = cumulativeBillings - cumulativeCost;
    const overUnderPercent = cumulativeCost > 0
      ? (overUnderDollars / cumulativeCost) * 100
      : null;

    let health: 'green' | 'amber' | 'red' = "amber";
    if (ratio == null) {
      health = "amber";
    } else if (ratio >= 1.0 && ratio <= 1.1) {
      health = "green";
    } else if ((ratio >= 0.9 && ratio < 1.0) || (ratio > 1.1 && ratio <= 1.2)) {
      health = "amber";
    } else {
      health = "red";
    }

    return {
      cumulativeBillings,
      cumulativeCost,
      ratio,
      position,
      overUnderDollars,
      overUnderPercent,
      health,
    };
  }, [sovItems, summary]);

  // ── KPI 4: Days Sales Outstanding (DSO) ────────────────────────────
  const daysSalesOutstanding = useMemo(() => {
    const today = new Date();

    // Completed payment cycles — both dates present
    const completedItems = sovItems.filter(
      (item) => item.submitted_date && item.payment_received_date
    );

    const dsoValues = completedItems.map((item) => {
      const submitted = new Date(item.submitted_date as string);
      const received  = new Date(item.payment_received_date as string);
      return Math.max(0, Math.round((received.getTime() - submitted.getTime()) / 86400000));
    });

    const avgDSO = dsoValues.length > 0
      ? dsoValues.reduce((s, d) => s + d, 0) / dsoValues.length
      : null;

    // Median DSO (more robust against outliers than mean)
    let medianDSO: number | null = null;
    if (dsoValues.length > 0) {
      const sorted = [...dsoValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianDSO = sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Outstanding invoices — submitted but not yet paid
    const outstandingInvoices = sovItems
      .filter((item) => item.submitted_date && !item.payment_received_date)
      .map((item) => {
        const submitted = new Date(item.submitted_date as string);
        const daysOutstanding = Math.max(0, Math.round((today.getTime() - submitted.getTime()) / 86400000));
        const currentBillingValue =
          safeNumber(item.scheduled_value) * safeNumber(item.current_percent_complete) / 100;
        return {
          sov_id: item.id,
          application_number: item.application_number,
          submitted_date: item.submitted_date,
          daysOutstanding,
          scheduledValue: safeNumber(item.scheduled_value),
          currentBillingValue,
        };
      })
      .sort((a, b) => b.daysOutstanding - a.daysOutstanding); // oldest first

    const totalOutstandingValue = outstandingInvoices.reduce(
      (s, inv) => s + inv.currentBillingValue, 0
    );

    const oldestOutstandingDays = outstandingInvoices.length > 0
      ? outstandingInvoices[0].daysOutstanding
      : null;

    const hasOverdue90 = outstandingInvoices.some((inv) => inv.daysOutstanding > 90);
    const hasOverdue60 = outstandingInvoices.some((inv) => inv.daysOutstanding > 60);

    let health: 'green' | 'amber' | 'red' = "amber";
    if (avgDSO == null && outstandingInvoices.length === 0) {
      health = "amber"; // No data — insufficient to assess
    } else if ((avgDSO != null && avgDSO > 60) || hasOverdue90) {
      health = "red";
    } else if (avgDSO != null && avgDSO <= 45 && !hasOverdue60) {
      health = "green";
    }
    // else stays amber

    return {
      avgDSO,
      medianDSO,
      outstandingInvoices,
      totalOutstandingValue,
      oldestOutstandingDays,
      health,
    };
  }, [sovItems]);

  // ── Invalidation ────────────────────────────────────────────────────
  // Includes work_package so EVM-derived scope % stays fresh
  const refreshAll = useCallback(async () => {
    await invalidateEntities(qc, ["cost_code", "expense", "sov_item", "change_order", "project", "work_package"], projectId);
  }, [qc, projectId]);

  // ── Cost Code CRUD ──────────────────────────────────────────────────
  type CostCodeCreate = Record<string, unknown> & { cost_code_number?: string };
  const costCodeCreateMut = useMutation<CostCode, Error, CostCodeCreate>({
    mutationFn: async (data) => {
      const errors = validate("cost_code", data, "create");
      if (errors.length) throw new Error(errors.map((e: { message: string }) => e.message).join(" "));
      // Duplicate check
      const existing = costCodes.find(
        (cc) => cc.cost_code_number === data.cost_code_number
      );
      if (existing) throw new Error(`Cost code ${data.cost_code_number} already exists in this project.`);
      return await entities.CostCode.create(data as Insert<'cost_codes'>);
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["cost_code"], projectId);
      toast.success("Cost code created");
    },
    onError: (err) => toast.error(`Failed to create cost code: ${err.message}`),
  });

  type CostCodeUpdate = { id: string } & Record<string, unknown>;
  const costCodeUpdateMut = useMutation<CostCode, Error, CostCodeUpdate>({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      return await entities.CostCode.update(id, data as Update<'cost_codes'>);
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["cost_code"], projectId);
      toast.success("Cost code updated");
    },
    onError: (err) => toast.error(`Failed to update cost code: ${err.message}`),
  });

  const costCodeDeleteMut = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await entities.CostCode.delete(id);
      return id;
    },
    onSuccess: async () => {
      await invalidateEntities(qc, ["cost_code"], projectId);
      toast.success("Cost code deleted");
    },
    onError: (err) => toast.error(`Failed to delete cost code: ${err.message}`),
  });

  return {
    // Raw data
    costCodes,
    expenses,
    activeExpenses,
    sovItems,
    changeOrders,
    approvedCOs,
    workPackages,
    isLoading,

    // Calculations
    costCodeRows,
    summary,
    reviewFlags,
    coByCostCodeId,

    // Executive KPIs (Phase 2)
    changeOrderImpact,
    laborUtilization,
    billingVsCost,
    daysSalesOutstanding,

    // Helpers
    safeNumber,
    formatCurrency,
    formatSigned,
    varianceColor,

    // CRUD (only cost codes have a live consumer — Cost Control Center)
    costCodeCrud: { create: costCodeCreateMut, update: costCodeUpdateMut, delete: costCodeDeleteMut },

    // Refresh
    refreshAll,
  };
}
