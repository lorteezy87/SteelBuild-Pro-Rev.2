/**
 * viewerSelection.js — pure helpers behind the 3D viewer's piece-tracking UI:
 * find-by-mark, the Fab legend with live counts, and a synchronous summary of
 * the current selection (marks, lifecycle mix, and which Piece Control logistics
 * action — ship / deliver / erect — is legal for the whole selection).
 *
 * No three.js, no React, no Supabase: everything here derives from the roster
 * rows (model_elements) and canonical pieces the tab already has in memory, so
 * the selection panel never waits on a web-ifc property parse.
 */
import { normalizePieceMark } from "@/services/modelElementStatus";
import { FAB_STATUS_META, FAB_STATUS_ORDER } from "@/lib/fabStatus";
import { CANONICAL_PIECE_COLORS } from "@/lib/ifc/viewerColoring";
import {
  logisticsDisabledReason,
  pieceLifecycleLabel,
} from "@/lib/pieceControl/lifecycle";

/** Logistics actions in shop → field order, with the label the button shows. */
export const LOGISTICS_ACTIONS = [
  { action: "ship", label: "Ship" },
  { action: "deliver", label: "Deliver" },
  { action: "erect", label: "Erect" },
];

/** GlobalId → roster row, for parts the roster knows by GUID. */
export function buildRowsByGuid(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (r?.element_guid && !r.is_deleted) map.set(String(r.element_guid), r);
  }
  return map;
}

/**
 * Find the rendered parts whose piece mark matches `query`.
 * Exact mark first; if nothing matches exactly, fall back to prefix, then
 * contains — so "1B" finds 1B1, 1B2… and "C12" finds every C12x column.
 * Returns the matched GUIDs plus the distinct marks they belong to.
 */
export function findGuidsByMark(query, markByGuid) {
  const q = normalizePieceMark(query);
  const empty = { query: q, guids: [], marks: [], matchKind: "none" };
  if (!q || !markByGuid || markByGuid.size === 0) return empty;

  const collect = (pred) => {
    const guids = [];
    const marks = new Set();
    for (const [guid, mark] of markByGuid) {
      if (mark && pred(mark)) {
        guids.push(guid);
        marks.add(mark);
      }
    }
    return { guids, marks: [...marks].sort(markCompare) };
  };

  const exact = collect((m) => m === q);
  if (exact.guids.length) return { query: q, ...exact, matchKind: "exact" };
  const prefix = collect((m) => m.startsWith(q));
  if (prefix.guids.length) return { query: q, ...prefix, matchKind: "prefix" };
  const contains = collect((m) => m.includes(q));
  if (contains.guids.length) return { query: q, ...contains, matchKind: "contains" };
  return empty;
}

/** Natural sort so 1B2 < 1B10 (localeCompare numeric). */
export function markCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Legend buckets for Fab mode: hold first, then lifecycle order, then unlinked. */
export const FAB_LEGEND_META = {
  hold: { label: "On Hold", color: CANONICAL_PIECE_COLORS.hold },
  ...Object.fromEntries(
    FAB_STATUS_ORDER.map((k) => [k, { label: FAB_STATUS_META[k].label, color: FAB_STATUS_META[k].color }]),
  ),
  unlinked: { label: "Unlinked / no status", color: null },
};
export const FAB_LEGEND_ORDER = ["hold", ...FAB_STATUS_ORDER, "unlinked"];

/**
 * Bucket every rendered part (roster row with a GUID) the same way the Fab
 * color function paints it: canonical piece (hold → lifecycle) wins, then the
 * legacy per-part fab_status, else "unlinked". Returns the legend rows with
 * counts and the GUIDs behind each — the tab uses those for click-to-isolate.
 */
export function buildFabLegend({ rows, canonicalPieceByGuid, fabByGuid } = {}) {
  const guidsByBucket = new Map(FAB_LEGEND_ORDER.map((k) => [k, []]));
  for (const r of rows || []) {
    const guid = r?.element_guid;
    if (!guid || r.is_deleted) continue;
    const piece = canonicalPieceByGuid?.get(guid);
    let bucket;
    if (piece) bucket = piece.on_hold ? "hold" : piece.lifecycle_status;
    else bucket = fabByGuid?.get(guid) ?? null;
    if (!bucket || !guidsByBucket.has(bucket)) bucket = "unlinked";
    guidsByBucket.get(bucket).push(String(guid));
  }
  return FAB_LEGEND_ORDER.map((key) => ({
    key,
    ...FAB_LEGEND_META[key],
    count: guidsByBucket.get(key).length,
    guids: guidsByBucket.get(key),
  }));
}

/**
 * Synchronous summary of a set of selected GUIDs for the side panel.
 * Everything comes from maps the tab already holds, so it renders instantly
 * (the async web-ifc pickInfo only enriches the single-part detail rows).
 */
export function summarizeSelection(
  guids,
  { markByGuid, seqByGuid, canonicalPieceByGuid, rowsByGuid } = {},
) {
  const list = [...new Set((guids || []).filter(Boolean))];
  const marks = new Set();
  const sequences = new Set();
  const piecesById = new Map();
  let linkedCount = 0;
  let unlinkedCount = 0;

  for (const guid of list) {
    const row = rowsByGuid?.get(guid);
    const mark = markByGuid?.get(guid) ?? normalizePieceMark(row?.piece_mark);
    if (mark) marks.add(mark);
    const seq = seqByGuid?.get(guid) ?? (row?.sequence_number != null ? String(row.sequence_number) : null);
    if (seq) sequences.add(seq);
    const piece = canonicalPieceByGuid?.get(guid);
    if (piece) {
      linkedCount += 1;
      if (!piecesById.has(piece.id)) piecesById.set(piece.id, piece);
    } else {
      unlinkedCount += 1;
    }
  }

  const pieces = [...piecesById.values()];
  const lifecycleCounts = new Map();
  let holdCount = 0;
  for (const p of pieces) {
    if (p.on_hold) holdCount += 1;
    const k = p.lifecycle_status || "unknown";
    lifecycleCounts.set(k, (lifecycleCounts.get(k) || 0) + 1);
  }
  const lifecycle = [...lifecycleCounts.entries()]
    .sort((a, b) => lifecycleIndex(a[0]) - lifecycleIndex(b[0]))
    .map(([key, count]) => ({ key, label: pieceLifecycleLabel(key), count }));

  const pieceIds = pieces.map((p) => p.id);
  const actions = LOGISTICS_ACTIONS.map(({ action, label }) => {
    if (!pieces.length) {
      return { action, label, enabled: false, reason: "No linked pieces in the selection.", pieceIds: [] };
    }
    let reason = null;
    for (const p of pieces) {
      reason = logisticsDisabledReason(
        {
          lifecycle_status: p.lifecycle_status,
          on_hold: !!p.on_hold,
          is_container: !!p.is_container,
          is_deleted: !!p.is_deleted,
          deleted_at: p.deleted_at ?? null,
        },
        action,
      );
      if (reason) break;
    }
    return { action, label, enabled: !reason, reason, pieceIds: reason ? [] : pieceIds };
  });

  return {
    count: list.length,
    guids: list,
    marks: [...marks].sort(markCompare),
    sequences: [...sequences].sort(markCompare),
    pieces,
    pieceIds,
    linkedCount,
    unlinkedCount,
    holdCount,
    lifecycle,
    actions,
  };
}

function lifecycleIndex(key) {
  const i = FAB_STATUS_ORDER.indexOf(key);
  return i === -1 ? FAB_STATUS_ORDER.length : i;
}

/** Short one-liner for the toolbar / HUD, e.g. "12 parts · 3 marks · 2 on hold". */
export function describeSelection(summary) {
  if (!summary || !summary.count) return "";
  const parts = [`${summary.count.toLocaleString()} part${summary.count === 1 ? "" : "s"}`];
  if (summary.marks.length) parts.push(`${summary.marks.length} mark${summary.marks.length === 1 ? "" : "s"}`);
  if (summary.holdCount) parts.push(`${summary.holdCount} on hold`);
  return parts.join(" · ");
}
