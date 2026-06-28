/**
 * Pure derivations for the Pay Applications Control Center (command_ui redesign).
 * No React, no network. All money math via src/lib/money.ts (integer-cents
 * convention) — NEVER raw floats or toLocaleString on raw db values.
 *
 * Column notes (real fields from PayApplication in src/lib/payapp/types.ts):
 *   application_number   — sequential integer
 *   period_from / period_to — ISO date strings | null
 *   status               — "draft" | "submitted" | "approved" | "paid" | "void"
 *   current_payment_due  — dollars (money.ts convention)
 *   total_completed_stored — dollars
 *   total_retainage      — dollars
 *   original_contract_sum  — dollars
 *   net_change_orders    — dollars
 *   less_previous_certificates — dollars
 *   retainage_percent    — number (e.g. 10 = 10%)
 *   submitted_date / certified_date / paid_date — ISO date | null
 */
import { formatMoney, sumMoney, subMoney, addMoney } from "@/lib/money";
import type { PayApplication, PayAppStatus } from "@/lib/payapp/types";
import { PAY_APP_STATUS_LABELS } from "@/lib/payapp/types";

export type { PayApplication };

// ---------------------------------------------------------------------------
// Tones
// ---------------------------------------------------------------------------

export type StatusTone = "good" | "warn" | "danger" | "neutral" | "info";

export function payAppStatusTone(status: PayAppStatus | string | null | undefined): StatusTone {
  switch (status) {
    case "paid":      return "good";
    case "approved":  return "good";
    case "submitted": return "info";
    case "draft":     return "neutral";
    case "void":      return "danger";
    default:          return "neutral";
  }
}

// ---------------------------------------------------------------------------
// KPI summary
// ---------------------------------------------------------------------------

export interface PayAppKpiSummary {
  /** Count of all non-deleted pay applications. */
  total: number;
  /** Count by status */
  draftCount: number;
  submittedCount: number;
  approvedCount: number;
  paidCount: number;
  voidCount: number;
  /** Sum of current_payment_due for submitted + approved apps (pending payment, in dollars). */
  pendingPaymentDue: number;
  /** Sum of current_payment_due for paid apps (in dollars). */
  totalPaid: number;
  /** Sum of total_retainage across ALL non-void apps (in dollars). */
  retainageHeld: number;
  /**
   * Balance to finish = contract sum to date − total earned less retainage.
   * Derived from the MOST RECENT app's figures (best approximation without
   * re-running G702 engine here).
   */
  balanceToFinish: number;
  /**
   * Overall % complete = total_completed_stored / contract_sum_to_date on the
   * most recent app (0 if no apps).
   */
  percentComplete: number;
  /** Most recent non-void app (by application_number desc), or null. */
  latestApp: PayApplication | null;
}

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function buildPayAppSummary(payApps: PayApplication[]): PayAppKpiSummary {
  const active = payApps.filter((a) => !a.is_deleted && a.status !== "void");
  const nonVoid = payApps.filter((a) => !a.is_deleted && a.status !== "void");

  const draftCount     = payApps.filter((a) => !a.is_deleted && a.status === "draft").length;
  const submittedCount = payApps.filter((a) => !a.is_deleted && a.status === "submitted").length;
  const approvedCount  = payApps.filter((a) => !a.is_deleted && a.status === "approved").length;
  const paidCount      = payApps.filter((a) => !a.is_deleted && a.status === "paid").length;
  const voidCount      = payApps.filter((a) => !a.is_deleted && a.status === "void").length;

  const pendingPaymentDue = sumMoney(
    payApps
      .filter((a) => !a.is_deleted && (a.status === "submitted" || a.status === "approved"))
      .map((a) => a.current_payment_due),
  );

  const totalPaid = sumMoney(
    payApps
      .filter((a) => !a.is_deleted && a.status === "paid")
      .map((a) => a.current_payment_due),
  );

  const retainageHeld = sumMoney(nonVoid.map((a) => a.total_retainage));

  // Latest non-void app for derived contract figures
  const latestApp =
    active.length > 0
      ? active.reduce((best, a) =>
          num(a.application_number) > num(best.application_number) ? a : best,
        active[0])
      : null;

  // Balance to finish: contract sum to date − total earned less retainage
  // G702 line 9 = (original + COs) − (completed_stored − retainage)
  let balanceToFinish = 0;
  let percentComplete = 0;
  if (latestApp) {
    const contractSum = addMoney(
      latestApp.original_contract_sum,
      latestApp.net_change_orders,
    );
    const earnedLessRetainage = subMoney(
      latestApp.total_completed_stored,
      latestApp.total_retainage,
    );
    balanceToFinish = subMoney(contractSum, earnedLessRetainage);

    const contractCents = Math.round(num(contractSum) * 100);
    const completedCents = Math.round(num(latestApp.total_completed_stored) * 100);
    percentComplete = contractCents > 0 ? Math.round((completedCents / contractCents) * 100) : 0;
  }

  return {
    total: payApps.filter((a) => !a.is_deleted).length,
    draftCount,
    submittedCount,
    approvedCount,
    paidCount,
    voidCount,
    pendingPaymentDue,
    totalPaid,
    retainageHeld,
    balanceToFinish,
    percentComplete,
    latestApp,
  };
}

// ---------------------------------------------------------------------------
// Panel queues
// ---------------------------------------------------------------------------

export interface PayAppPanelQueues {
  /** Apps awaiting action: submitted → needs approval, approved → needs payment. */
  awaitingAction: PayApplication[];
  /** By status: buckets with count + total payment due. */
  byStatus: { status: PayAppStatus; label: string; count: number; total: number }[];
  /** Most recent 5 apps by application_number desc. */
  recent: PayApplication[];
}

export function buildPayAppPanelQueues(payApps: PayApplication[]): PayAppPanelQueues {
  const active = payApps.filter((a) => !a.is_deleted);

  const awaitingAction = active
    .filter((a) => a.status === "submitted" || a.status === "approved")
    .sort((a, b) => num(b.application_number) - num(a.application_number));

  // By-status buckets
  const STATUS_ORDER: PayAppStatus[] = ["draft", "submitted", "approved", "paid", "void"];
  const byStatus = STATUS_ORDER.map((status) => {
    const bucket = active.filter((a) => a.status === status);
    return {
      status,
      label: PAY_APP_STATUS_LABELS[status],
      count: bucket.length,
      total: sumMoney(bucket.map((a) => a.current_payment_due)),
    };
  }).filter((b) => b.count > 0);

  const recent = [...active]
    .sort((a, b) => num(b.application_number) - num(a.application_number))
    .slice(0, 5);

  return { awaitingAction, byStatus, recent };
}

// ---------------------------------------------------------------------------
// Formatting helpers (pure — safe to call from both derive and component)
// ---------------------------------------------------------------------------

export function fmtPeriod(app: PayApplication): string {
  const from = app.period_from;
  const to = app.period_to;
  if (!from && !to) return "—";
  if (!from) return `through ${to}`;
  if (!to) return `from ${from}`;
  return `${from} – ${to}`;
}

export function fmtPct(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return `${Math.round(pct)}%`;
}

// Re-export for use in the component without a separate import
export { formatMoney, PAY_APP_STATUS_LABELS };
