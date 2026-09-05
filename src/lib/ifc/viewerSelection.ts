/**
 * viewerSelection.ts — pure helpers behind the 3D viewer's piece-tracking UI:
 * find-by-mark, the Fab legend with live counts, and a synchronous summary of
 * the current selection (marks, lifecycle mix, and which Piece Control logistics
 * action — ship / deliver / erect — is legal for the whole selection).
 *
 * No three.js, no React, no Supabase: everything here derives from the roster
 * rows (model_elements) and canonical pieces the tab already has in memory, so
 * the selection panel never waits on a web-ifc property parse.
 */
import { normalizePieceMark } from "@/services/modelElementStatus";
import { FAB_STATUS_META, FAB_STATUS_ORDER, type FabStatus } from "@/lib/fabStatus";
import { CANONICAL_PIECE_COLORS } from "@/lib/ifc/viewerColoring";
import {
  logisticsDisabledReason,
  pieceLifecycleLabel,
  type LogisticsAction,
} from "@/lib/pieceControl/lifecycle";

/** Roster row subset the viewer needs (model_elements). */
export interface ViewerRosterRow {
  element_guid?: string | null;
  piece_mark?: string | null;
  sequence_number?: string | number | null;
  fab_status?: string | null;
  piece_id?: string | null;
  is_deleted?: boolean | null;
  [key: string]: unknown;
}

/** Canonical piece subset the viewer joins against. */
export interface ViewerCanonicalPiece {
  id: string;
  piece_mark?: string | null;
  lot_code?: string | null;
  lifecycle_status?: string | null;
  on_hold?: boolean | null;
  on_hold_reason?: string | null;
  is_container?: boolean | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  work_package_id?: string | null;
  [key: string]: unknown;
}

export interface LogisticsActionOption {
  action: LogisticsAction;
  label: string;
}

/** Logistics actions in shop → field order, with the label the button shows. */
export const LOGISTICS_ACTIONS: readonly LogisticsActionOption[] = [
  { action: "ship", label: "Ship" },
  { action: "deliver", label: "Deliver" },
  { action: "erect", label: "Erect" },
];

/** GlobalId → roster row, for parts the roster knows by GUID. */
export function buildRowsByGuid(rows: ViewerRosterRow[] | null | undefined): Map<string, ViewerRosterRow> {
  const map = new Map<string, ViewerRosterRow>();
  for (const r of rows || []) {
    if (r?.element_guid && !r.is_deleted) map.set(String(r.element_guid), r);
  }
  return map;
}

export type MarkMatchKind = "none" | "exact" | "prefix" | "contains";

export interface MarkSearchResult {
  query: string;
  guids: string[];
  marks: string[];
  matchKind: MarkMatchKind;
}

/**
 * Find the rendered parts whose piece mark matches `query`.
 * Exact mark first; if nothing matches exactly, fall back to prefix, then
 * contains — so "1B" finds 1B1, 1B2… and "C12" finds every C12x column.
 * Returns the matched GUIDs plus the distinct marks they belong to.
 */
export function findGuidsByMark(
  query: string | null | undefined,
  markByGuid: Map<string, string> | null | undefined,
): MarkSearchResult {
  const q = normalizePieceMark(query);
  const empty: MarkSearchResult = { query: q, guids: [], marks: [], matchKind: "none" };
  if (!q || !markByGuid || markByGuid.size === 0) return empty;

  const collect = (pred: (mark: string) => boolean) => {
    const guids: string[] = [];
    const marks = new Set<string>();
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
export function markCompare(a: unknown, b: unknown): number {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export type FabLegendKey = "hold" | FabStatus | "unlinked";

export interface FabLegendMeta {
  label: string;
  color: string | null;
}

/** Legend buckets for Fab mode: hold first, then lifecycle order, then unlinked. */
export const FAB_LEGEND_META: Record<FabLegendKey, FabLegendMeta> = {
  hold: { label: "On Hold", color: CANONICAL_PIECE_COLORS.hold },
  ...(Object.fromEntries(
    FAB_STATUS_ORDER.map((k) => [k, { label: FAB_STATUS_META[k].label, color: FAB_STATUS_META[k].color }]),
  ) as Record<FabStatus, FabLegendMeta>),
  unlinked: { label: "Unlinked / no status", color: null },
};
export const FAB_LEGEND_ORDER: readonly FabLegendKey[] = ["hold", ...FAB_STATUS_ORDER, "unlinked"];

export interface FabLegendRow extends FabLegendMeta {
  key: FabLegendKey;
  count: number;
  guids: string[];
}

/**
 * Bucket every rendered part (roster row with a GUID) the same way the Fab
 * color function paints it: canonical piece (hold → lifecycle) wins, then the
 * legacy per-part fab_status, else "unlinked". Returns the legend rows with
 * counts and the GUIDs behind each — the tab uses those for click-to-isolate.
 */
export function buildFabLegend({
  rows,
  canonicalPieceByGuid,
  fabByGuid,
}: {
  rows?: ViewerRosterRow[] | null;
  canonicalPieceByGuid?: Map<string, ViewerCanonicalPiece> | null;
  fabByGuid?: Map<string, string> | null;
} = {}): FabLegendRow[] {
  const guidsByBucket = new Map<FabLegendKey, string[]>(
    FAB_LEGEND_ORDER.map((k): [FabLegendKey, string[]] => [k, []]),
  );
  for (const r of rows || []) {
    const guid = r?.element_guid;
    if (!guid || r.is_deleted) continue;
    const piece = canonicalPieceByGuid?.get(guid);
    let bucket: string | null | undefined;
    if (piece) bucket = piece.on_hold ? "hold" : piece.lifecycle_status;
    else bucket = fabByGuid?.get(guid) ?? null;
    const key: FabLegendKey = bucket && guidsByBucket.has(bucket as FabLegendKey) ? (bucket as FabLegendKey) : "unlinked";
    guidsByBucket.get(key)!.push(String(guid));
  }
  return FAB_LEGEND_ORDER.map((key) => ({
    key,
    ...FAB_LEGEND_META[key],
    count: guidsByBucket.get(key)!.length,
    guids: guidsByBucket.get(key)!,
  }));
}

export interface SelectionAction extends LogisticsActionOption {
  enabled: boolean;
  reason: string | null;
  pieceIds: string[];
}

export interface SelectionSummary {
  count: number;
  guids: string[];
  marks: string[];
  sequences: string[];
  pieces: ViewerCanonicalPiece[];
  pieceIds: string[];
  linkedCount: number;
  unlinkedCount: number;
  holdCount: number;
  lifecycle: Array<{ key: string; label: string; count: number }>;
  actions: SelectionAction[];
}

/**
 * Synchronous summary of a set of selected GUIDs for the side panel.
 * Everything comes from maps the tab already holds, so it renders instantly
 * (the async web-ifc pickInfo only enriches the single-part detail rows).
 */
export function summarizeSelection(
  guids: Array<string | null | undefined> | null | undefined,
  {
    markByGuid,
    seqByGuid,
    canonicalPieceByGuid,
    rowsByGuid,
  }: {
    markByGuid?: Map<string, string> | null;
    seqByGuid?: Map<string, string> | null;
    canonicalPieceByGuid?: Map<string, ViewerCanonicalPiece> | null;
    rowsByGuid?: Map<string, ViewerRosterRow> | null;
  } = {},
): SelectionSummary {
  const list = [...new Set((guids || []).filter((g): g is string => Boolean(g)))];
  const marks = new Set<string>();
  const sequences = new Set<string>();
  const piecesById = new Map<string, ViewerCanonicalPiece>();
  let linkedCount = 0;
  let unlinkedCount = 0;

  for (const guid of list) {
    const row = rowsByGuid?.get(guid);
    const mark = markByGuid?.get(guid) ?? normalizePieceMark(row?.piece_mark);
    if (mark) marks.add(mark);
    const seq =
      seqByGuid?.get(guid) ?? (row?.sequence_number != null ? String(row.sequence_number) : null);
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
  const lifecycleCounts = new Map<string, number>();
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
  const actions: SelectionAction[] = LOGISTICS_ACTIONS.map(({ action, label }) => {
    if (!pieces.length) {
      return { action, label, enabled: false, reason: "No linked pieces in the selection.", pieceIds: [] };
    }
    let reason: string | null = null;
    for (const p of pieces) {
      reason = logisticsDisabledReason(
        {
          lifecycle_status: p.lifecycle_status ?? "",
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

function lifecycleIndex(key: string): number {
  const i = (FAB_STATUS_ORDER as readonly string[]).indexOf(key);
  return i === -1 ? FAB_STATUS_ORDER.length : i;
}

/** Short one-liner for the toolbar / HUD, e.g. "12 parts · 3 marks · 2 on hold". */
export function describeSelection(summary: SelectionSummary | null | undefined): string {
  if (!summary || !summary.count) return "";
  const parts = [`${summary.count.toLocaleString()} part${summary.count === 1 ? "" : "s"}`];
  if (summary.marks.length) parts.push(`${summary.marks.length} mark${summary.marks.length === 1 ? "" : "s"}`);
  if (summary.holdCount) parts.push(`${summary.holdCount} on hold`);
  return parts.join(" · ");
}
