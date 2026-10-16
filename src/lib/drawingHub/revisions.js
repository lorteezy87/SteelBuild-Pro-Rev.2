/** Read authorized current history; source changes belong to reviewed atomic commands. */
import { supabase } from "@/lib/supabase";

export async function ensureCurrentRevision({ drawing }) {
  if (!drawing?.id || !drawing?.project_id) {
    throw new Error("ensureCurrentRevision: drawing must include id + project_id");
  }
  const { data: existing, error } = await supabase.from("drawing_revisions")
    .select("*").eq("project_id", drawing.project_id).eq("drawing_id", drawing.id)
    .eq("is_current", true).is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (!existing) throw new Error("Revision tracking required. Use the reviewed drawing upload workflow; opening this PDF cannot create history.");
  if (existing.project_id !== drawing.project_id || existing.drawing_id !== drawing.id || !existing.is_current || existing.archived_at !== null) {
    throw new Error("Current revision no longer matches this sheet. Reload the drawing.");
  }
  return existing;
}

export function mapClonedZonesBySource(sourceZones, newZones) {
  const byParent = new Map();
  for (const nz of newZones || []) {
    if (nz?.parent_zone_id) byParent.set(nz.parent_zone_id, nz);
  }
  const idMap = new Map();
  for (const src of sourceZones || []) {
    const clone = byParent.get(src.id);
    if (!clone) {
      throw new Error(`carryZonesForward: cloned zone for source ${src.id} not found in insert result`);
    }
    idMap.set(src.id, clone);
  }
  return idMap;
}


export async function carryZonesForward() {
  throw new Error("Revision carry-forward is held. Use the reviewed Revision Upload workflow.");
}
export async function createNewRevisionAndCarryZones() {
  throw new Error("Manual revision creation is held. Use the reviewed Revision Upload workflow.");
}
export async function recordSheetSlipSheet() {
  throw new Error("Split slip-sheet writes are held. Use the reviewed Revision Upload workflow.");
}
