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
import { COST_CODES } from "@/components/shared/costCodes";
import { calcEVM } from "@/utils/projectKpis";

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

  // Work packages — needed for EVM-derived scope % in Labor Utilization KPI
  const { data: workPackages = [], isLoading: loadingWP } = useQuery({
    queryKey: getQueryKey("work_package", projectId),
    queryFn: () => base44.entities.WorkPackage.filter({ project_id: projectId }),
    enabled: !!projectId,
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

  // ═══════════════════════════════════════════════════════════════════════
  //  EXECUTIVE KPIs — Phase 2
  //  Four pure computations derived from existing queries.
  //  Reactive to cache invalidation: when any upstream entity (CO, SOV, cost
  //  code, expense, work package, project) is invalidated, React Query
  //  re-fetches, and these useMemo blocks recalculate automatically.
  // ═══════════════════════════════════════════════════════════════════════

  // ── KPI 1: Change Order Impact ─────────────────────────────────────
  //
  // Measures contract growth from COs and whether margin is being captured.
  //
  // Formulas:
  //   contractGrowthPercent  = approvedCOTotal / originalContractValue × 100
  //   marginImpactOnContract = approved margin$ / currentContractValue × 100
  //   avgMarginPercent       = weighted average: totalMarginDollars / totalValue × 100
  //
  // Health thresholds:
  //   green: contractGrowth ≤ 5% AND avg approved margin ≥ 15%
  //          (COs are small relative to contract AND well-margined)
  //   red:   contractGrowth > 15% OR avg approved margin < 10%
  //          (scope creep OR COs being given away at low margin)
  //   amber: everything else
  //   No COs at all → green (clean contract, no scope creep)
  // ───────────────────────────────────────────────────────────────────
  const changeOrderImpact = useMemo(() => {
    const approved = changeOrders.filter(co => co.status === "Approved");
    const pending  = changeOrders.filter(co => ["Submitted", "Under Review"].includes(co.status));
    const rejected = changeOrders.filter(co => ["Rejected", "Void"].includes(co.status));

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
    const currentContractValue  = safeNumber(project?.revised_contract_value || project?.original_contract_value);

    const contractGrowthPercent = originalContractValue > 0
      ? (approvedTotal / originalContractValue) * 100
      : 0;

    const marginImpactOnContract = currentContractValue > 0
      ? (approvedMarginDollar / currentContractValue) * 100
      : 0;

    let health = "amber";
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
  //
  // Compares labor spend against scope progress to detect over/under-burn.
  //
  // Labor cost codes are identified by matching cost_code_number against the
  // COST_CODES catalog where category === 'Labor' (codes 06, 07, 08, 10).
  //
  // Scope % complete uses a hybrid model:
  //   effective = COALESCE(scope_complete_pct_override, evm_derived_pct)
  //   - PM override: stored on projects.scope_complete_pct_override
  //   - EVM derived: calcEVM(workPackages).ev / calcEVM(workPackages).bac × 100
  //
  // Formulas:
  //   percentLaborConsumed   = laborActual / laborBudget × 100
  //   utilizationRatio       = percentLaborConsumed / percentScopeComplete
  //   projectedFinalLaborCost = laborActual / (scopeComplete / 100)
  //   projectedOverrun       = projectedFinalLaborCost − laborBudget
  //
  // Health thresholds (based on utilizationRatio):
  //   green:  ≤ 1.0 (labor spend ≤ scope progress — on or under budget)
  //   amber:  1.0–1.1 (slight overburn, watch closely)
  //   red:    > 1.1 (labor significantly outpacing progress)
  //   null ratio (0% scope) → amber (insufficient data)
  // ───────────────────────────────────────────────────────────────────
  const laborUtilization = useMemo(() => {
    // Filter cost code rows to Labor category using the canonical COST_CODES catalog
    const laborRows = costCodeRows.filter(r => {
      const def = COST_CODES.find(c => c.code === r.cost_code_number);
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
    const percentScopeCompleteSource = overridePct != null ? "override" : "derived";

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

    let health = "amber";
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
  //
  // Compares what's been billed to the GC/owner against actual costs incurred.
  // Over-billing means cash-positive (billings ahead of cost) — generally good
  // up to a point. Under-billing means the company is financing the project.
  //
  // Formulas:
  //   cumulativeBillings = Σ(scheduled_value × current_percent_complete / 100)
  //   cumulativeCost     = total paid expenses (summary.actual)
  //   ratio              = cumulativeBillings / cumulativeCost
  //
  // Position labels:
  //   ratio > 1.02 → 'over-billed'  (2% tolerance for rounding)
  //   ratio < 0.98 → 'under-billed'
  //   else         → 'balanced'
  //
  // Health thresholds (based on ratio):
  //   green: 1.0–1.1 (billing slightly ahead of cost — ideal)
  //   amber: 0.9–1.0 OR 1.1–1.2 (mild imbalance, monitor)
  //   red:   < 0.9 OR > 1.2 (significant imbalance — cash flow risk)
  //   null ratio (zero cost) → amber
  // ───────────────────────────────────────────────────────────────────
  const billingVsCost = useMemo(() => {
    const cumulativeBillings = sovItems.reduce(
      (s, item) => s + safeNumber(item.scheduled_value) * safeNumber(item.current_percent_complete) / 100, 0
    );

    const cumulativeCost = summary.actual;

    // Guard: division by zero when no costs recorded yet
    const ratio = cumulativeCost > 0 ? cumulativeBillings / cumulativeCost : null;

    let position = "balanced";
    if (ratio != null) {
      if (ratio > 1.02) position = "over-billed";
      else if (ratio < 0.98) position = "under-billed";
    }

    const overUnderDollars = cumulativeBillings - cumulativeCost;
    const overUnderPercent = cumulativeCost > 0
      ? (overUnderDollars / cumulativeCost) * 100
      : null;

    let health = "amber";
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
  //
  // Tracks how quickly pay applications convert to cash.
  //
  // Completed cycle: SOV item with both submitted_date and payment_received_date
  //   DSO = payment_received_date − submitted_date (in calendar days)
  //
  // Outstanding: submitted but payment not yet received
  //   daysOutstanding = today − submitted_date
  //
  // Health thresholds:
  //   green: avgDSO ≤ 45 AND no invoice > 60 days outstanding
  //          (healthy cash conversion within typical net-45 terms)
  //   red:   avgDSO > 60 OR any invoice > 90 days outstanding
  //          (cash flow strain — escalate collection efforts)
  //   amber: everything else
  //   No completed cycles AND no outstanding → amber (insufficient data)
  // ───────────────────────────────────────────────────────────────────
  const daysSalesOutstanding = useMemo(() => {
    const today = new Date();

    // Completed payment cycles — both dates present
    const completedItems = sovItems.filter(
      item => item.submitted_date && item.payment_received_date
    );

    const dsoValues = completedItems.map(item => {
      const submitted = new Date(item.submitted_date);
      const received  = new Date(item.payment_received_date);
      return Math.max(0, Math.round((received - submitted) / 86400000));
    });

    const avgDSO = dsoValues.length > 0
      ? dsoValues.reduce((s, d) => s + d, 0) / dsoValues.length
      : null;

    // Median DSO (more robust against outliers than mean)
    let medianDSO = null;
    if (dsoValues.length > 0) {
      const sorted = [...dsoValues].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianDSO = sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Outstanding invoices — submitted but not yet paid
    const outstandingInvoices = sovItems
      .filter(item => item.submitted_date && !item.payment_received_date)
      .map(item => {
        const submitted = new Date(item.submitted_date);
        const daysOutstanding = Math.max(0, Math.round((today - submitted) / 86400000));
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

    const hasOverdue90 = outstandingInvoices.some(inv => inv.daysOutstanding > 90);
    const hasOverdue60 = outstandingInvoices.some(inv => inv.daysOutstanding > 60);

    let health = "amber";
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

    // CRUD
    expenseCrud: { create: expenseCreateMut, update: expenseUpdateMut, delete: expenseDeleteMut },
    costCodeCrud: { create: costCodeCreateMut, update: costCodeUpdateMut, delete: costCodeDeleteMut },
    changeOrderCrud: { create: coCreateMut, update: coUpdateMut, delete: coDeleteMut },

    // Refresh
    refreshAll,
  };
}
