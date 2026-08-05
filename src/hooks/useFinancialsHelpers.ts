/**
 * Pure financial derive helpers extracted from useFinancials.
 * Hook keeps queries/mutations; math lives here for unit tests.
 */
import { computeRevisedContractValue, preferManualActual } from "@/services/costRollup";
import { COST_CODES } from "@/components/shared/costCodes";
import { calcEVM } from "@/utils/projectKpis";
import type {
  CostCode,
  CostCodeRow,
  Expense,
  SOVItem,
  ChangeOrder,
  WorkPackage,
  ProjectLike,
  FinancialSummary,
  ReviewFlag,
} from "./useFinancials";

export function filterActiveExpenses<T extends { payment_status?: string | null }>(
  expenses: T[],
): T[] {
  return expenses.filter((e) => e.payment_status !== "Voided");
}

export function filterApprovedChangeOrders<T extends { status?: string | null }>(
  changeOrders: T[],
): T[] {
  return changeOrders.filter((co) => co.status === "Approved");
}

export function sumApprovedCoTotal(
  approvedCOs: Array<{ co_amount?: unknown }>,
  safeNumber: (v: unknown) => number,
): number {
  return approvedCOs.reduce((s, co) => s + safeNumber(co.co_amount), 0);
}

export function buildCoByCostCodeId(
  approvedCOs: Array<{ cost_code_id?: string | null; co_amount?: unknown }>,
  safeNumber: (v: unknown) => number,
): Record<string, number> {
  return approvedCOs.reduce<Record<string, number>>((acc, co) => {
    const key = co.cost_code_id || "__unmapped__";
    acc[key] = (acc[key] || 0) + safeNumber(co.co_amount);
    return acc;
  }, {});
}

export function buildCostCodeRows(args: {
  costCodes: CostCode[];
  activeExpenses: Expense[];
  coByCostCodeId: Record<string, number>;
  safeNumber: (v: unknown) => number;
}): CostCodeRow[] {
  const { costCodes, activeExpenses, coByCostCodeId, safeNumber } = args;
  return costCodes.map((cc) => {
    // expenses.cost_code holds the cost-code NUMBER (text); the schema has
    // no cost_code_id on expenses (only on change_orders / sov_items), so
    // matching by cost_code_number is the only path.
    const relatedExpenses = activeExpenses.filter(
      (e) => e.cost_code === cc.cost_code_number,
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
}

export function buildFinancialSummary(args: {
  project: ProjectLike | null;
  changeOrders: ChangeOrder[];
  sovItems: SOVItem[];
  costCodeRows: CostCodeRow[];
  activeExpenses: Expense[];
  approvedCOTotal: number;
  safeNumber: (v: unknown) => number;
}): FinancialSummary {
  const {
    project,
    changeOrders,
    sovItems,
    costCodeRows,
    activeExpenses,
    approvedCOTotal,
    safeNumber,
  } = args;
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
}

export function buildReviewFlags(args: {
  summary: FinancialSummary;
  activeExpenses: Expense[];
  costCodes: CostCode[];
  costCodeRows: CostCodeRow[];
}): ReviewFlag[] {
  const { summary, activeExpenses, costCodes, costCodeRows } = args;
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
}

export function buildChangeOrderImpact(
  changeOrders: ChangeOrder[],
  project: ProjectLike | null,
  safeNumber: (v: unknown) => number,
) {
  const approved = changeOrders.filter((co) => co.status === "Approved");
  const pending = changeOrders.filter((co) => ["Submitted", "Under Review"].includes(co.status as string));
  const rejected = changeOrders.filter((co) => ["Rejected", "Void"].includes(co.status as string));

  const approvedTotal = approved.reduce((s, co) => s + safeNumber(co.co_amount), 0);
  const approvedMarginDollar = approved.reduce(
    (s, co) => s + (safeNumber(co.co_amount) * safeNumber(co.margin_percent)) / 100,
    0,
  );
  const approvedAvgMargin = approvedTotal > 0 ? (approvedMarginDollar / approvedTotal) * 100 : 0;

  const pendingTotal = pending.reduce((s, co) => s + safeNumber(co.co_amount), 0);
  const pendingMarginDollar = pending.reduce(
    (s, co) => s + (safeNumber(co.co_amount) * safeNumber(co.margin_percent)) / 100,
    0,
  );
  const pendingAvgMargin = pendingTotal > 0 ? (pendingMarginDollar / pendingTotal) * 100 : 0;

  const rejectedTotal = rejected.reduce((s, co) => s + safeNumber(co.co_amount), 0);

  const originalContractValue = safeNumber(project?.original_contract_value);
  const currentContractValue = computeRevisedContractValue(project, changeOrders);

  const contractGrowthPercent =
    originalContractValue > 0 ? (approvedTotal / originalContractValue) * 100 : 0;

  const marginImpactOnContract =
    currentContractValue > 0 ? (approvedMarginDollar / currentContractValue) * 100 : 0;

  let health: "green" | "amber" | "red" = "amber";
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
}

export function buildLaborUtilization(args: {
  costCodeRows: CostCodeRow[];
  workPackages: WorkPackage[];
  project: ProjectLike | null;
  safeNumber: (v: unknown) => number;
}) {
  const { costCodeRows, workPackages, project, safeNumber } = args;
  // Filter cost code rows to Labor category using the canonical COST_CODES catalog
  const laborRows = costCodeRows.filter((r) => {
    const def = COST_CODES.find((c: { code: string; category: string }) => c.code === r.cost_code_number);
    return def?.category === "Labor";
  });

  const laborBudget = laborRows.reduce((s, r) => s + r.revised_budget, 0);
  const laborActual = laborRows.reduce((s, r) => s + r.actual_cost, 0);
  const percentLaborConsumed = laborBudget > 0 ? (laborActual / laborBudget) * 100 : 0;

  // EVM-derived scope % from work packages (always computed for transparency)
  const evm = calcEVM(workPackages);
  const evmDerivedPct = evm.bac > 0 ? (evm.ev / evm.bac) * 100 : 0;

  // PM override from project entity (null when not set)
  const overridePct =
    project?.scope_complete_pct_override != null
      ? safeNumber(project.scope_complete_pct_override)
      : null;

  // Effective: COALESCE(override, evm_derived)
  const percentScopeComplete = overridePct ?? evmDerivedPct;
  const percentScopeCompleteSource: "override" | "derived" =
    overridePct != null ? "override" : "derived";

  // Guard: division by zero when scope is 0%
  const utilizationRatio =
    percentScopeComplete > 0 ? percentLaborConsumed / percentScopeComplete : null;

  const variance = percentLaborConsumed - percentScopeComplete;

  // Projected final = laborActual / (scope% / 100)
  // If scope is 0%, projection is meaningless → null
  const projectedFinalLaborCost =
    percentScopeComplete > 0 ? laborActual / (percentScopeComplete / 100) : null;

  const projectedOverrun =
    projectedFinalLaborCost != null ? projectedFinalLaborCost - laborBudget : null;

  let health: "green" | "amber" | "red" = "amber";
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
}

export function buildBillingVsCost(args: {
  sovItems: SOVItem[];
  summary: FinancialSummary;
  safeNumber: (v: unknown) => number;
}) {
  const { sovItems, summary, safeNumber } = args;
  const cumulativeBillings = sovItems.reduce(
    (s, item) =>
      s + (safeNumber(item.scheduled_value) * safeNumber(item.current_percent_complete)) / 100,
    0,
  );

  const cumulativeCost = summary.actual;

  // Guard: division by zero when no costs recorded yet
  const ratio = cumulativeCost > 0 ? cumulativeBillings / cumulativeCost : null;

  let position: "balanced" | "over-billed" | "under-billed" = "balanced";
  if (ratio != null) {
    if (ratio > 1.02) position = "over-billed";
    else if (ratio < 0.98) position = "under-billed";
  }

  const overUnderDollars = cumulativeBillings - cumulativeCost;
  const overUnderPercent = cumulativeCost > 0 ? (overUnderDollars / cumulativeCost) * 100 : null;

  let health: "green" | "amber" | "red" = "amber";
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
}

export function buildDaysSalesOutstanding(
  sovItems: SOVItem[],
  safeNumber: (v: unknown) => number,
  today: Date = new Date(),
) {
  // Completed payment cycles — both dates present
  const completedItems = sovItems.filter(
    (item) => item.submitted_date && item.payment_received_date,
  );

  const dsoValues = completedItems.map((item) => {
    const submitted = new Date(item.submitted_date as string);
    const received = new Date(item.payment_received_date as string);
    return Math.max(0, Math.round((received.getTime() - submitted.getTime()) / 86400000));
  });

  const avgDSO =
    dsoValues.length > 0 ? dsoValues.reduce((s, d) => s + d, 0) / dsoValues.length : null;

  // Median DSO (more robust against outliers than mean)
  let medianDSO: number | null = null;
  if (dsoValues.length > 0) {
    const sorted = [...dsoValues].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianDSO =
      sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Outstanding invoices — submitted but not yet paid
  const outstandingInvoices = sovItems
    .filter((item) => item.submitted_date && !item.payment_received_date)
    .map((item) => {
      const submitted = new Date(item.submitted_date as string);
      const daysOutstanding = Math.max(
        0,
        Math.round((today.getTime() - submitted.getTime()) / 86400000),
      );
      const currentBillingValue =
        (safeNumber(item.scheduled_value) * safeNumber(item.current_percent_complete)) / 100;
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
    (s, inv) => s + inv.currentBillingValue,
    0,
  );

  const oldestOutstandingDays =
    outstandingInvoices.length > 0 ? outstandingInvoices[0].daysOutstanding : null;

  const hasOverdue90 = outstandingInvoices.some((inv) => inv.daysOutstanding > 90);
  const hasOverdue60 = outstandingInvoices.some((inv) => inv.daysOutstanding > 60);

  let health: "green" | "amber" | "red" = "amber";
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
}
