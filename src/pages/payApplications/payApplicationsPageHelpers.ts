/**
 * Pure helpers for PayApplications page shell.
 */
import { sumMoney } from "@/lib/money";
import { PAY_APP_STATUS_LABELS } from "@/lib/payapp/types";

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type ChangeOrderLike = {
  status?: string | null;
  co_amount?: number | string | null;
};

export type ProjectContractLike = {
  original_contract_value?: number | string | null;
  retainage_percent?: number | string | null;
};

export function buildPayAppContract(
  activeProject: ProjectContractLike | null | undefined,
  changeOrders: ChangeOrderLike[],
) {
  return {
    originalContractSum: num(activeProject?.original_contract_value),
    netChangeOrders: sumMoney(
      (changeOrders || [])
        .filter((co) => String(co.status).toLowerCase() === "approved")
        .map((co) => co.co_amount),
    ),
    retainagePercent: num(activeProject?.retainage_percent),
  };
}

/** @deprecated Prefer `@/pages/shared/findById` — re-export kept for local imports. */
export { findById } from "@/pages/shared/findById";

/** Coerce form/input values to finite numbers (else 0). */
export function toFiniteNumber(v: unknown): number {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

export const PAY_APP_STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
] as const;


/** Human label for a pay application status code. */
export function payAppStatusLabel(status: string | null | undefined): string {
  if (!status) return "Draft";
  return (
    PAY_APP_STATUS_LABELS[status as keyof typeof PAY_APP_STATUS_LABELS] || status
  );
}

