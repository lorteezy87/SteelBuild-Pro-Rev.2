/**
 * Client-side lot-aware mark matching (mirrors link_model_elements_to_pieces).
 * Used for unit tests and any pre-flight UI; the DB RPC is authoritative.
 *
 * Also hosts pure helpers for 3D Sync UX: link-health counts and GUID CSV export
 * so operators never need the SQL editor for day-to-day sync checks.
 */

import { supabase } from "@/lib/supabase";

export interface LinkCandidatePiece {
  id: string;
  normalized_piece_mark: string;
  lot_code: string;
  is_container?: boolean;
  parent_piece_id?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
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

export async function linkModelElementsToPieces(projectId: string) {
  const db = supabase as any;
  const { data, error } = await db.rpc("link_model_elements_to_pieces", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return data as {
    project_id: string;
    linked: number;
    unchanged: number;
    unmatched: number;
    ambiguous: number;
  };
}
