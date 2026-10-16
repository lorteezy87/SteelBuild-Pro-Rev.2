import { supabase } from "@/lib/supabase";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { Database } from "@/types/supabase";

type Revision = Database["public"]["Tables"]["drawing_revisions"]["Row"];
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

/** Compatibility entry point: tracking setup is held; existing history remains readable. */
export async function provisionRegisterRevision({ row, projectId }: {
  row: RegisterIdentity;
  projectId: string | null;
  userId: string | null;
}): Promise<Revision & { __provisioned?: true }> {
  if (!projectId || !row.drawing_id || row.project_id !== projectId) {
    throw new Error("This sheet does not match the active project. Reload the register.");
  }
  const existing = await readCurrentRevision(projectId, row.drawing_id);
  if (existing) return existing;
  throw new Error("Revision tracking required. Use the reviewed drawing upload workflow; automatic setup is held.");
}

export function rowNeedsProvisioning(row: Pick<DrawingRegisterRow, "current_revision_id">): boolean {
  return !row.current_revision_id;
}

/** Rows still needing a current revision (used by the bulk "set up tracking" action). */
export function rowsNeedingProvisioning(rows: DrawingRegisterRow[]): DrawingRegisterRow[] {
  return rows.filter(rowNeedsProvisioning);
}
