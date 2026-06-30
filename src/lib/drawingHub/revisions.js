/**
 * drawingHub/revisions.js — Revision lifecycle for drawing_revisions.
 *
 * Extracted from src/lib/drawingHub.js. Behavior + Supabase calls are
 * byte-identical to the original.
 *
 * Covers:
 *   - ensureCurrentRevision: idempotent fetch-or-create of the
 *     "current" revision for a drawing.
 *   - carryZonesForward: clone zones (+ optionally links) from one
 *     revision onto another.
 *   - createNewRevisionAndCarryZones: mint a new revision, flip the
 *     "current" pointer, and pull the previous revision's zones over.
 */

import { supabase } from "@/lib/supabase";

/**
 * Return (or create) the "current" revision for a drawing. MVP users
 * don't manage revisions explicitly yet, so when the viewer first
 * wants to attach a zone we transparently provision a v1 revision
 * using the drawing's own sheet metadata.
 */
export async function ensureCurrentRevision({ drawing, userId }) {
  if (!drawing?.id || !drawing?.project_id) {
    throw new Error("ensureCurrentRevision: drawing must include id + project_id");
  }
  // Try the fast path first.
  const { data: existing, error: selErr } = await supabase
    .from("drawing_revisions")
    .select("*")
    .eq("drawing_id", drawing.id)
    .eq("is_current", true)
    .maybeSingle();
  if (selErr && selErr.code !== "PGRST116") throw selErr;
  if (existing) return existing;

  // None yet — mint a v1 revision. revision_code = "v1" is an internal
  // placeholder; once the user uploads a new rev they'll supersede it.
  // file_url/pdf_page snapshot the sheet's CURRENT file so the revision
  // stays openable/comparable after a later slip-sheet overwrites the
  // drawings row in place.
  const payload = {
    project_id:     drawing.project_id,
    drawing_id:     drawing.id,
    revision_code:  drawing.revision || drawing.revision_number || "v1",
    revision_name:  drawing.revision_name || null,
    sheet_number:   drawing.sheet_number || drawing.drawing_number || "—",
    sheet_title:    drawing.title || drawing.sheet_title || "Untitled",
    version_number: 1,
    is_current:     true,
    file_url:       drawing.file_url || null,
    pdf_page:       drawing.pdf_page ?? null,
    created_by:     userId || null,
  };
  const { data: created, error: insErr } = await supabase
    .from("drawing_revisions")
    .insert(payload)
    .select()
    .single();
  if (insErr) throw insErr;
  // Flag freshly-minted revisions so callers can invalidate the register / hub
  // revision caches ONLY when a row was actually created. The found-existing
  // path above returns the row without this flag → no needless invalidation.
  return { ...created, __provisioned: true };
}

// ────────────────────────────────────────────────────────────────────
// Revision carry-forward (V1.5)
//
// When a drawing gets a new revision (Rev A → Rev B), we want the
// zones + their linked records to survive the version bump rather
// than disappearing. carryZonesForward clones every active zone
// from one revision onto another, preserving geometry + label +
// status, and optionally clones the live drawing_links onto each
// cloned zone so coordination work carries over.
//
// Zone keys are preserved — Z-001 on Rev A becomes Z-001 on Rev B —
// because the unique index on drawing_zones is (drawing_revision_id,
// zone_key), not (drawing_id, zone_key). Users recognise the zone
// they just drew last week at the same label.
//
// Links are cloned with link_source = 'inherited' so the audit trail
// can distinguish carried-over links from ones that were manually
// created against the new revision.
// ────────────────────────────────────────────────────────────────────

export async function carryZonesForward({
  fromRevisionId,
  toRevisionId,
  userId,
  includeLinks = true,
}) {
  if (!fromRevisionId || !toRevisionId) {
    throw new Error("carryZonesForward: fromRevisionId + toRevisionId required");
  }
  // Load source zones + their target revision so we can stamp project
  // + drawing ids on the clones without trusting the caller.
  const [{ data: sourceZones, error: srcErr }, { data: toRev, error: toErr }] = await Promise.all([
    supabase.from("drawing_zones").select("*").eq("drawing_revision_id", fromRevisionId).eq("is_active", true).is("deleted_at", null),
    supabase.from("drawing_revisions").select("*").eq("id", toRevisionId).single(),
  ]);
  if (srcErr) throw srcErr;
  if (toErr)  throw toErr;
  if (!toRev) throw new Error("carryZonesForward: target revision not found");
  if (!sourceZones || sourceZones.length === 0) {
    return { zonesCloned: 0, linksCloned: 0 };
  }

  // Insert cloned zones in a single round trip. We preserve the
  // bbox + metadata but drop any manual status-override so the rule
  // engine recomputes on the new revision — carried zones start
  // fresh, not pinned to yesterday's answer.
  const zonePayload = sourceZones.map((z) => ({
    project_id:           toRev.project_id,
    drawing_id:           toRev.drawing_id,
    drawing_revision_id:  toRev.id,
    parent_zone_id:       z.id, // breadcrumb back to the source rev
    zone_key:             z.zone_key,
    label:                z.label,
    description:          z.description,
    zone_type:            z.zone_type,
    shape_type:           z.shape_type,
    x_min: z.x_min, y_min: z.y_min, x_max: z.x_max, y_max: z.y_max,
    // V2: polygon vertices ride along so irregular zones survive
    // revision carry-forward. Null for rectangles — matches the
    // polygon_points shape-consistency CHECK.
    polygon_points:       z.polygon_points ?? null,
    level_ref:            z.level_ref,
    grid_ref:             z.grid_ref,
    detail_ref:           z.detail_ref,
    discipline_code:      z.discipline_code,
    sequence_ref:         z.sequence_ref,
    sort_order:           z.sort_order,
    status:               "neutral",
    status_reason:        null,
    is_manual_status_override: false,
    source_kind:          "manual",
    is_active:            true,
    created_by:           userId || null,
  }));
  const { data: newZones, error: insErr } = await supabase
    .from("drawing_zones")
    .insert(zonePayload)
    .select();
  if (insErr) throw insErr;

  // Map source zone id → new zone (by id) so we can clone links.
  const idMap = new Map();
  for (let i = 0; i < sourceZones.length; i++) {
    idMap.set(sourceZones[i].id, newZones[i]);
  }

  let linksCloned = 0;
  if (includeLinks) {
    const { data: sourceLinks, error: linkErr } = await supabase
      .from("drawing_links")
      .select("*")
      .in("drawing_zone_id", sourceZones.map((z) => z.id))
      .is("removed_at", null);
    if (linkErr) throw linkErr;
    if (sourceLinks && sourceLinks.length > 0) {
      const linkPayload = sourceLinks.map((l) => {
        const dest = idMap.get(l.drawing_zone_id);
        return {
          project_id:           toRev.project_id,
          drawing_zone_id:      dest.id,
          drawing_id:           toRev.drawing_id,
          drawing_revision_id:  toRev.id,
          linked_record_type:   l.linked_record_type,
          linked_record_id:     l.linked_record_id,
          link_role:            l.link_role,
          link_source:          "inherited",
          confidence_score:     l.confidence_score,
          is_confirmed:         l.is_confirmed,
          metadata:             { ...(l.metadata || {}), inherited_from_link_id: l.id, inherited_from_revision_id: fromRevisionId },
          created_by:           userId || null,
        };
      });
      const { error: linkInsErr } = await supabase.from("drawing_links").insert(linkPayload);
      if (linkInsErr) throw linkInsErr;
      linksCloned = linkPayload.length;
    }
  }

  return { zonesCloned: newZones.length, linksCloned };
}

/**
 * Create a brand-new revision for a drawing and carry the current
 * revision's zones (+ links by default) forward onto it. Atomic from
 * the caller's perspective even though it's three statements — if
 * carry-forward fails after the new revision is minted, the caller
 * still has a fresh revision to work with, and retrying
 * carryZonesForward is idempotent as long as the target is still empty.
 *
 * If includeLinks is false, the user ends up with empty-zone
 * clones and has to re-link; typical workflow is true.
 *
 * Optional file-snapshot fields (slip-sheeting, §21):
 *   fileUrl / pdfPage — where the NEW revision's sheet lives. Defaults to
 *     the drawing's current file refs (manual rev bumps reuse the file).
 *   issuedAt / notes  — issue date + "what changed" for the new revision.
 * The superseded revision additionally gets archived_at stamped and its
 * file_url/pdf_page backfilled from the drawing row when missing, so the
 * old PDF page stays reachable after the drawings row is overwritten.
 */
export async function createNewRevisionAndCarryZones({
  drawing,
  newCode,
  newName,
  userId,
  includeLinks = true,
  fileUrl = undefined,
  pdfPage = undefined,
  issuedAt = null,
  notes = null,
}) {
  if (!drawing?.id || !drawing?.project_id) {
    throw new Error("createNewRevisionAndCarryZones: drawing required");
  }
  if (!newCode) throw new Error("createNewRevisionAndCarryZones: newCode required");

  // Resolve the current revision (creates a v1 if none yet).
  const current = await ensureCurrentRevision({ drawing, userId });

  // Confirm the new code is actually new for this drawing.
  const { data: clash } = await supabase
    .from("drawing_revisions")
    .select("id")
    .eq("drawing_id", drawing.id)
    .eq("revision_code", newCode)
    .maybeSingle();
  if (clash) throw new Error(`Revision "${newCode}" already exists for this drawing`);

  // Flip current off, then insert the new revision as current.
  // Done in two statements because the partial unique index
  // ux_drawing_revisions_one_current forbids two rows with is_current=true.
  // The superseded row is archived and — when it predates file snapshots —
  // backfilled with the drawing's CURRENT file refs (which are about to be
  // overwritten by the slip-sheet).
  {
    const { error } = await supabase
      .from("drawing_revisions")
      .update({
        is_current: false,
        archived_at: new Date().toISOString(),
        file_url: current.file_url || drawing.file_url || null,
        pdf_page: current.pdf_page ?? drawing.pdf_page ?? null,
        updated_by: userId || null,
      })
      .eq("id", current.id);
    if (error) throw error;
  }
  const { data: newRev, error: insErr } = await supabase
    .from("drawing_revisions")
    .insert({
      project_id:             drawing.project_id,
      drawing_id:             drawing.id,
      revision_code:          newCode,
      revision_name:          newName || null,
      sheet_number:           current.sheet_number,
      sheet_title:            current.sheet_title,
      version_number:         (current.version_number || 1) + 1,
      is_current:             true,
      supersedes_revision_id: current.id,
      file_url:               fileUrl !== undefined ? fileUrl : (drawing.file_url || null),
      pdf_page:               pdfPage !== undefined ? pdfPage : (drawing.pdf_page ?? null),
      issued_at:              issuedAt || null,
      revision_notes:         notes || null,
      created_by:             userId || null,
    })
    .select()
    .single();
  if (insErr) {
    // Roll the current flag back so we don't leave the drawing
    // without a "current" pointer.
    await supabase.from("drawing_revisions").update({ is_current: true, archived_at: null }).eq("id", current.id);
    throw insErr;
  }

  const carry = await carryZonesForward({
    fromRevisionId: current.id,
    toRevisionId:   newRev.id,
    userId,
    includeLinks,
  });

  return {
    revision: newRev,
    supersededId: current.id,
    ...carry,
  };
}

/**
 * Slip-sheet bookkeeping for one sheet during a revision upload: snapshot
 * the sheet's CURRENT state as the superseded revision and mint the new
 * revision pointing at the new master PDF (+ page). Idempotent on the
 * revision code — re-applying the same label skips instead of throwing,
 * so a re-run of the upload wizard can't corrupt history.
 *
 * Returns { revision, supersededId, zonesCloned, linksCloned } on success
 * or { skipped: true, reason } when the code already exists.
 *
 * Throws on other failures — the caller decides whether history failures
 * should block the slip-sheet itself (the upload modal does not: the
 * user-visible sheet update wins, failures surface as a warning).
 */
export async function recordSheetSlipSheet({
  drawing,
  newCode,
  newFileUrl,
  newPdfPage,
  issuedAt = null,
  notes = null,
  userId = null,
}) {
  if (!drawing?.id || !drawing?.project_id) {
    throw new Error("recordSheetSlipSheet: drawing required");
  }
  if (!newCode) throw new Error("recordSheetSlipSheet: newCode required");
  const { data: clash } = await supabase
    .from("drawing_revisions")
    .select("id")
    .eq("drawing_id", drawing.id)
    .eq("revision_code", newCode)
    .maybeSingle();
  if (clash) return { skipped: true, reason: "duplicate-code", revisionId: clash.id };

  return createNewRevisionAndCarryZones({
    drawing,
    newCode,
    newName: null,
    userId,
    includeLinks: true,
    fileUrl: newFileUrl || null,
    pdfPage: newPdfPage ?? null,
    issuedAt,
    notes,
  });
}
