/**
 * feedAggregator.js — Combines all entity urgency results into a single
 * unified feed array, ready for sorting and filtering.
 *
 * Usage:
 *   const feed = buildFeed({ rfis, drawings, drawingSets, ... }, projectMap);
 *
 * Returns an array of urgency items (nulls filtered out).
 */

import {
  rfiUrgency,
  drawingUrgency,
  drawingSetUrgency,
  changeOrderUrgency,
  deliveryUrgency,
  workPackageUrgency,
  sovUrgency,
  productionNoteUrgency,
  scheduleTaskUrgency,
} from "./urgencyEngine";

// ── Drawing aggregation (sheet → set) ───────────────────────────────────
//
// The Command Center used to emit one feed item per drawing sheet, which
// spammed the feed when a 40-sheet IFC set was uploaded ("S-101", "S-102",
// …). Now we group sheets by (project_id, drawing_set_name) and emit ONE
// item per set, carrying the worst-case urgency and earliest-past /
// earliest-future due date across its sheets.
//
// Sheets missing a drawing_set_name fall back to their per-sheet item so
// orphans still surface; they're flagged by the validation layer anyway.

const URGENCY_RANK = { overdue: 5, blocking: 4, "due-soon": 3, awaiting: 2, normal: 1 };

const normalizeSetName = (s) =>
  (s || "").toString().trim().replace(/\s+/g, " ");

function worstUrgency(a, b) {
  return (URGENCY_RANK[a] || 0) >= (URGENCY_RANK[b] || 0) ? a : b;
}

function aggregateDrawingsBySet(drawings, projectMap) {
  const setMap = new Map();
  const orphans = [];

  for (const d of drawings) {
    const item = drawingUrgency(d, projectMap);
    if (!item) continue; // skip non-actionable stages

    const setName = normalizeSetName(d.drawing_set_name);
    if (!setName) { orphans.push(item); continue; }

    const key = `${d.project_id}|${setName}`;
    if (!setMap.has(key)) {
      setMap.set(key, {
        setName,
        projectId: d.project_id,
        projectNumber: projectMap[d.project_id]?.project_number || null,
        sheets: [],
        items: [],
        worstUrgency: "normal",
        earliestDue: null,     // earliest future due_date (YYYY-MM-DD)
        earliestOverdue: null, // EARLIEST past due_date — the biggest days-
                               // overdue value, i.e. the most-urgent past-due
                               // item. Previously we only tracked
                               // latestOverdue, which represented the
                               // least-overdue item and caused the set's
                               // effectiveDue to pick a stale / nearly-
                               // resolved date as the bucket anchor.
        overdueCount: 0,
        dueSoonCount: 0,
        owners: new Set(),
      });
    }

    const g = setMap.get(key);
    g.sheets.push(d);
    g.items.push(item);
    g.worstUrgency = worstUrgency(g.worstUrgency, item.urgency);
    if (item.urgency === "overdue") g.overdueCount += 1;
    if (item.urgency === "due-soon") g.dueSoonCount += 1;
    if (item.owner) g.owners.add(item.owner);

    const due = d.due_date || null;
    if (due) {
      const today = new Date().toISOString().slice(0, 10);
      if (due < today) {
        // EARLIEST overdue = largest days-past signal = most urgent.
        if (!g.earliestOverdue || due < g.earliestOverdue) g.earliestOverdue = due;
      } else if (!g.earliestDue || due < g.earliestDue) {
        g.earliestDue = due;
      }
    }
  }

  const out = [];
  for (const g of setMap.values()) {
    // Pick the most urgent underlying item as the "anchor" — we borrow its
    // daysValue + quickAction so downstream code (sort, 48h/10d windows)
    // keeps working without special-casing.
    const anchor = g.items.reduce((best, cur) => {
      return (URGENCY_RANK[cur.urgency] || 0) > (URGENCY_RANK[best.urgency] || 0) ? cur : best;
    }, g.items[0]);

    const total = g.sheets.length;
    let displayStatus;
    if (g.overdueCount > 0) {
      displayStatus = `${g.overdueCount} of ${total} sheet${total !== 1 ? "s" : ""} past due`;
    } else if (g.dueSoonCount > 0) {
      displayStatus = `${g.dueSoonCount} of ${total} sheet${total !== 1 ? "s" : ""} due soon`;
    } else if (g.worstUrgency === "awaiting") {
      displayStatus = `${total} sheet${total !== 1 ? "s" : ""} awaiting return`;
    } else {
      displayStatus = `${total} sheet${total !== 1 ? "s" : ""} in progress`;
    }

    // Synthetic raw record so UpcomingWindows / todayView's date-lookup
    // code (which reads raw.due_date) keeps working at the set level.
    //
    // Selection rule:
    //   - If the set is primarily overdue (≥ half of actionable sheets
    //     are past due), anchor on the EARLIEST overdue date so the set
    //     sorts to the top of the overdue bucket. Previously we picked
    //     the latest overdue — that's the least-urgent past-due date and
    //     understated the real signal.
    //   - Otherwise, anchor on the earliest FUTURE date so the set lands
    //     in the right UpcomingWindows bucket (48h / 10d). A set with
    //     one stale overdue sheet + 20 future sheets no longer binds
    //     to the past-due window; it shows up where the future work is.
    //
    // Falls back to whatever is available, in that preference order.
    const majorityOverdue = g.overdueCount > 0 && g.overdueCount >= total / 2;
    const effectiveDue = majorityOverdue
      ? (g.earliestOverdue || g.earliestDue)
      : (g.earliestDue || g.earliestOverdue || null);

    out.push({
      urgency: g.worstUrgency,
      daysValue: anchor.daysValue,
      displayStatus,
      quickAction: anchor.quickAction,
      itemType: "DWG",
      title: g.setName,
      owner: g.owners.size === 1 ? [...g.owners][0] : null,
      projectId: g.projectId,
      projectNumber: g.projectNumber,
      sourceId: `dset:${g.projectId}:${g.setName}`,
      raw: {
        drawing_set_name: g.setName,
        project_id: g.projectId,
        sheet_count: total,
        due_date: effectiveDue,
        sheets: g.sheets,
      },
    });
  }

  // Orphans come through as individual sheet items.
  return [...out, ...orphans];
}

/**
 * Aggregate SOVItem rows into pay-app-level groups by (project_id, application_number).
 * Each group exposes the latest period_to and totals.
 *
 * Currency math is rounded to cents per line (before accumulating) AND at
 * the end of accumulation. IEEE-754 float drift across 40–50 line items can
 * otherwise push a pay-app total off by a few cents from the row-by-row
 * display, which is enough to trip the mismatch-variance alarms downstream.
 * roundCurrency is `Math.round(n * 100) / 100`.
 */
import { roundCurrency } from "@/components/shared/formatters";

function aggregateSOVByApp(sovItems) {
  const map = new Map();
  for (const s of sovItems) {
    if (!s.application_number) continue;
    const key = `${s.project_id}|${s.application_number}`;
    if (!map.has(key)) {
      map.set(key, {
        application_number: s.application_number,
        project_id: s.project_id,
        period_to: s.period_to || null,
        totalScheduled: 0,
        totalBilled: 0,
        items: [],
      });
    }
    const group = map.get(key);
    const scheduled = roundCurrency(s.scheduled_value);
    const pct = Number(s.current_percent_complete) || 0;
    const billedForLine = roundCurrency(scheduled * (pct / 100));
    group.totalScheduled = roundCurrency(group.totalScheduled + scheduled);
    group.totalBilled    = roundCurrency(group.totalBilled + billedForLine);
    // Keep latest period_to
    if (s.period_to && (!group.period_to || s.period_to > group.period_to)) {
      group.period_to = s.period_to;
    }
    group.items.push(s);
  }
  return [...map.values()];
}

/**
 * Build the unified feed from all entity arrays.
 *
 * @param {Object} entities — keyed by entity type
 * @param {Object} projectMap — { [project_id]: { project_number, name, gc_name } }
 * @returns {Array} feed items (non-null urgency results)
 */
export function buildFeed(entities, projectMap = {}) {
  const {
    rfis = [],
    drawings = [],
    drawingSets = [],
    changeOrders = [],
    deliveries = [],
    workPackages = [],
    sovItems = [],
    productionNotes = [],
    scheduleTasks = [],
  } = entities;

  const feed = [];

  // RFIs
  for (const r of rfis) {
    const item = rfiUrgency(r, projectMap);
    if (item) feed.push(item);
  }

  // Drawings — collapse to set level so a 40-sheet IFC set reads as one
  // row ("Structural IFC Set 2 — 3 of 40 past due") instead of 40 rows.
  // Orphan sheets (no drawing_set_name) still come through individually.
  for (const item of aggregateDrawingsBySet(drawings, projectMap)) {
    feed.push(item);
  }

  // Drawing Sets (set-level submittals)
  for (const ds of drawingSets) {
    const item = drawingSetUrgency(ds, projectMap);
    if (item) feed.push(item);
  }

  // Change Orders
  for (const co of changeOrders) {
    const item = changeOrderUrgency(co, projectMap);
    if (item) feed.push(item);
  }

  // Deliveries
  for (const del of deliveries) {
    const item = deliveryUrgency(del, projectMap);
    if (item) feed.push(item);
  }

  // Work Packages
  for (const wp of workPackages) {
    const item = workPackageUrgency(wp, projectMap);
    if (item) feed.push(item);
  }

  // SOV / Pay Apps (aggregated)
  const sovGroups = aggregateSOVByApp(sovItems);
  for (const group of sovGroups) {
    const item = sovUrgency(group, projectMap);
    if (item) feed.push(item);
  }

  // Production Notes
  for (const note of productionNotes) {
    const item = productionNoteUrgency(note, projectMap);
    if (item) feed.push(item);
  }

  // Schedule Tasks — every non-complete task within the urgency engine's
  // horizon shows up so Installation, Fabrication, Detailing rows appear
  // in the 48h / 10d windows and the main feed. Gated inside
  // scheduleTaskUrgency itself (horizon + status check) so we don't
  // flood the feed with far-future tasks.
  for (const t of scheduleTasks) {
    const item = scheduleTaskUrgency(t, projectMap);
    if (item) feed.push(item);
  }

  return feed;
}

/**
 * Compute urgency summary counts from a feed array.
 */
export function computeSummary(feed) {
  const summary = {
    overdue: 0,
    dueThisWeek: 0,
    blocking: 0,
    awaiting: 0,
    totalOpen: feed.length,
  };

  for (const item of feed) {
    switch (item.urgency) {
      case "overdue":
        summary.overdue++;
        break;
      case "due-soon":
        summary.dueThisWeek++;
        break;
      case "blocking":
        summary.blocking++;
        break;
      case "awaiting":
        summary.awaiting++;
        break;
    }
  }

  return summary;
}
