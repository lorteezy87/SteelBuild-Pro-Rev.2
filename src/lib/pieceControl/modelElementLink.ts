/**
 * Client-side lot-aware mark matching (mirrors link_model_elements_to_pieces).
 * The DB RPC is authoritative when present; this module falls back to the same
 * matching rules when the hosted schema is missing the function (migration lag).
 *
 * Also hosts pure helpers for 3D Sync UX: link-health counts and GUID CSV export
 * so operators never need the SQL editor for day-to-day sync checks.
 */

import { supabase } from "@/lib/supabase";
import {
  isMissingSchemaObjectError,
  normalizeThrownQueryError,
} from "@/lib/postgrestErrors";

export interface LinkCandidatePiece {
  id: string;
  normalized_piece_mark: string;
  lot_code: string;
  is_container?: boolean;
  parent_piece_id?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  work_package_id?: string | null;
  lifecycle_status?: string | null;
}

export interface LinkCandidateElement {
  id: string;
  piece_mark: string;
  metadata?: Record<string, unknown> | null;
  piece_id?: string | null;
}

export type LinkMatchResult =
  | { kind: "linked"; pieceId: string }
  | { kind: "unchanged"; pieceId: string }
  | { kind: "unmatched" }
  | { kind: "ambiguous"; count: number };

export interface LinkModelElementsSummary {
  project_id: string;
  linked: number;
  unchanged: number;
  unmatched: number;
  ambiguous: number;
  /** True when the hosted RPC was missing and the client path ran instead. */
  used_client_fallback?: boolean;
}

export interface LinkElementUpdate {
  elementId: string;
  pieceId: string;
  workPackageId: string | null;
  fabStatus: string | null;
  kind: "linked" | "unchanged";
}

/** Row shape needed for link-health / GUID export (subset of model_elements). */
export interface ModelElementLinkRow {
  id?: string;
  element_guid?: string | null;
  piece_mark?: string | null;
  piece_id?: string | null;
  fab_status?: string | null;
  is_deleted?: boolean | null;
}

export interface ModelLinkHealth {
  /** Elements with a non-empty mark and a piece_id. */
  linked: number;
  /** Elements with a non-empty mark but no piece_id. */
  unlinked: number;
  /** Elements with a non-empty mark (linked + unlinked). */
  withMark: number;
  /** Elements that have an IFC GUID. */
  withGuid: number;
}

function normalizeMark(mark: string): string {
  return String(mark ?? "").trim().toUpperCase();
}

function isActionableLeaf(
  piece: LinkCandidatePiece,
  all: LinkCandidatePiece[],
): boolean {
  if (piece.is_deleted || piece.deleted_at) return false;
  if (piece.is_container) return false;
  const hasChild = all.some(
    (other) =>
      other.parent_piece_id === piece.id &&
      !other.is_deleted &&
      !other.deleted_at,
  );
  return !hasChild;
}

export function matchElementToPiece(
  element: LinkCandidateElement,
  pieces: LinkCandidatePiece[],
): LinkMatchResult {
  const mark = normalizeMark(element.piece_mark);
  if (!mark) return { kind: "unmatched" };

  const lotRaw = element.metadata?.lot_code;
  const lot =
    typeof lotRaw === "string" && lotRaw.trim() ? lotRaw.trim() : null;

  const leaves = pieces.filter((p) => isActionableLeaf(p, pieces));
  const matches = leaves.filter((p) => {
    if (p.normalized_piece_mark !== mark) return false;
    if (lot !== null) return p.lot_code === lot;
    return true;
  });

  if (matches.length === 0) return { kind: "unmatched" };
  if (matches.length > 1) return { kind: "ambiguous", count: matches.length };
  const pieceId = matches[0].id;
  if (element.piece_id === pieceId) return { kind: "unchanged", pieceId };
  return { kind: "linked", pieceId };
}

/**
 * Summarize how many model elements are linked to the Piece Register.
 * Pure — safe to call from React render paths.
 */
export function summarizeModelLinkHealth(
  rows: ModelElementLinkRow[] | null | undefined,
): ModelLinkHealth {
  let linked = 0;
  let unlinked = 0;
  let withMark = 0;
  let withGuid = 0;

  for (const row of rows ?? []) {
    if (row.is_deleted) continue;
    if (row.element_guid && String(row.element_guid).trim()) withGuid += 1;
    const mark = String(row.piece_mark ?? "").trim();
    if (!mark) continue;
    withMark += 1;
    if (row.piece_id) linked += 1;
    else unlinked += 1;
  }

  return { linked, unlinked, withMark, withGuid };
}

/** Build a CSV string of GUIDs + marks for download (no SQL required). */
export function buildModelGuidCsv(
  rows: ModelElementLinkRow[] | null | undefined,
): string {
  const header = [
    "element_guid",
    "piece_mark",
    "piece_id",
    "fab_status",
    "is_linked",
  ];
  const lines = [header.join(",")];

  for (const row of rows ?? []) {
    if (row.is_deleted) continue;
    const guid = String(row.element_guid ?? "").trim();
    if (!guid) continue;
    const mark = String(row.piece_mark ?? "").replace(/"/g, '""');
    const pieceId = row.piece_id ? String(row.piece_id) : "";
    const fab = String(row.fab_status ?? "").replace(/"/g, '""');
    const linked = row.piece_id ? "yes" : "no";
    lines.push(
      [
        csvCell(guid),
        csvCell(mark),
        csvCell(pieceId),
        csvCell(fab),
        linked,
      ].join(","),
    );
  }

  return lines.join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value}"`;
  return value;
}

/** Trigger a browser download of the GUID CSV. */
export function downloadModelGuidCsv(
  rows: ModelElementLinkRow[] | null | undefined,
  projectId?: string,
): void {
  const csv = buildModelGuidCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `model-guids-${projectId || "export"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Pure planner used by the client fallback (and tests). Mirrors the RPC loop.
 */
export function planModelElementLinks(
  projectId: string,
  elements: LinkCandidateElement[],
  pieces: LinkCandidatePiece[],
): { summary: LinkModelElementsSummary; updates: LinkElementUpdate[] } {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  let linked = 0;
  let unchanged = 0;
  let unmatched = 0;
  let ambiguous = 0;
  const updates: LinkElementUpdate[] = [];

  for (const element of elements) {
    if (!String(element.piece_mark ?? "").trim()) continue;
    const match = matchElementToPiece(element, pieces);
    if (match.kind === "unmatched") {
      unmatched += 1;
      continue;
    }
    if (match.kind === "ambiguous") {
      ambiguous += 1;
      continue;
    }
    const piece = byId.get(match.pieceId);
    updates.push({
      elementId: element.id,
      pieceId: match.pieceId,
      workPackageId: piece?.work_package_id ?? null,
      fabStatus: piece?.lifecycle_status ?? null,
      kind: match.kind,
    });
    if (match.kind === "linked") linked += 1;
    else unchanged += 1;
  }

  return {
    summary: {
      project_id: projectId,
      linked,
      unchanged,
      unmatched,
      ambiguous,
      used_client_fallback: true,
    },
    updates,
  };
}

async function fetchLinkCandidatePieces(
  projectId: string,
): Promise<LinkCandidatePiece[]> {
  const db = supabase as any;
  const rows: LinkCandidatePiece[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("pieces")
      .select(
        "id, normalized_piece_mark, lot_code, is_container, parent_piece_id, is_deleted, deleted_at, work_package_id, lifecycle_status",
      )
      .eq("project_id", projectId)
      .range(from, from + pageSize - 1);
    if (error) throw normalizeThrownQueryError(error);
    rows.push(...((data ?? []) as LinkCandidatePiece[]));
    if (!data || data.length < pageSize) return rows;
  }
}

async function fetchLinkCandidateElements(
  projectId: string,
): Promise<LinkCandidateElement[]> {
  const db = supabase as any;
  const rows: LinkCandidateElement[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("model_elements")
      .select("id, piece_mark, metadata, piece_id")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .range(from, from + pageSize - 1);
    if (error) throw normalizeThrownQueryError(error);
    rows.push(...((data ?? []) as LinkCandidateElement[]));
    if (!data || data.length < pageSize) return rows;
  }
}

async function linkModelElementsToPiecesViaClient(
  projectId: string,
): Promise<LinkModelElementsSummary> {
  const [pieces, elements] = await Promise.all([
    fetchLinkCandidatePieces(projectId),
    fetchLinkCandidateElements(projectId),
  ]);
  const { summary, updates } = planModelElementLinks(projectId, elements, pieces);
  const db = supabase as any;

  for (const update of updates) {
    const { error } = await db
      .from("model_elements")
      .update({
        piece_id: update.pieceId,
        work_package_id: update.workPackageId,
        fab_status: update.fabStatus,
      })
      .eq("id", update.elementId)
      .eq("project_id", projectId);
    if (error) throw normalizeThrownQueryError(error);
  }

  return summary;
}

export async function linkModelElementsToPieces(
  projectId: string,
): Promise<LinkModelElementsSummary> {
  const db = supabase as any;
  const { data, error } = await db.rpc("link_model_elements_to_pieces", {
    p_project_id: projectId,
  });
  if (!error) {
    return data as LinkModelElementsSummary;
  }

  // Production often lags Piece Control RPC migrations (PGRST202). Fall back to
  // the same mark/lot matching rules so "Link 3D marks" still works.
  if (isMissingSchemaObjectError(error)) {
    console.warn(
      "[piece-control] link_model_elements_to_pieces RPC missing — using client fallback",
      error,
    );
    return linkModelElementsToPiecesViaClient(projectId);
  }

  throw normalizeThrownQueryError(error);
}
