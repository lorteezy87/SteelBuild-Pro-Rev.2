// ── portfolioDerive — pure portfolio roll-ups ────────────────────────────
//
// Single-input derivations extracted from PortfolioView so the dashboard's
// summary math is named, testable, and out of the 2,000-line container. Each
// takes one prop array and returns a plain summary — no React, no state. Bodies
// are byte-identical to the originals (with defensive `|| []` guards added).
import { summarizeProjectSchedule } from "./portfolioTimeline";
import { statusIn, parseUTCDate } from "../shared/formatters";

/**
 * Split every change order into trust buckets: approved (committed), pending
 * (priced, likely to hit budget), unpriced (scope not yet priced), disputed
 * (rejected but still on the table). Void COs are excluded. `totalExposure` =
 * pending + disputed. `cost_impact_amount` is the legacy pre-migration field.
 */
export function computeCoExposure(allCOs) {
  const byBucket = {
    approved: { amount: 0, items: [] },
    pending:  { amount: 0, items: [] },
    unpriced: { amount: 0, items: [] },
    disputed: { amount: 0, items: [] },
  };
  for (const co of allCOs || []) {
    const amt = Number(co.co_amount ?? co.cost_impact_amount ?? 0);
    const status = String(co.status || "").trim();
    if (status === "Void") continue;

    let bucket = null;
    if (status === "Approved") bucket = "approved";
    else if (["Draft", "Submitted", "Under Review"].includes(status)) {
      bucket = amt > 0 ? "pending" : "unpriced";
    } else if (status === "Rejected" && amt > 0) {
      bucket = "disputed";
    }
    if (!bucket) continue;

    byBucket[bucket].amount += amt;
    byBucket[bucket].items.push(co);
  }
  const totalExposure = byBucket.pending.amount + byBucket.disputed.amount;
  return { ...byBucket, totalExposure };
}

/** Group schedule tasks by project_id and summarize each (project_id → summary). */
export function summarizeSchedulesByProject(allScheduleTasks) {
  const byProject = {};
  for (const t of allScheduleTasks || []) {
    if (!t.project_id) continue;
    if (!byProject[t.project_id]) byProject[t.project_id] = [];
    byProject[t.project_id].push(t);
  }
  const out = {};
  for (const [pid, tasks] of Object.entries(byProject)) {
    out[pid] = summarizeProjectSchedule(tasks);
  }
  return out;
}

/** Total tonnage across all work packages. */
export function computeTotalTons(allWPs) {
  return (allWPs || []).reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
}

/** Tonnage that's reached fabrication or beyond and is in progress / complete. */
export function computeFabricatedTonnage(allWPs) {
  const PHASE_RANK = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };
  return (allWPs || [])
    .filter((w) => (PHASE_RANK[w.phase] ?? -1) >= 1 && ["In Progress", "Complete"].includes(w.status))
    .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
}

/** Delivery board: scheduled / in-transit / late counts, the 3 latest late, and the next upcoming. */
export function computeDeliveriesStats(allDeliveries) {
  const list = allDeliveries || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isLate = (d) => {
    if (!d.scheduled_date || statusIn(d.status, ["Delivered"])) return false;
    const sched = parseUTCDate(d.scheduled_date);
    return sched && sched < today;
  };
  const scheduled = list.filter((d) => statusIn(d.status, ["Scheduled"])).length;
  const inTransit = list.filter((d) => statusIn(d.status, ["In Transit"])).length;
  const lateAll = list.filter(isLate);
  const late = lateAll.length;
  const lateList = lateAll
    .sort((a, b) => (parseUTCDate(a.scheduled_date) || 0) - (parseUTCDate(b.scheduled_date) || 0))
    .slice(0, 3)
    .map((d) => {
      const sched = parseUTCDate(d.scheduled_date);
      return {
        ...d,
        daysLate: sched ? Math.max(0, Math.floor((today - sched) / 86400000)) : 0,
      };
    });
  // Next upcoming delivery
  const upcoming = list
    .filter((d) => {
      if (statusIn(d.status, ["Delivered"]) || !d.scheduled_date) return false;
      const sched = parseUTCDate(d.scheduled_date);
      return sched && sched >= today;
    })
    .sort((a, b) => (parseUTCDate(a.scheduled_date) || 0) - (parseUTCDate(b.scheduled_date) || 0));
  const nextDelivery = upcoming[0] || null;
  return { scheduled, inTransit, late, lateList, nextDelivery };
}

/** Average RFI turnaround in days (submitted → responded) for closed RFIs, or null when none. */
export function computeRfiTurnaround(allRFIs) {
  const closed = (allRFIs || []).filter((r) => statusIn(r.status, ["Answered", "Closed"]) && r.submitted_date && r.responded_date);
  if (closed.length === 0) return null;
  const totalDays = closed.reduce((s, r) => {
    const submitted = parseUTCDate(r.submitted_date);
    const responded = parseUTCDate(r.responded_date);
    if (!submitted || !responded) return s;
    return s + Math.max(0, Math.floor((responded - submitted) / 86400000));
  }, 0);
  return (totalDays / closed.length).toFixed(1);
}
