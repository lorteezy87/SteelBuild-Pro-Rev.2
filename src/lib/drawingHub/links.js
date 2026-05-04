/**
 * drawingHub/links.js — CRUD + hydration for drawing_links rows.
 *
 * Extracted from src/lib/drawingHub.js. Behavior + Supabase calls are
 * byte-identical to the original. _linkFindingsToZone (private helper
 * used by proposal accept/merge) lives in drawingHub/proposals.js
 * because it's only called from there — keeps this module focused.
 */

import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { LINKABLE_TYPES } from "./constants";

/**
 * List active links for one or more zones. Batches so the viewer can
 * fetch link counts for every visible zone in a single round trip.
 *
 * Returns: Map<zone_id, link_row[]>
 */
export async function listLinksForZones(zoneIds) {
  if (!zoneIds || zoneIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("drawing_links")
    .select("*")
    .in("drawing_zone_id", zoneIds)
    .is("removed_at", null);
  if (error) throw error;
  const byZone = new Map();
  for (const row of data || []) {
    if (!byZone.has(row.drawing_zone_id)) byZone.set(row.drawing_zone_id, []);
    byZone.get(row.drawing_zone_id).push(row);
  }
  return byZone;
}

/**
 * Create a link from a zone to a record in one of the whitelisted
 * tables. The DB trigger validate_drawing_link_target() enforces the
 * referenced record exists and belongs to the same project; we let
 * those errors surface verbatim so the UI can tell the user exactly
 * what went wrong ("RFI not found in this project", etc.).
 */
export async function createLink({
  projectId, zone, recordType, recordId, userId,
  linkRole = "related",
  linkSource = "manual",
  confidenceScore = null,
  isConfirmed = true,
  metadata = {},
}) {
  if (!projectId || !zone?.id || !zone?.drawing_id || !zone?.drawing_revision_id) {
    throw new Error("createLink: projectId + full zone record required");
  }
  if (!LINKABLE_TYPES.includes(recordType)) {
    throw new Error(`createLink: recordType "${recordType}" not in LINKABLE_TYPES`);
  }
  if (!recordId) throw new Error("createLink: recordId required");

  const payload = {
    project_id:            projectId,
    drawing_zone_id:       zone.id,
    drawing_id:            zone.drawing_id,
    drawing_revision_id:   zone.drawing_revision_id,
    linked_record_type:    recordType,
    linked_record_id:      recordId,
    link_role:             linkRole,
    link_source:           linkSource,
    confidence_score:      confidenceScore,
    is_confirmed:          isConfirmed,
    confirmed_by:          isConfirmed ? (userId || null) : null,
    confirmed_at:          isConfirmed ? new Date().toISOString() : null,
    metadata,
    created_by:            userId || null,
  };
  const { data, error } = await supabase
    .from("drawing_links")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Soft-delete a link (sets removed_at / removed_by). */
export async function removeLink({ linkId, userId }) {
  if (!linkId) throw new Error("removeLink: linkId required");
  const { error } = await supabase
    .from("drawing_links")
    .update({ removed_at: new Date().toISOString(), removed_by: userId || null })
    .eq("id", linkId);
  if (error) throw error;
  return { id: linkId };
}

/**
 * Batch-fetch the actual linked records (RFIs, work packages, etc.)
 * so the right-side panel can render them without N separate queries.
 *
 * Strategy: group the link rows by linked_record_type, one query per
 * type via `in (...ids)`. Returns a nested map:
 *   Map<linkId, { link, record }>
 *
 * When a record is missing (e.g. soft-deleted on the source table),
 * we still return the link with record:null so the UI can flag
 * "orphaned link".
 */
const TYPE_TO_ENTITY = {
  rfi:          { table: "rfis",             accessor: base44.entities.RFI },
  work_package: { table: "work_packages",    accessor: base44.entities.WorkPackage },
  delivery:     { table: "deliveries",       accessor: base44.entities.Delivery },
  photo:        { table: "documents",        accessor: base44.entities.Document },
  inspection:   { table: "inspections",      accessor: base44.entities.Inspection },
  daily_log:    { table: "daily_logs",       accessor: base44.entities.DailyLog },
  document:     { table: "documents",        accessor: base44.entities.Document },
  change_order: { table: "change_orders",    accessor: base44.entities.ChangeOrder },
  submittal:    { table: "documents",        accessor: base44.entities.Document },
  drawing:      { table: "drawings",         accessor: base44.entities.Drawing },
  finding:      { table: "drawing_findings", accessor: null },
};

export async function hydrateLinks(links) {
  if (!links || links.length === 0) return new Map();
  const byType = new Map();
  for (const l of links) {
    if (!byType.has(l.linked_record_type)) byType.set(l.linked_record_type, []);
    byType.get(l.linked_record_type).push(l);
  }
  const out = new Map();
  for (const [type, group] of byType.entries()) {
    const entry = TYPE_TO_ENTITY[type];
    if (!entry) {
      // Unknown type — surface the link with no record rather than crash.
      for (const l of group) out.set(l.id, { link: l, record: null });
      continue;
    }
    const ids = [...new Set(group.map((l) => l.linked_record_id))];
    // Fetch in one go per type — supabase filter(in) with a sane batch.
    const { data, error } = await supabase
      .from(entry.table)
      .select("*")
      .in("id", ids);
    if (error) throw error;
    const byId = new Map((data || []).map((r) => [r.id, r]));
    for (const l of group) {
      out.set(l.id, { link: l, record: byId.get(l.linked_record_id) || null });
    }
  }
  return out;
}

/**
 * Summarise a zone's links into counts by type — used for the hover
 * tooltip and the badge chip on the overlay rectangle.
 *
 * Returns: { total, byType: { rfi: 2, work_package: 1, ... } }
 */
export function summarizeLinks(links) {
  const out = { total: 0, byType: {} };
  if (!links) return out;
  for (const l of links) {
    if (l.removed_at) continue;
    out.total += 1;
    out.byType[l.linked_record_type] = (out.byType[l.linked_record_type] || 0) + 1;
  }
  return out;
}
