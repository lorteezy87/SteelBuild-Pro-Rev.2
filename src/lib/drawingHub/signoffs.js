/**
 * drawingHub/signoffs.js — Sign-off stamps on drawing revisions (migration 072).
 *
 * Sign-offs are formal review marks: "approved for fabrication", "approved
 * as noted", "revise and resubmit", etc. A sign-off is append-only — to
 * "remove" one, you call voidSignoff() which flips is_voided=true and
 * records voided_at/voided_by/voided_reason. The original row is never
 * deleted, so the revision's audit history is durable.
 *
 * V1 records metadata only: stamp_type, notes, stamped_by, optional pdf
 * geometry (page + bbox). The viewer renders these as colored chips in a
 * side panel. V2 will use the geometry to drop a stamp on the PDF
 * canvas itself.
 */

import { supabase } from "@/lib/supabase";

const VALID_STAMP_TYPES = [
  "approved_for_fabrication",
  "approved_as_noted",
  "revise_and_resubmit",
  "rejected",
  "reviewed",
  "for_information_only",
  "void",
];

/**
 * List sign-offs for a drawing or specific revision, newest first.
 * Voided rows are excluded by default.
 *
 * Args:
 *   drawingId         (optional)
 *   drawingRevisionId (optional) — if both passed, revision wins
 *   includeVoided     (default false)
 *
 * Returns: drawing_signoffs row[]
 */
export async function listSignoffs({
  drawingId,
  drawingRevisionId,
  includeVoided = false,
} = {}) {
  if (!drawingId && !drawingRevisionId) {
    throw new Error("listSignoffs: drawingId or drawingRevisionId required");
  }
  let query = supabase
    .from("drawing_signoffs")
    .select("*")
    .order("stamped_at", { ascending: false });
  if (drawingRevisionId) {
    query = query.eq("drawing_revision_id", drawingRevisionId);
  } else {
    query = query.eq("drawing_id", drawingId);
  }
  if (!includeVoided) {
    query = query.eq("is_voided", false);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Create a sign-off. The current Supabase session user is recorded as
 * stamped_by_id; pass `stampedByName` for a friendly display string
 * (we don't lazy-fetch the auth.user record on every render).
 *
 * Geometry (pdfPage, x, y, width, height, rotationDeg) is optional. When
 * present, x / y / width / height are normalised PDF coords in [0,1].
 */
export async function createSignoff({
  projectId,
  drawingId,
  drawingRevisionId,
  stampType,
  pdfPage = null,
  x = null,
  y = null,
  width = null,
  height = null,
  rotationDeg = 0,
  notes = null,
  signatureUrl = null,
  metadata = {},
  stampedByName = null,
} = {}) {
  if (!projectId)         throw new Error("createSignoff: projectId required");
  if (!drawingId)         throw new Error("createSignoff: drawingId required");
  if (!drawingRevisionId) throw new Error("createSignoff: drawingRevisionId required");
  if (!VALID_STAMP_TYPES.includes(stampType)) {
    throw new Error(
      `createSignoff: stampType "${stampType}" not one of ${VALID_STAMP_TYPES.join(", ")}`
    );
  }

  // Pull current user for stamped_by_id; tolerant if not signed in
  // (RLS will reject the insert anyway, so this is best-effort).
  const { data: { user } } = await supabase.auth.getUser();

  const payload = {
    project_id:          projectId,
    drawing_id:          drawingId,
    drawing_revision_id: drawingRevisionId,
    stamp_type:          stampType,
    pdf_page:            pdfPage,
    x, y, width, height,
    rotation_deg:        rotationDeg,
    stamped_by_id:       user?.id || null,
    stamped_by_name:     stampedByName
                         || user?.user_metadata?.full_name
                         || user?.email?.split("@")[0]
                         || null,
    notes:               notes ? String(notes).slice(0, 4000) : null,
    signature_url:       signatureUrl,
    metadata:            metadata || {},
  };

  const { data, error } = await supabase
    .from("drawing_signoffs")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Void an existing sign-off. Idempotent — voiding an already-voided row
 * just refreshes voided_at/voided_reason.
 */
export async function voidSignoff({ id, reason = null } = {}) {
  if (!id) throw new Error("voidSignoff: id required");
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("drawing_signoffs")
    .update({
      is_voided:     true,
      voided_at:     new Date().toISOString(),
      voided_by:     user?.id || null,
      voided_reason: reason ? String(reason).slice(0, 2000) : null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export const SIGNOFF_STAMP_TYPES = VALID_STAMP_TYPES;
