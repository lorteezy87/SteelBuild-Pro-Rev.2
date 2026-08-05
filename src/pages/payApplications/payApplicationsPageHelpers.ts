/**
 * Pure helpers for PayApplications page shell.
 */
import { sumMoney } from "@/lib/money";

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

export function findById<T extends { id?: string | null }>(
  rows: T[],
  id: string | null | undefined,
): T | null {
  if (!id) return null;
  return (rows || []).find((a) => a.id === id) || null;
}

/** Coerce form/input values to finite numbers (else 0). */
export function toFiniteNumber(v: unknown): number {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

