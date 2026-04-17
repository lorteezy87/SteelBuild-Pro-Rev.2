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
} from "./urgencyEngine";

/**
 * Aggregate SOVItem rows into pay-app-level groups by (project_id, application_number).
 * Each group exposes the latest period_to and totals.
 */
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
    group.totalScheduled += Number(s.scheduled_value) || 0;
    const pct = Number(s.current_percent_complete) || 0;
    group.totalBilled += (Number(s.scheduled_value) || 0) * (pct / 100);
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
  } = entities;

  const feed = [];

  // RFIs
  for (const r of rfis) {
    const item = rfiUrgency(r, projectMap);
    if (item) feed.push(item);
  }

  // Drawings (sheet-level)
  for (const d of drawings) {
    const item = drawingUrgency(d, projectMap);
    if (item) feed.push(item);
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
