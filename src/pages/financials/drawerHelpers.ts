/**
 * Pure helpers shared by Financials KPI drawers (Billing / CO / Labor / DSO).
 */

export type DrawerSortDir = "asc" | "desc";

/** Numeric-preferring column comparator used by all financial drawers. */
export function compareDrawerRows(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  sortCol: string,
  sortDir: DrawerSortDir = "asc",
): number {
  const aVal = a[sortCol] ?? "";
  const bVal = b[sortCol] ?? "";
  const numA = Number(aVal);
  const numB = Number(bVal);
  if (Number.isFinite(numA) && Number.isFinite(numB)) {
    return sortDir === "asc" ? numA - numB : numB - numA;
  }
  const sA = String(aVal).toLowerCase();
  const sB = String(bVal).toLowerCase();
  if (sA < sB) return sortDir === "asc" ? -1 : 1;
  if (sA > sB) return sortDir === "asc" ? 1 : -1;
  return 0;
}

export function sortDrawerRows<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
  sortCol: string,
  sortDir: DrawerSortDir = "asc",
): T[] {
  return [...(rows || [])].sort((a, b) => compareDrawerRows(a, b, sortCol, sortDir));
}

/** Toggle drawer table sort: same col flips dir; new col defaults to desc. */
export function nextDrawerSort(
  prevCol: string,
  prevDir: DrawerSortDir,
  nextCol: string,
): { sortCol: string; sortDir: DrawerSortDir } {
  if (prevCol === nextCol) {
    return { sortCol: prevCol, sortDir: prevDir === "asc" ? "desc" : "asc" };
  }
  return { sortCol: nextCol, sortDir: "desc" };
}

export function partitionChangeOrders<T extends { status?: string | null }>(
  allCOs: T[] | null | undefined,
): { approved: T[]; pending: T[] } {
  const list = allCOs || [];
  return {
    approved: list.filter((c) => c.status === "Approved"),
    pending: list.filter((c) => ["Submitted", "Under Review"].includes(c.status || "")),
  };
}

/**
 * Billing drawer SOV row enrich.
 * DTP: positive = days submitted→paid; negative = days outstanding; null = not submitted.
 */
export function enrichBillingRows<T extends Record<string, any>>(
  sovItems: T[] | null | undefined,
  opts: {
    nowMs?: number;
    safeNumber: (v: unknown) => number;
    periodDisplay: (from: unknown, to: unknown) => string;
  },
): Array<
  T & {
    _scheduled: number;
    _curPct: number;
    _billedToDate: number;
    _daysToPayment: number | null;
    _period: string;
  }
> {
  const today = opts.nowMs ?? Date.now();
  return (sovItems || []).map((item) => {
    const scheduled = opts.safeNumber(item.scheduled_value);
    const curPct = opts.safeNumber(item.current_percent_complete);
    const billedToDate = (scheduled * curPct) / 100;

    let dtp: number | null = null;
    if (item.submitted_date && item.payment_received_date) {
      const s = new Date(item.submitted_date as string).getTime();
      const p = new Date(item.payment_received_date as string).getTime();
      dtp = Math.max(0, Math.round((p - s) / 86400000));
    } else if (item.submitted_date) {
      const s = new Date(item.submitted_date as string).getTime();
      dtp = -Math.max(0, Math.round((today - s) / 86400000));
    }

    return {
      ...item,
      _scheduled: scheduled,
      _curPct: curPct,
      _billedToDate: billedToDate,
      _daysToPayment: dtp,
      _period: opts.periodDisplay(item.period_from, item.period_to),
    };
  });
}

/** DSO drawer completed payment cycles from SOV items. */
export function buildCompletedPaymentCycles<T extends Record<string, any>>(
  sovItems: T[] | null | undefined,
  safeNumber: (v: unknown) => number,
): Array<T & { _daysToPayment: number; _scheduled: number }> {
  return (sovItems || [])
    .filter((item) => item.submitted_date && item.payment_received_date)
    .map((item) => {
      const submitted = new Date(item.submitted_date as string).getTime();
      const paid = new Date(item.payment_received_date as string).getTime();
      const dtp = Math.max(0, Math.round((paid - submitted) / 86400000));
      return {
        ...item,
        _daysToPayment: dtp,
        _scheduled: safeNumber(item.scheduled_value),
      };
    });
}

export const SOV_STATUS_COLORS: Record<string, string> = {
  Draft: "var(--text-muted)",
  Submitted: "var(--status-info)",
  Certified: "var(--accent)",
  Paid: "var(--status-success)",
};
