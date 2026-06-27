/**
 * Pure derivations for the RFI Control Center (command_ui redesign).
 * No React, no network. Reuses the canonical helpers in ./utils so the
 * redesigned page computes identically to the classic one.
 */
import { daysOpen, isOverdue } from "./utils";

export interface RfiRecord {
  id?: string;
  rfi_number?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  discipline?: string | null;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  date_required?: string | null;
  date_answered?: string | null;
  cost_impact?: boolean | null;
  cost_impact_amount?: number | null;
  schedule_impact?: boolean | null;
  schedule_impact_days?: number | null;
  [key: string]: unknown;
}

export interface BicSummaryRow {
  company: string;
  count: number;
  oldestNumber: string;
  avgAgeDays: number;
}

export interface RfiSummary {
  total: number;
  open: number;
  needAction: number;
  overdue: number;
  incomplete: number;
  critical: number;
  dueSoon: number;
  responseRate: number;
  costExposure: number;
  scheduleExposure: number;
  riskQueue: RfiRecord[];
  workQueue: RfiRecord[];
  ballInCourt: BicSummaryRow[];
}

const OPEN_STATUSES = new Set(["Open", "Under Review", "Incomplete Response"]);

/** Whole days from today (UTC-midnight basis) until `dateStr`; null if absent/invalid. */
export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

/** Urgency score — copied 1:1 from the classic RfiCommandCenter so both paths rank identically. */
export function riskScore(rfi: RfiRecord): number {
  const age = daysOpen(rfi);
  const due = daysUntil(rfi.date_required);
  let score = age * 4;
  if (isOverdue(rfi)) score += 900;
  if (due !== null && due >= 0 && due <= 3) score += 280;
  if (rfi.status === "Incomplete Response") score += 420;
  if (rfi.status === "Under Review") score += 140;
  if (rfi.priority === "Critical") score += 520;
  if (rfi.priority === "High") score += 230;
  if (rfi.cost_impact) score += 90;
  if (rfi.schedule_impact) score += 90;
  return score;
}

function percent(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

/** Group OPEN rfis by ball-in-court company → count, oldest RFI #, average age. */
export function ballInCourtSummary(rfis: RfiRecord[]): BicSummaryRow[] {
  const groups = new Map<string, RfiRecord[]>();
  for (const rfi of rfis) {
    if (!OPEN_STATUSES.has(rfi.status || "Open")) continue;
    const company = rfi.ball_in_court || "Contractor";
    const bucket = groups.get(company);
    if (bucket) bucket.push(rfi);
    else groups.set(company, [rfi]);
  }
  const rows: BicSummaryRow[] = [];
  for (const [company, members] of groups) {
    let oldest = members[0];
    for (const m of members) {
      if ((m.submitted_date || "") < (oldest.submitted_date || "")) oldest = m;
    }
    const totalAge = members.reduce((sum, m) => sum + daysOpen(m), 0);
    rows.push({
      company,
      count: members.length,
      oldestNumber: oldest.rfi_number || "—",
      avgAgeDays: Math.round(totalAge / members.length),
    });
  }
  return rows.sort((a, b) => b.count - a.count);
}

/** All KPIs + queues + ball-in-court for the RFI Control Center. */
export function buildRfiSummary(rfis: RfiRecord[]): RfiSummary {
  const active = rfis.filter((r) => OPEN_STATUSES.has(r.status || "Open"));
  const overdue = active.filter((r) => isOverdue(r));
  const dueSoon = active.filter((r) => {
    const diff = daysUntil(r.date_required);
    return diff !== null && diff >= 0 && diff <= 3;
  });
  const critical = active.filter((r) => r.priority === "Critical");
  const incomplete = active.filter((r) => r.status === "Incomplete Response");
  const answeredOrClosed = rfis.filter((r) => r.status === "Answered" || r.status === "Closed").length;
  const costExposure = active.reduce((sum, r) => {
    const v = Number(r.cost_impact_amount);
    return r.cost_impact && Number.isFinite(v) ? sum + v : sum;
  }, 0);
  const scheduleExposure = active.reduce((sum, r) => {
    const v = Number(r.schedule_impact_days);
    return r.schedule_impact && Number.isFinite(v) ? sum + v : sum;
  }, 0);
  const byRisk = [...active].sort((a, b) => riskScore(b) - riskScore(a));
  return {
    total: rfis.length,
    open: active.length,
    needAction: active.length,
    overdue: overdue.length,
    incomplete: incomplete.length,
    critical: critical.length,
    dueSoon: dueSoon.length,
    responseRate: percent(answeredOrClosed, rfis.length),
    costExposure,
    scheduleExposure,
    riskQueue: byRisk.slice(0, 5),
    workQueue: byRisk.slice(0, 6),
    ballInCourt: ballInCourtSummary(rfis),
  };
}
