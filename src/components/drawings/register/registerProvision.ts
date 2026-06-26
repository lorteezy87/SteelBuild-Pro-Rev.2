/**
 * registerProvision — pure helpers for the Drawing Register's
 * "provision a current revision on demand" affordance.
 *
 * Normal drawing intake does NOT create a `drawing_revisions` row, so most
 * register rows arrive with `current_revision_id == null` and the per-row
 * Release control is dead. These helpers decide which rows need provisioning
 * and map a register row onto the `drawing` shape that
 * `ensureCurrentRevision({ drawing, userId })` expects (it throws unless the
 * object carries at least `id` + `project_id`).
 */
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";

/** The minimal `drawing` shape ensureCurrentRevision reads. */
export interface ProvisionDrawing {
  id: string;
  project_id: string;
  revision: string | null;
  sheet_number: string | null;
  sheet_title: string | null;
  /** Register-derived rows carry no file refs; the v1 revision is seeded null. */
  file_url: null;
  pdf_page: null;
}

/**
 * True when the row has no tracked current revision yet, so its Release
 * control would be permanently disabled until one is provisioned.
 */
export function rowNeedsProvisioning(row: Pick<DrawingRegisterRow, "current_revision_id">): boolean {
  return !row.current_revision_id;
}

/**
 * Map a register row onto the `drawing` object ensureCurrentRevision needs.
 * Returns null when the row lacks the required identity (`project_id`) — the
 * caller should skip provisioning rather than let the provisioner throw.
 */
export function registerRowToDrawing(row: DrawingRegisterRow): ProvisionDrawing | null {
  if (!row.drawing_id || !row.project_id) return null;
  return {
    id:           row.drawing_id,
    project_id:   row.project_id,
    revision:     row.current_revision ?? null,
    sheet_number: row.sheet_number ?? null,
    sheet_title:  row.sheet_title ?? null,
    file_url:     null,
    pdf_page:     null,
  };
}

/** Rows still needing a current revision (used by the bulk "set up tracking" action). */
export function rowsNeedingProvisioning(rows: DrawingRegisterRow[]): DrawingRegisterRow[] {
  return rows.filter(rowNeedsProvisioning);
}
