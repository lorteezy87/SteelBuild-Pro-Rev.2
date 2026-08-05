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
import { logActivity } from "@/services/auditLogger";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import {
  filterActiveExpenses,
  filterApprovedChangeOrders,
  sumApprovedCoTotal,
  buildCoByCostCodeId,
  buildCostCodeRows,
  buildFinancialSummary,
  buildReviewFlags,
  buildChangeOrderImpact,
  buildLaborUtilization,
  buildBillingVsCost,
  buildDaysSalesOutstanding,
} from "./useFinancialsHelpers";

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
    () => filterActiveExpenses(expenses),
    [expenses]
  );

  // ── Derived: approved COs ───────────────────────────────────────────
  const approvedCOs = useMemo(
    () => filterApprovedChangeOrders(changeOrders),
    [changeOrders]
  );

  const approvedCOTotal = useMemo(
    () => sumApprovedCoTotal(approvedCOs, safeNumber),
    [approvedCOs]
  );

  // ── Derived: CO amounts by cost_code_id ─────────────────────────────
  const coByCostCodeId = useMemo<Record<string, number>>(
    () => buildCoByCostCodeId(approvedCOs, safeNumber),
    [approvedCOs],
  );

  // ── Derived: cost code rows with budget calculations ────────────────
  const costCodeRows = useMemo<CostCodeRow[]>(
    () =>
      buildCostCodeRows({
        costCodes,
        activeExpenses,
        coByCostCodeId,
        safeNumber,
      }),
    [costCodes, activeExpenses, coByCostCodeId],
  );

  // ── Derived: project-level summary ──────────────────────────────────
  const summary = useMemo<FinancialSummary>(
    () =>
      buildFinancialSummary({
        project,
        changeOrders,
        sovItems,
        costCodeRows,
        activeExpenses,
        approvedCOTotal,
        safeNumber,
      }),
    [costCodeRows, sovItems, activeExpenses, changeOrders, approvedCOTotal, project],
  );

  // ── Derived: review flags ───────────────────────────────────────────
  const reviewFlags = useMemo<ReviewFlag[]>(
    () =>
      buildReviewFlags({
        summary,
        activeExpenses,
        costCodes,
        costCodeRows,
      }),
    [summary, activeExpenses, costCodes, costCodeRows],
  );

  // ═══════════════════════════════════════════════════════════════════════
  //  EXECUTIVE KPIs — Phase 2
  //  Four pure computations derived from existing queries.
  //  Reactive to cache invalidation: when any upstream entity (CO, SOV, cost
  //  code, expense, work package, project) is invalidated, React Query
  //  re-fetches, and these useMemo blocks recalculate automatically.
  // ═══════════════════════════════════════════════════════════════════════

  // ── KPI 1: Change Order Impact ─────────────────────────────────────
  const changeOrderImpact = useMemo(
    () => buildChangeOrderImpact(changeOrders, project, safeNumber),
    [changeOrders, project],
  );

  // ── KPI 2: Labor Cost Utilization ──────────────────────────────────
  const laborUtilization = useMemo(
    () =>
      buildLaborUtilization({
        costCodeRows,
        workPackages,
        project,
        safeNumber,
      }),
    [costCodeRows, workPackages, project],
  );

  // ── KPI 3: Billing vs. Cost Ratio ─────────────────────────────────
  const billingVsCost = useMemo(
    () =>
      buildBillingVsCost({
        sovItems,
        summary,
        safeNumber,
      }),
    [sovItems, summary],
  );

  // ── KPI 4: Days Sales Outstanding (DSO) ────────────────────────────
  const daysSalesOutstanding = useMemo(
    () => buildDaysSalesOutstanding(sovItems, safeNumber),
    [sovItems],
  );

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
    onSuccess: async (created) => {
      await invalidateEntities(qc, ["cost_code"], projectId);
      logActivity("create", "cost_code", created, {
        projectId: created?.project_id || projectId,
        projectName: created?.project_name,
      });
      toast.success("Cost code created");
    },
    onError: (err) => toast.error(`Failed to create cost code: ${toUserErrorMessage(err)}`),
  });

  type CostCodeUpdate = { id: string } & Record<string, unknown>;
  const costCodeUpdateMut = useMutation<CostCode, Error, CostCodeUpdate>({
    mutationFn: async ({ id, ...data }) => {
      if (!id) throw new Error("Update requires an id.");
      return await entities.CostCode.update(id, data as Update<'cost_codes'>);
    },
    onSuccess: async (updated) => {
      await invalidateEntities(qc, ["cost_code"], projectId);
      logActivity("update", "cost_code", updated, {
        projectId: updated?.project_id || projectId,
        projectName: updated?.project_name,
      });
      toast.success("Cost code updated");
    },
    onError: (err) => toast.error(`Failed to update cost code: ${toUserErrorMessage(err)}`),
  });

  const costCodeDeleteMut = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      if (!id) throw new Error("Delete requires an id.");
      await entities.CostCode.delete(id);
      return id;
    },
    onSuccess: async (id) => {
      await invalidateEntities(qc, ["cost_code"], projectId);
      logActivity("delete", "cost_code", { id, cost_code_number: id }, {
        projectId,
        description: "Archived cost code",
      });
      toast.success("Cost code archived");
    },
    onError: (err) => toast.error(`Failed to archive cost code: ${toUserErrorMessage(err)}`),
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
