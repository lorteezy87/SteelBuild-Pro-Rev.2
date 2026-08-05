/**
 * Pure derivations for the canonical Change Order Control Center.
 * No React, no network. All financial math stays integer-safe (multiply/round
 * at the aggregation layer; amounts stored as plain Numbers from the DB).
 */
import type { PillTone } from "@/components/command";

export interface CoRecord {
  id?: string;
  co_number?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  reason_code?: string | null;
  co_amount?: number | null;
  schedule_impact_days?: number | null;
  submitted_date?: string | null;
  approved_date?: string | null;
  approved_by?: string | null;
  source_rfi_id?: string | null;
  [k: string]: unknown;
}

/** Map a CO status string to a command-kit Pill tone. */
export function coStatusTone(status?: string | null): PillTone {
  switch (status) {
    case "Submitted":    return "info";
    case "Under Review": return "warn";
    case "Approved":     return "good";
    case "Rejected":     return "danger";
    case "Draft":
    case "Void":
    default:             return "neutral";
  }
}

export interface CoSummary {
  total: number;
  approved: number;
  pending: number;
  draft: number;
  totalApproved: number;
  totalPending: number;
  atRiskValue: number;
  scheduleDays: number;
  rfiLinked: number;
  workQueue: CoRecord[];
  decisionQueue: CoRecord[];
  riskQueue: CoRecord[];
}

const TERMINAL = new Set(["Approved", "Rejected", "Void"]);
const PENDING_STATUSES = new Set(["Submitted", "Under Review"]);

function safeAmount(co: CoRecord): number {
  const n = Number(co.co_amount);
  return Number.isFinite(n) ? n : 0;
}

function safeScheduleDays(co: CoRecord): number {
  const n = Number(co.schedule_impact_days);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Risk score for a CO — drives riskQueue order.
 * High pending amounts and schedule exposure float to the top.
 */
function coRiskScore(co: CoRecord): number {
  return Math.abs(safeAmount(co)) * 0.001 + safeScheduleDays(co) * 50;
}

/** Build all KPIs + queues for the CO Control Center from the full CO list. */
export function buildCoSummary(cos: CoRecord[]): CoSummary {
  const approved    = cos.filter((c) => c.status === "Approved");
  const pending     = cos.filter((c) => PENDING_STATUSES.has(c.status || ""));
  const draft       = cos.filter((c) => c.status === "Draft");
  const nonTerminal = cos.filter((c) => !TERMINAL.has(c.status || ""));

  const totalApproved = approved.reduce((s, c) => s + safeAmount(c), 0);
  const totalPending  = pending.reduce((s, c) => s + safeAmount(c), 0);
  const totalDraft    = draft.reduce((s, c) => s + safeAmount(c), 0);
  const atRiskValue   = totalPending + totalDraft;

  const scheduleDays = nonTerminal.reduce((s, c) => s + safeScheduleDays(c), 0);
  const rfiLinked    = cos.filter((c) => !!c.source_rfi_id).length;

  // Work Queue: Submitted + Under Review, sorted by submitted_date asc (oldest first), top 6
  const workQueue = [...pending]
    .sort((a, b) => (a.submitted_date || "").localeCompare(b.submitted_date || ""))
    .slice(0, 6);

  // Decision Queue: Under Review preferred (fallback to Submitted), top 5
  const underReview = cos.filter((c) => c.status === "Under Review");
  const decisionBase = underReview.length > 0 ? underReview : pending;
  const decisionQueue = [...decisionBase]
    .sort((a, b) => (a.submitted_date || "").localeCompare(b.submitted_date || ""))
    .slice(0, 5);

  // Risk Queue: top 5 by risk score, excluding Rejected/Void
  const riskQueue = cos
    .filter((c) => c.status !== "Rejected" && c.status !== "Void")
    .sort((a, b) => coRiskScore(b) - coRiskScore(a))
    .slice(0, 5);

  return {
    total:        cos.length,
    approved:     approved.length,
    pending:      pending.length,
    draft:        draft.length,
    totalApproved,
    totalPending,
    atRiskValue,
    scheduleDays,
    rfiLinked,
    workQueue,
    decisionQueue,
    riskQueue,
  };
}
