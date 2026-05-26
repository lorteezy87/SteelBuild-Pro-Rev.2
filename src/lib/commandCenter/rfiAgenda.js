/**
 * rfiAgenda.js — "Today's RFI Agenda"
 *
 * Deterministic selection + ranking of the RFIs that need attention now, for
 * the weekly production meeting. Pure function, no React / DB / clock side
 * effects beyond the urgency engine it delegates to — same inputs always yield
 * the same agenda, so it is trivially testable.
 *
 * It reuses `rfiUrgency` (the single source of truth for RFI urgency buckets)
 * rather than re-deriving thresholds, then keeps only the buckets that belong on
 * an agenda — overdue, blocking, due-soon, awaiting — and ranks them so the most
 * pressing items lead. Closed/Answered and low-noise RFIs are dropped by the
 * urgency engine (it returns null for them).
 *
 * This is the meeting view the SLA escalation alerts feed into; it does not
 * write anything.
 */

import { rfiUrgency } from "./urgencyEngine";

const AGENDA_URGENCIES = new Set(["overdue", "blocking", "due-soon", "awaiting"]);

// Lower rank = leads the agenda.
const RANK = { overdue: 0, blocking: 1, "due-soon": 2, awaiting: 3 };

const GROUP_LABEL = {
  overdue: "Overdue",
  blocking: "Blocking",
  "due-soon": "Due Soon",
  awaiting: "Awaiting Response",
};

// Stable display order of the grouped buckets.
export const AGENDA_GROUPS = ["Overdue", "Blocking", "Due Soon", "Awaiting Response"];

/**
 * Build today's RFI agenda from a list of RFIs.
 *
 * @param {Array<object>} rfis
 * @param {{ projectMap?: Record<string, object> }} [options]
 * @returns {{ items: Array<object>, groups: Record<string, Array<object>>,
 *             total: number, counts: Record<string, number> }}
 */
export function buildRfiAgenda(rfis = [], options = {}) {
  const projectMap = options.projectMap || {};
  const items = [];

  for (const rfi of rfis || []) {
    if (!rfi || rfi.is_deleted) continue;
    const urgency = rfiUrgency(rfi, projectMap);
    if (!urgency) continue; // Closed/Answered or below the noise floor
    if (!AGENDA_URGENCIES.has(urgency.urgency)) continue;

    items.push({
      rfiId: rfi.id,
      rfiNumber: rfi.rfi_number || null,
      title: rfi.title || rfi.subject || "Untitled RFI",
      urgency: urgency.urgency,
      group: GROUP_LABEL[urgency.urgency],
      reason: urgency.displayStatus,
      bic: urgency.owner || rfi.ball_in_court || "Contractor",
      priority: rfi.priority || null,
      daysValue: Number.isFinite(urgency.daysValue) ? urgency.daysValue : 0,
      rank: RANK[urgency.urgency] ?? 9,
      rfi,
    });
  }

  items.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (b.daysValue !== a.daysValue) return b.daysValue - a.daysValue; // most days first
    return String(a.rfiNumber || "").localeCompare(String(b.rfiNumber || ""));
  });

  const groups = { Overdue: [], Blocking: [], "Due Soon": [], "Awaiting Response": [] };
  for (const item of items) groups[item.group].push(item);

  return {
    items,
    groups,
    total: items.length,
    counts: {
      overdue: groups.Overdue.length,
      blocking: groups.Blocking.length,
      dueSoon: groups["Due Soon"].length,
      awaiting: groups["Awaiting Response"].length,
    },
  };
}
