import { formatCurrencyWhole } from "@/components/shared/formatters";
import { safePct } from "@/components/shared/formatters";
import type { Insert, Update } from "@/api/client/supabaseTypes";
import { computeRevisedContractValue } from "@/services/costRollup";
import { sovScheduledTotal, totalBilled } from "@/pages/dashboard/projectMetrics";

type NumericValue = number | string | null;
type DateValue = string | Date | null;

export interface ContractProject {
  id: string;
  name?: string | null;
  original_contract_value?: NumericValue;
  contract_type?: string | null;
  start_date?: DateValue;
  target_completion_date?: DateValue;
  project_manager?: string | null;
  superintendent?: string | null;
  [key: string]: unknown;
}

export interface ContractChangeOrder {
  id: string;
  project_id?: string | null;
  co_number?: NumericValue;
  co_amount?: NumericValue;
  status?: string | null;
  description?: string | null;
  request_date?: DateValue;
  approval_date?: DateValue;
  [key: string]: unknown;
}

export interface ContractSovItem {
  id: string;
  project_id?: string | null;
  line_item_number?: NumericValue;
  application_number?: NumericValue;
  status?: string | null;
  certification_status?: string | null;
  is_deleted?: boolean | null;
  description?: string | null;
  scheduled_value?: NumericValue;
  current_percent_complete?: NumericValue;
  previous_percent_complete?: NumericValue;
  retainage_percent?: NumericValue;
  payment_received_date?: DateValue;
  submitted_date?: DateValue;
  period_to?: DateValue;
  [key: string]: unknown;
}

export interface ContractExpense {
  id: string;
  amount?: NumericValue;
  [key: string]: unknown;
}
export type SovCreatePayload = Insert<"sov_items">;
export type SovUpdatePayload = Update<"sov_items">;

export const CONTRACT_TABS = ["CHANGE ORDERS", "BILLING & SOV", "CONTRACT SUMMARY"] as const;
export type ContractTab = (typeof CONTRACT_TABS)[number];

export const CONTRACT_TYPES = [
  "Lump Sum",
  "GMP",
  "Cost Plus",
  "Unit Price",
  "Design-Build",
  "Time & Materials",
] as const;

export interface ContractEditForm {
  original_contract_value?: string | number;
  contract_type?: string;
}

export interface ContractUpdatePayload {
  original_contract_value: number;
  contract_type: string | null;
}

export function createContractEditForm(
  project: ContractProject | null | undefined,
): ContractEditForm {
  return {
    original_contract_value: project?.original_contract_value || 0,
    contract_type: project?.contract_type || "",
  };
}

export function createContractUpdatePayload(form: ContractEditForm): ContractUpdatePayload {
  return {
    original_contract_value: Number(form.original_contract_value) || 0,
    contract_type: form.contract_type || null,
  };
}

function amount(value: unknown): number {
  return Number(value) || 0;
}

function status(value: unknown): string {
  return String(value || "").trim();
}

export interface ChangeOrderTotals {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  rejectedCount: number;
}

export function deriveChangeOrders(changeOrders: readonly ContractChangeOrder[] = []): {
  rows: ContractChangeOrder[];
  totals: ChangeOrderTotals;
} {
  const rows = [...changeOrders].sort(
    (a, b) => amount(a.co_number) - amount(b.co_number),
  );
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let rejectedCount = 0;

  for (const changeOrder of rows) {
    const value = amount(changeOrder.co_amount);
    const currentStatus = status(changeOrder.status);
    if (currentStatus === "Approved") approved += value;
    else if (currentStatus === "Rejected") {
      rejected += value;
      rejectedCount += 1;
    } else pending += value;
  }

  return {
    rows,
    totals: { total: rows.length, approved, pending, rejected, rejectedCount },
  };
}

export interface BillingSovRow {
  item: ContractSovItem;
  scheduledValue: number;
  percentComplete: number;
  retainageRate: number;
  billedAmount: number;
  retainageAmount: number;
  balance: number;
}

export interface BillingSovTotals {
  scheduled: number;
  billed: number;
  retainage: number;
  netReceived: number;
  totalExpenses: number;
}

export function deriveBillingSov(
  sovItems: readonly ContractSovItem[] = [],
  expenses: readonly ContractExpense[] = [],
): { rows: BillingSovRow[]; totals: BillingSovTotals } {
  const items = [...sovItems].sort(
    (a, b) => amount(a.line_item_number) - amount(b.line_item_number),
  );
  let scheduled = 0;
  let billed = 0;
  let retainage = 0;

  const rows = items.map((item) => {
    const scheduledValue = amount(item.scheduled_value);
    const percentComplete = Math.min(
      100,
      Math.max(0, amount(item.current_percent_complete)),
    );
    const retainageRate =
      Math.min(100, Math.max(0, amount(item.retainage_percent))) / 100;
    const billedAmount = scheduledValue * (percentComplete / 100);
    const retainageAmount = billedAmount * retainageRate;
    scheduled += scheduledValue;
    billed += billedAmount;
    retainage += retainageAmount;
    return {
      item,
      scheduledValue,
      percentComplete,
      retainageRate,
      billedAmount,
      retainageAmount,
      balance: scheduledValue - billedAmount,
    };
  });

  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + amount(expense.amount),
    0,
  );
  return {
    rows,
    totals: {
      scheduled,
      billed,
      retainage,
      netReceived: billed - retainage,
      totalExpenses,
    },
  };
}

export interface ContractPageFinancials {
  originalValue: number;
  approvedCOTotal: number;
  pendingCOTotal: number;
  revisedValue: number;
}

export function deriveContractPageFinancials(
  project: ContractProject | null | undefined,
  changeOrders: readonly ContractChangeOrder[] = [],
): ContractPageFinancials {
  const { totals } = deriveChangeOrders(changeOrders);
  return {
    originalValue: amount(project?.original_contract_value),
    approvedCOTotal: totals.approved,
    pendingCOTotal: totals.pending,
    revisedValue: computeRevisedContractValue(project, [...changeOrders]),
  };
}

export type ContractHealthTone = "success" | "warning" | "error" | "info";

export interface ContractHealthItem {
  label: string;
  detail: string;
  tone: ContractHealthTone;
}

export interface ContractWaterfallStep {
  label: string;
  value: number;
  color: string;
  running: number;
}

export interface ContractSummary {
  originalValue: number;
  coBreakdown: Pick<ChangeOrderTotals, "approved" | "pending" | "rejected">;
  sovTotal: number;
  billedTotal: number;
  sovMismatch: number;
  sovMismatchPct: number;
  billingProgress: number;
  outstandingCOs: number;
  waterfallSteps: ContractWaterfallStep[];
  healthItems: ContractHealthItem[];
  recentApprovedChangeOrders: ContractChangeOrder[];
}

export function deriveContractSummary(
  project: ContractProject | null | undefined,
  changeOrders: readonly ContractChangeOrder[] = [],
  sovItems: readonly ContractSovItem[] = [],
  revisedValue = computeRevisedContractValue(project, [...changeOrders]),
): ContractSummary {
  const originalValue = amount(project?.original_contract_value);
  const { totals } = deriveChangeOrders(changeOrders);
  const coBreakdown = {
    approved: totals.approved,
    rejected: totals.rejected,
    pending: totals.pending,
  };
  const sovTotal = sovScheduledTotal(sovItems);
  const billedTotal = totalBilled(sovItems);
  const sovMismatch = Math.abs(sovTotal - revisedValue);
  const sovMismatchPct =
    revisedValue > 0 ? Math.round((sovMismatch / revisedValue) * 100) : 0;
  const billingProgress = safePct(billedTotal, revisedValue);
  const outstandingCOs = changeOrders.filter(
    (changeOrder) => !["Approved", "Rejected"].includes(status(changeOrder.status)),
  ).length;
  const waterfallSteps = [
    {
      label: "Original Contract",
      value: originalValue,
      color: "var(--text-primary)",
      running: originalValue,
    },
    {
      label: "+Approved COs",
      value: coBreakdown.approved,
      color: "var(--status-success)",
      running: originalValue + coBreakdown.approved,
    },
    {
      label: "-Rejected COs",
      value: coBreakdown.rejected,
      color: "var(--status-error)",
      running: originalValue + coBreakdown.approved,
    },
    {
      label: "= Revised Contract",
      value: revisedValue,
      color: "var(--accent)",
      running: revisedValue,
    },
  ];

  const healthItems: ContractHealthItem[] = [];
  if (sovMismatchPct > 5) {
    healthItems.push({
      label: "SOV vs Contract Mismatch",
      detail: `SOV total (${formatCurrencyWhole(sovTotal)}) differs from revised contract by ${formatCurrencyWhole(sovMismatch)} (${sovMismatchPct}%)`,
      tone: "error",
    });
  } else if (sovMismatchPct > 1) {
    healthItems.push({
      label: "SOV vs Contract Mismatch",
      detail: `SOV total (${formatCurrencyWhole(sovTotal)}) differs from revised contract by ${formatCurrencyWhole(sovMismatch)} (${sovMismatchPct}%)`,
      tone: "warning",
    });
  } else {
    healthItems.push({
      label: "SOV vs Contract Alignment",
      detail: `SOV total (${formatCurrencyWhole(sovTotal)}) aligns with revised contract value`,
      tone: "success",
    });
  }
  healthItems.push({
    label: "Billing Progress",
    detail: `${billingProgress}% billed (${formatCurrencyWhole(billedTotal)} of ${formatCurrencyWhole(revisedValue)})`,
    tone: billingProgress >= 75 ? "success" : billingProgress >= 40 ? "warning" : "info",
  });
  healthItems.push(
    outstandingCOs > 0
      ? {
          label: "Outstanding Change Orders",
          detail: `${outstandingCOs} change order(s) pending review or approval (${formatCurrencyWhole(coBreakdown.pending)})`,
          tone: outstandingCOs > 3 ? "error" : "warning",
        }
      : {
          label: "Change Orders",
          detail: "All change orders resolved",
          tone: "success",
        },
  );

  const recentApprovedChangeOrders = changeOrders
    .filter(
      (changeOrder) =>
        Boolean(changeOrder.approval_date) && status(changeOrder.status) === "Approved",
    )
    .sort(
      (a, b) =>
        new Date(String(b.approval_date)).getTime() -
        new Date(String(a.approval_date)).getTime(),
    )
    .slice(0, 3);

  return {
    originalValue,
    coBreakdown,
    sovTotal,
    billedTotal,
    sovMismatch,
    sovMismatchPct,
    billingProgress,
    outstandingCOs,
    waterfallSteps,
    healthItems,
    recentApprovedChangeOrders,
  };
}
