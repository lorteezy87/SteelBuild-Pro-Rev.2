import { supabase } from "@/lib/supabase";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { Database } from "@/types/supabase";

type Revision = Database["public"]["Tables"]["drawing_revisions"]["Row"];
type RevisionInsert = Database["public"]["Tables"]["drawing_revisions"]["Insert"];
type RegisterIdentity = Pick<DrawingRegisterRow, "drawing_id" | "project_id">;

/** Existing revision snapshots must never be repaired by a tracking action. */
async function readCurrentRevision(projectId: string, drawingId: string): Promise<Revision | null> {
  // eslint-disable-next-line no-restricted-syntax -- Unique current row for one project/drawing; maybeSingle rejects ambiguity.
  const { data, error } = await supabase.from("drawing_revisions").select("*")
    .eq("project_id", projectId).eq("drawing_id", drawingId)
    .eq("is_current", true).is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (data && (data.project_id !== projectId || data.drawing_id !== drawingId ||
      !data.is_current || data.archived_at !== null)) {
    throw new Error("The current revision no longer matches this sheet. Reload the register.");
  }
  return data;
}

/**
 * Seed tracking only from an authorized sheet's recorded source metadata.
 * Register projections do not contain that source and cannot supply a revision code.
 * This records a received revision; it neither reviews the PDF nor attests approval.
 * Parent reads and insertion are not atomic against a simultaneous sheet replacement.
 */
export async function provisionRegisterRevision({ row, projectId, userId }: {
  row: RegisterIdentity;
  projectId: string | null;
  userId: string | null;
}): Promise<Revision & { __provisioned?: true }> {
  if (!projectId || !row.drawing_id || row.project_id !== projectId) {
    throw new Error("This sheet does not match the active project. Reload the register.");
  }
  const existing = await readCurrentRevision(projectId, row.drawing_id);
  if (existing) return existing;

  // eslint-disable-next-line no-restricted-syntax -- One authorized parent by primary key plus project scope, never a list.
  const { data: sheet, error: sourceError } = await supabase.from("drawings")
    .select("id, project_id, revision_number, sheet_number, title, file_url, pdf_page, is_deleted, deleted_at, is_superseded")
    .eq("id", row.drawing_id).eq("project_id", projectId)
    .eq("is_deleted", false).is("deleted_at", null).maybeSingle();
  if (sourceError) throw sourceError;
  if (!sheet || sheet.id !== row.drawing_id || sheet.project_id !== projectId ||
      sheet.is_deleted !== false || sheet.deleted_at !== null || sheet.is_superseded === true) {
    throw new Error("This sheet is unavailable, archived, or no longer accessible. Reload the register.");
  }

  const missing: string[] = [];
  if (!sheet.revision_number?.trim()) missing.push("revision code");
  if (!sheet.file_url?.trim()) missing.push("source PDF");
  if (!Number.isInteger(sheet.pdf_page) || (sheet.pdf_page ?? 0) < 1) missing.push("PDF page (a positive whole number)");
  if (missing.length) {
    throw new Error(`Complete this sheet's ${missing.join(", ")} before setting up revision tracking.`);
  }

  const payload: RevisionInsert = {
    project_id: projectId,
    drawing_id: sheet.id,
    revision_code: sheet.revision_number!,
    file_url: sheet.file_url,
    pdf_page: sheet.pdf_page,
    sheet_number: sheet.sheet_number || "—",
    sheet_title: sheet.title || "Untitled",
    version_number: 1,
    is_current: true,
    release_status: "received",
    created_by: userId,
  };
  // eslint-disable-next-line no-restricted-syntax -- Insert exactly one revision and require its single returned row.
  const { data: created, error: insertError } = await supabase.from("drawing_revisions")
    .insert(payload).select().single();
  if (insertError) {
    // Another setup may win the one-current/version/code unique constraint.
    // Never update the winner, upsert history, or swallow a different failure.
    if (insertError.code === "23505") {
      const winner = await readCurrentRevision(projectId, row.drawing_id);
      if (winner) return winner;
    }
    throw insertError;
  }
  return { ...created, __provisioned: true };
}

export function rowNeedsProvisioning(row: Pick<DrawingRegisterRow, "current_revision_id">): boolean {
  return !row.current_revision_id;
}

/** Rows still needing a current revision (used by the bulk "set up tracking" action). */
export function rowsNeedingProvisioning(rows: DrawingRegisterRow[]): DrawingRegisterRow[] {
  return rows.filter(rowNeedsProvisioning);
}
