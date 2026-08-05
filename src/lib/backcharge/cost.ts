/**
 * Backcharge cost math — the single place T&M ticket totals and backcharge
 * rollups are computed (§23: centralize cost math, explicit decimal handling).
 * Pure + side-effect free.
 */
import type { Backcharge, TmTicket } from "./types";
import { OPEN_BACKCHARGE_STATUSES, type BackchargeStatus } from "./types";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Round to cents (2dp) without binary-float drift on the boundary. */
export function roundCurrency(value: number): number {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

/**
 * The total cost of one T&M ticket:
 *   (labor_hours × labor_rate + equipment + material) × (1 + markup%/100)
 * Rounded to cents. This is the authoritative ticket-total definition — the
 * stored `amount` column should mirror it (the repository stamps it on write).
 */
export function computeTmTicketTotal(
  ticket: Pick<TmTicket, "labor_hours" | "labor_rate" | "equipment_cost" | "material_cost" | "markup_percent">,
): number {
  const labor = num(ticket.labor_hours) * num(ticket.labor_rate);
  const base = labor + num(ticket.equipment_cost) + num(ticket.material_cost);
  const withMarkup = base * (1 + num(ticket.markup_percent) / 100);
  return roundCurrency(withMarkup);
}

/** Sum of T&M ticket totals (recomputed from inputs — never trusts a drifted `amount`). */
export function sumTmTickets(tickets: TmTicket[] | null | undefined): number {
  const live = (tickets || []).filter((t) => t && !t.is_deleted);
  return roundCurrency(live.reduce((s, t) => s + computeTmTicketTotal(t), 0));
}

/**
 * The defensible backcharge amount = the greater of the entered header `amount`
 * and the sum of its T&M tickets. (A header may be entered before tickets, or
 * tickets may exceed a placeholder header — surface the larger, documented figure.)
 */
export function computeBackchargeAmount(backcharge: Pick<Backcharge, "amount">, tickets: TmTicket[] | null | undefined): number {
  return roundCurrency(Math.max(num(backcharge.amount), sumTmTickets(tickets)));
}

export interface BackchargeRollup {
  total: number;
  open: number;
  collected: number;
  byStatus: Record<string, { count: number; amount: number }>;
  count: number;
}

/** Portfolio/project rollup of backcharge exposure by status. */
export function rollupBackcharges(backcharges: Backcharge[] | null | undefined): BackchargeRollup {
  const live = (backcharges || []).filter((b) => b && !b.is_deleted);
  const byStatus: Record<string, { count: number; amount: number }> = {};
  let total = 0;
  let open = 0;
  let collected = 0;
  for (const b of live) {
    const amt = num(b.amount);
    total += amt;
    if (OPEN_BACKCHARGE_STATUSES.has(b.status as BackchargeStatus)) open += amt;
    if (b.status === "collected") collected += amt;
    const bucket = byStatus[b.status] || { count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount = roundCurrency(bucket.amount + amt);
    byStatus[b.status] = bucket;
  }
  return {
    total: roundCurrency(total),
    open: roundCurrency(open),
    collected: roundCurrency(collected),
    byStatus,
    count: live.length,
  };
}
