/**
 * Pure helpers for Contract Management page.
 */

export function pct(n: unknown, d: unknown): number {
  const num = Number(n) || 0;
  const den = Number(d) || 0;
  if (den === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((num / den) * 100)));
}

export type ChangeOrderLike = {
  status?: string | null;
  co_amount?: number | string | null;
  co_number?: number | string | null;
  [key: string]: unknown;
};

export type SovItemLike = {
  line_item_number?: number | string | null;
  scheduled_value?: number | string | null;
  current_percent_complete?: number | string | null;
  retainage_percent?: number | string | null;
  [key: string]: unknown;
};

/** Matches ContractManagement page: Approved status only, sum co_amount. */
export function sumApprovedChangeOrders(changeOrders: ChangeOrderLike[] | null | undefined): number {
  return (changeOrders || [])
    .filter((co) => (co.status || "").trim() === "Approved")
    .reduce((sum, co) => sum + (Number(co.co_amount) || 0), 0);
}

/** Matches page: anything not Approved/Rejected, sum co_amount. */
export function sumPendingChangeOrders(changeOrders: ChangeOrderLike[] | null | undefined): number {
  return (changeOrders || [])
    .filter((co) => !["Approved", "Rejected"].includes((co.status || "").trim()))
    .reduce((sum, co) => sum + (Number(co.co_amount) || 0), 0);
}

/**
 * CO tab + summary breakdown: bucket co_amount by Approved / Rejected / other.
 * Includes total count and rejectedCount for the Change Orders tab KPIs.
 */
export function sumChangeOrderBreakdown(changeOrders: ChangeOrderLike[] | null | undefined) {
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let rejectedCount = 0;
  const list = changeOrders || [];
  for (const co of list) {
    const amt = Number(co.co_amount) || 0;
    const s = (co.status || "").trim();
    if (s === "Approved") approved += amt;
    else if (s === "Rejected") {
      rejected += amt;
      rejectedCount++;
    } else pending += amt;
  }
  return { total: list.length, approved, pending, rejected, rejectedCount };
}

export function sortChangeOrdersByNumber<T extends ChangeOrderLike>(
  changeOrders: T[] | null | undefined,
): T[] {
  return [...(changeOrders || [])].sort(
    (a, b) => (Number(a.co_number) || 0) - (Number(b.co_number) || 0),
  );
}

export function sortSovByLineNumber<T extends SovItemLike>(
  sovItems: T[] | null | undefined,
): T[] {
  return [...(sovItems || [])].sort(
    (a, b) => (Number(a.line_item_number) || 0) - (Number(b.line_item_number) || 0),
  );
}

export function sumSovScheduledValue(sovItems: SovItemLike[] | null | undefined): number {
  return (sovItems || []).reduce((sum, item) => sum + (Number(item.scheduled_value) || 0), 0);
}

/** Billed-to-date from SOV % complete (Contract Summary tab). */
export function sumSovBilledFromPercent(sovItems: SovItemLike[] | null | undefined): number {
  return (sovItems || []).reduce((sum, item) => {
    const sv = Number(item.scheduled_value) || 0;
    const prog = Math.min(100, Math.max(0, Number(item.current_percent_complete) || 0)) / 100;
    return sum + sv * prog;
  }, 0);
}

/** Billing & SOV tab KPI totals (scheduled / billed / retainage / net / expenses). */
export function sumSovBillingTotals(
  items: Array<{
    scheduled_value?: number | string | null;
    current_percent_complete?: number | string | null;
    retainage_percent?: number | string | null;
  }> | null | undefined = [],
  expenses: Array<{ amount?: number | string | null }> | null | undefined = [],
) {
  let scheduled = 0;
  let billed = 0;
  let retainage = 0;
  for (const item of items || []) {
    const sv = Number(item.scheduled_value) || 0;
    const prog = Math.min(100, Math.max(0, Number(item.current_percent_complete) || 0)) / 100;
    const ret = Math.min(100, Math.max(0, Number(item.retainage_percent) || 0)) / 100;
    const billedAmt = sv * prog;
    const retainageAmt = billedAmt * ret;
    scheduled += sv;
    billed += billedAmt;
    retainage += retainageAmt;
  }
  const totalExpenses = (expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  return { scheduled, billed, retainage, netReceived: billed - retainage, totalExpenses };
}
