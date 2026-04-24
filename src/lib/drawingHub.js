/**
 * drawingHub.js — Service layer for the drawing-centered execution
 * feature (migration `drawing_zones_mvp_slice0`).
 *
 * The Drawing Viewer is becoming an operational hub: a user can draw
 * a rectangular zone on a sheet and link existing RFIs, work packages,
 * deliveries, photos, inspections, etc. to that zone. This module
 * centralises every zone / link read + write so the viewer, the
 * right-side coordination panel, and the Portfolio/CommandCenter
 * surfaces don't each reimplement the same queries against
 * drawing_revisions / drawing_zones / drawing_links.
 *
 * MVP scope (Slice 0):
 *   - Ensure a default "current" revision per drawing so MVP users
 *     who haven't onboarded revisions can still create zones.
 *   - CRUD for zones (rectangle geometry, status, label).
 *   - CRUD + soft-delete for links (polymorphic: rfi / work_package /
 *     delivery / photo / inspection / document / change_order).
 *   - Hydration: given a list of zones, attach their active links
 *     grouped by type so the viewer can render count badges.
 *
 * Deferred to V1.5: status rule engine, AI-suggested links, "create
 * from zone" helpers that mint a new RFI/photo with the zone's sheet
 * + zone_id pre-filled.
 */

import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";

// The set of record types the app can currently link to a zone. Mirrors
// the drawing_links.linked_record_type CHECK constraint — keep in sync
// if the migration's allow-list changes.
export const LINKABLE_TYPES = [
  "rfi",
  "work_package",
  "delivery",
  "photo",
  "inspection",
  "daily_log",
  "document",
  "change_order",
  "submittal",
  "drawing",
];

// Friendly labels for UI chips + tabs.
export const LINKABLE_TYPE_LABELS = {
  rfi:           "RFI",
  work_package:  "Work Package",
  delivery:      "Delivery",
  photo:         "Photo",
  inspection:    "Inspection",
  daily_log:     "Daily Log",
  document:      "Document",
  change_order:  "Change Order",
  submittal:     "Submittal",
  drawing:       "Drawing",
};

// Status priority order used when multiple zones overlap visually or
// when the rule engine needs a deterministic pick. Matches the spec:
// red > amber > purple > blue > green > neutral.
export const STATUS_PRIORITY = ["red", "amber", "purple", "blue", "green", "neutral"];
export const ALL_STATUSES    = STATUS_PRIORITY;

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
  const payload = {
    project_id:     drawing.project_id,
    drawing_id:     drawing.id,
    revision_code:  drawing.revision || "v1",
    revision_name:  drawing.revision_name || null,
    sheet_number:   drawing.sheet_number || drawing.drawing_number || "—",
    sheet_title:    drawing.title || drawing.sheet_title || "Untitled",
    version_number: 1,
    is_current:     true,
    created_by:     userId || null,
  };
  const { data: created, error: insErr } = await supabase
    .from("drawing_revisions")
    .insert(payload)
    .select()
    .single();
  if (insErr) throw insErr;
  return created;
}

/**
 * List zones for one drawing revision, newest first.
 * Returns the raw rows; callers hydrate link counts via
 * hydrateZoneLinks().
 */
export async function listZones(revisionId) {
  if (!revisionId) return [];
  const { data, error } = await supabase
    .from("drawing_zones")
    .select("*")
    .eq("drawing_revision_id", revisionId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Generate the next `zone_key` (e.g. "Z-003") for a revision. We look
 * at existing rows, find the highest numeric suffix, and add 1. Scoped
 * per-revision so two sheets can both start at Z-001.
 */
export async function nextZoneKey(revisionId) {
  if (!revisionId) return "Z-001";
  const { data, error } = await supabase
    .from("drawing_zones")
    .select("zone_key")
    .eq("drawing_revision_id", revisionId);
  if (error) throw error;
  const max = (data || []).reduce((acc, row) => {
    const m = /(\d+)\s*$/.exec(row.zone_key || "");
    if (!m) return acc;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `Z-${String(max + 1).padStart(3, "0")}`;
}

/**
 * Create a zone. Geometry is normalized [0,1] viewer coordinates
 * (x_min, y_min, x_max, y_max) — independent of PDF pixel size so
 * the zone re-places correctly at any zoom.
 */
export async function createZone({
  projectId, drawingId, revisionId, userId,
  label, zoneKey, description,
  zoneType = "area",
  xMin, yMin, xMax, yMax,
  levelRef, gridRef, detailRef, disciplineCode, sequenceRef,
  status = "neutral",
}) {
  if (!projectId || !drawingId || !revisionId) {
    throw new Error("createZone: projectId, drawingId, revisionId required");
  }
  if ([xMin, yMin, xMax, yMax].some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    throw new Error("createZone: bbox must be four finite numbers");
  }
  const key = zoneKey || (await nextZoneKey(revisionId));
  const payload = {
    project_id:           projectId,
    drawing_id:           drawingId,
    drawing_revision_id:  revisionId,
    zone_key:             key,
    label:                label || key,
    description:          description || null,
    zone_type:            zoneType,
    shape_type:           "rect",
    x_min: xMin, y_min: yMin, x_max: xMax, y_max: yMax,
    level_ref:            levelRef || null,
    grid_ref:             gridRef || null,
    detail_ref:           detailRef || null,
    discipline_code:      disciplineCode || null,
    sequence_ref:         sequenceRef || null,
    status,
    created_by:           userId || null,
  };
  const { data, error } = await supabase
    .from("drawing_zones")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateZone(zoneId, patch) {
  if (!zoneId) throw new Error("updateZone: zoneId required");
  const { data, error } = await supabase
    .from("drawing_zones")
    .update(patch)
    .eq("id", zoneId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Soft-delete a zone — we keep history so link rows and the rule
 * engine can still reference deleted zones later.
 */
export async function deleteZone(zoneId) {
  if (!zoneId) throw new Error("deleteZone: zoneId required");
  const { error } = await supabase
    .from("drawing_zones")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", zoneId);
  if (error) throw error;
  return { id: zoneId };
}

// ── Links ────────────────────────────────────────────────────────────

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
  rfi:          { table: "rfis",           accessor: base44.entities.RFI },
  work_package: { table: "work_packages",  accessor: base44.entities.WorkPackage },
  delivery:     { table: "deliveries",     accessor: base44.entities.Delivery },
  photo:        { table: "documents",      accessor: base44.entities.Document },
  inspection:   { table: "inspections",    accessor: base44.entities.Inspection },
  daily_log:    { table: "daily_logs",     accessor: base44.entities.DailyLog },
  document:     { table: "documents",      accessor: base44.entities.Document },
  change_order: { table: "change_orders",  accessor: base44.entities.ChangeOrder },
  submittal:    { table: "documents",      accessor: base44.entities.Document },
  drawing:      { table: "drawings",       accessor: base44.entities.Drawing },
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
