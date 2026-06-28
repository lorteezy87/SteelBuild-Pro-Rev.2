/**
 * Pure derivations for the Backcharge Defense Control Center (command_ui redesign).
 * No React, no network. Reuses rollupBackcharges from the canonical cost engine so
 * both paths compute identically.
 */
import { rollupBackcharges, computeTmTicketTotal } from "@/lib/backcharge/cost";
import {
  OPEN_BACKCHARGE_STATUSES,
  BACKCHARGE_STATUS_LABELS,
  type BackchargeStatus,
} from "@/lib/backcharge/types";
import type { Backcharge, TmTicket } from "@/lib/backcharge/types";

// Re-export the Backcharge type so the component can import from here (mirrors
// how RfiControlCenter exports RfiRecord from rfiControlCenter.derive.ts).
export type { Backcharge };

export interface VendorSummaryRow {
  vendor: string;
  count: number;
  totalAmount: number;
  openAmount: number;
  statuses: string[];
}

export interface DisputedRow {
  id: string;
  title: string;
  amount: number;
  responsible_party: string | null | undefined;
  status: BackchargeStatus;
  notice_date: string | null | undefined;
}

export interface BackchargeSummary {
  // KPI counts / amounts
  total: number;
  open: number;
  openAmount: number;       // $ exposure still being chased
  totalAmount: number;      // all logged (includes resolved)
  collected: number;        // $ actually received
  recoveredAmount: number;  // alias for collected (labelled "Recovered" in UI)
  disputed: number;         // count with status === "disputed"
  defenseReady: number;     // count with a notice_date on record
  noticeRate: number;       // % with a notice_date (0–100 int)
  // Tone for open exposure KPI
  openTone: "danger" | "warn" | "neutral";
  // Panel queues
  openQueue: Backcharge[];          // top open backcharges by amount desc
  disputedQueue: DisputedRow[];     // disputed ones, sorted by amount desc
  byVendor: VendorSummaryRow[];     // grouped by responsible_party
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Group backcharges by responsible_party → count, total $, open $, status list. */
export function vendorSummary(backcharges: Backcharge[]): VendorSummaryRow[] {
  const groups = new Map<string, { items: Backcharge[] }>();
  for (const b of backcharges) {
    if (b.is_deleted) continue;
    const vendor = b.responsible_party?.trim() || "Unknown";
    const bucket = groups.get(vendor);
    if (bucket) bucket.items.push(b);
    else groups.set(vendor, { items: [b] });
  }
  const rows: VendorSummaryRow[] = [];
  for (const [vendor, { items }] of groups) {
    let totalAmount = 0;
    let openAmount = 0;
    const statusSet = new Set<string>();
    for (const b of items) {
      const amt = num(b.amount);
      totalAmount += amt;
      if (OPEN_BACKCHARGE_STATUSES.has(b.status as BackchargeStatus)) openAmount += amt;
      statusSet.add(BACKCHARGE_STATUS_LABELS[b.status as BackchargeStatus] || b.status);
    }
    rows.push({
      vendor,
      count: items.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      openAmount: Math.round(openAmount * 100) / 100,
      statuses: [...statusSet],
    });
  }
  return rows.sort((a, b) => b.totalAmount - a.totalAmount);
}

/** All KPIs + queues for the Backcharge Defense Control Center. */
export function buildBackchargeSummary(backcharges: Backcharge[]): BackchargeSummary {
  const live = backcharges.filter((b) => !b.is_deleted);
  const rollup = rollupBackcharges(live);

  const open = live.filter((b) => OPEN_BACKCHARGE_STATUSES.has(b.status as BackchargeStatus));
  const disputedItems = live.filter((b) => b.status === "disputed");
  const withNotice = live.filter((b) => !!b.notice_date);

  // Defense-ready = has a notice_date on record (the contractual protection step).
  const defenseReady = withNotice.length;
  const noticeRate = live.length ? Math.round((defenseReady / live.length) * 100) : 0;

  // Open exposure tone: >$50k → danger, >$0 → warn, $0 → neutral
  const openTone: "danger" | "warn" | "neutral" =
    rollup.open > 50000 ? "danger" : rollup.open > 0 ? "warn" : "neutral";

  // Open queue: top 6 open backcharges by amount desc
  const openQueue = [...open].sort((a, b) => num(b.amount) - num(a.amount)).slice(0, 6);

  // Disputed panel: top 5 disputed, sorted by amount desc
  const disputedQueue: DisputedRow[] = [...disputedItems]
    .sort((a, b) => num(b.amount) - num(a.amount))
    .slice(0, 5)
    .map((b) => ({
      id: b.id,
      title: b.title,
      amount: num(b.amount),
      responsible_party: b.responsible_party,
      status: b.status as BackchargeStatus,
      notice_date: b.notice_date,
    }));

  return {
    total: live.length,
    open: open.length,
    openAmount: rollup.open,
    totalAmount: rollup.total,
    collected: rollup.collected,
    recoveredAmount: rollup.collected,
    disputed: disputedItems.length,
    defenseReady,
    noticeRate,
    openTone,
    openQueue,
    disputedQueue,
    byVendor: vendorSummary(live),
  };
}

/** Re-export computeTmTicketTotal so the component can compute per-ticket $ without
 *  importing from the lib directly (keeps the component's imports self-contained). */
export { computeTmTicketTotal };
export type { TmTicket };
