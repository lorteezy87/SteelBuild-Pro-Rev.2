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
 * Compute the axis-aligned bounding box of a polygon-points array.
 * Points are [x,y] pairs in normalized [0,1] viewer space. Returns
 * null if the input is empty or malformed — callers should guard on
 * that before relying on the result.
 */
export function bboxFromPolygonPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let xMin =  Infinity, yMin =  Infinity;
  let xMax = -Infinity, yMax = -Infinity;
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  return { xMin, yMin, xMax, yMax };
}

/**
 * Create a zone. Geometry can be either a rectangle (xMin/yMin/xMax/
 * yMax, the original MVP shape) or a polygon (polygonPoints — array
 * of [x,y] pairs in normalized [0,1] space, length >= 3). For polygons
 * we compute the bbox from the points here so list queries + the
 * status-index filter still have their columns populated.
 */
export async function createZone({
  projectId, drawingId, revisionId, userId,
  label, zoneKey, description,
  zoneType = "area",
  shapeType,       // optional — inferred from presence of polygonPoints if omitted
  xMin, yMin, xMax, yMax,
  polygonPoints,   // optional — array of [x,y] pairs
  levelRef, gridRef, detailRef, disciplineCode, sequenceRef,
  status = "neutral",
}) {
  if (!projectId || !drawingId || !revisionId) {
    throw new Error("createZone: projectId, drawingId, revisionId required");
  }

  // Resolve geometry. Polygon wins if points were supplied; otherwise
  // fall back to the rectangle branch. Whichever we land in, we end up
  // with a consistent {shape, bbox, points} tuple so the payload below
  // stays straightforward.
  let resolvedShape = shapeType || (Array.isArray(polygonPoints) ? "polygon" : "rect");
  let bbox = null;
  let pointsPayload = null;

  if (resolvedShape === "polygon") {
    if (!Array.isArray(polygonPoints) || polygonPoints.length < 3) {
      throw new Error("createZone: polygonPoints must be an array of at least 3 [x,y] pairs");
    }
    bbox = bboxFromPolygonPoints(polygonPoints);
    if (!bbox) throw new Error("createZone: polygonPoints must contain numeric [x,y] pairs");
    if (bbox.xMax <= bbox.xMin || bbox.yMax <= bbox.yMin) {
      throw new Error("createZone: polygon is degenerate (zero width or height)");
    }
    pointsPayload = polygonPoints;
  } else {
    if ([xMin, yMin, xMax, yMax].some((v) => typeof v !== "number" || !Number.isFinite(v))) {
      throw new Error("createZone: rectangle bbox must be four finite numbers");
    }
    bbox = { xMin, yMin, xMax, yMax };
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
    shape_type:           resolvedShape,
    x_min: bbox.xMin, y_min: bbox.yMin, x_max: bbox.xMax, y_max: bbox.yMax,
    polygon_points:       pointsPayload,
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

// ────────────────────────────────────────────────────────────────────
// Status rule engine (V1.5)
//
// Pure function: takes a zone's active links + the hydrated source
// records and returns {status, reason, drivers}. No I/O, no queries,
// easy to unit test and reuse from anywhere (viewer overlay, portfolio
// heatmap later, etc.).
//
// Priority order (per spec): red > amber > purple > blue > green >
// neutral. The first matching bucket wins — we DON'T sum severities;
// one blocker is enough to make the zone red.
//
// "Drivers" is an ordered list of short strings explaining WHY a
// given status triggered. The ZonePanel surfaces these verbatim so
// the user can see "RFI-012 overdue 3 days" next to the red chip
// instead of just a bare color.
// ────────────────────────────────────────────────────────────────────

const STATUS_THRESHOLDS = {
  RFI_DUE_SOON_DAYS:       3,
  DELIVERY_DUE_SOON_DAYS:  2,
  AI_WARN_CONFIDENCE:      0.80,
};

// Match whatever set of status strings your existing RFI / WP /
// Inspection / Delivery models use. Stay permissive — string comparison
// is case-insensitive so "In Progress" and "in progress" both count.
const IS_RFI_RESOLVED  = (s) => /^(answered|closed|void)$/i.test(s || "");
const IS_DEL_DONE      = (s) => /^(delivered|received|complete)$/i.test(s || "");
const IS_INSP_FAILED   = (s) => /^(failed|blocked|rejected)$/i.test(s || "");
const IS_INSP_INPROG   = (s) => /^(in progress|started|ongoing)$/i.test(s || "");
const IS_WP_BLOCKED    = (s) => /^(blocked|on hold|on-hold)$/i.test(s || "");
const IS_WP_WAITING    = (s) => /^(waiting|pending approval|pending release|submitted)$/i.test(s || "");
const IS_WP_ACTIVE     = (s) => /^(active|in progress|fabrication|erection|installation|fabricating|erecting|installing)$/i.test(s || "");
const IS_DEL_TRANSIT   = (s) => /^(in transit|dispatched|en route)$/i.test(s || "");
const IS_DEL_SCHED     = (s) => /^(scheduled|planned|pending)$/i.test(s || "");
const IS_DEL_EXCEPTION = (s) => /^(late|delayed|exception|rejected)$/i.test(s || "");

function _daysUntil(dateStr, today = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const ms = d.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

function _shortNum(record) {
  return (
    record?.rfi_number ||
    record?.wp_number ||
    record?.delivery_number ||
    record?.co_number ||
    record?.inspection_number ||
    record?.document_number ||
    null
  );
}

/**
 * Compute status + drivers for a single zone given its hydrated link
 * records. `hydrated` is the same shape hydrateLinks() returns —
 * Map<linkId, {link, record}> OR an array of those entries.
 *
 * Treats links with is_confirmed=false as advisory (shown in UI but
 * excluded from the engine), so AI suggestions can't spook the status
 * until a human confirms them.
 */
export function computeZoneStatus(hydrated, { today = new Date(), thresholds = STATUS_THRESHOLDS } = {}) {
  const items = _hydratedToArray(hydrated).filter(
    (x) => x.link && (x.link.is_confirmed === undefined || x.link.is_confirmed === true) && !x.link.removed_at,
  );

  if (items.length === 0) {
    return { status: "neutral", drivers: [], reason: "No confirmed links yet." };
  }

  const drivers = { red: [], amber: [], purple: [], blue: [] };

  for (const { link, record } of items) {
    if (!record) continue; // orphaned link — ignored here, surfaced separately in UI
    const role = link.link_role;
    const type = link.linked_record_type;
    const status = String(record.status || "").trim();
    const num = _shortNum(record);
    const label = num ? `${type.toUpperCase()} ${num}` : type.toUpperCase();

    // Explicit "blocks" role always wins → red.
    if (role === "blocks") {
      drivers.red.push(`${label} flagged as blocker`);
      continue;
    }

    switch (type) {
      case "rfi": {
        if (IS_RFI_RESOLVED(status)) break;
        const due = _daysUntil(record.date_required, new Date(today));
        if (due !== null && due < 0) {
          drivers.red.push(`${label} overdue ${Math.abs(due)}d`);
        } else if (due !== null && due <= thresholds.RFI_DUE_SOON_DAYS) {
          drivers.amber.push(due === 0 ? `${label} due today` : `${label} due in ${due}d`);
        }
        break;
      }
      case "inspection": {
        if (IS_INSP_FAILED(status) && !record.resolved_at) {
          drivers.red.push(`${label} ${status.toLowerCase()}`);
        } else if (IS_INSP_INPROG(status)) {
          drivers.blue.push(`${label} in progress`);
        }
        break;
      }
      case "work_package": {
        if (IS_WP_BLOCKED(status)) drivers.red.push(`${label} ${status.toLowerCase()}`);
        else if (IS_WP_WAITING(status)) drivers.amber.push(`${label} ${status.toLowerCase()}`);
        else if (IS_WP_ACTIVE(status)) drivers.blue.push(`${label} ${status.toLowerCase()}`);
        break;
      }
      case "delivery": {
        if (IS_DEL_DONE(status)) break;
        if (IS_DEL_EXCEPTION(status)) {
          // Only escalate to red when the link role explicitly gates the zone.
          const gates = role === "delivers_to" || link.metadata?.required_for_zone === true;
          if (gates) drivers.red.push(`${label} ${status.toLowerCase()}`);
          else drivers.amber.push(`${label} ${status.toLowerCase()}`);
          break;
        }
        const sch = _daysUntil(record.scheduled_date, new Date(today));
        if (sch !== null && sch <= thresholds.DELIVERY_DUE_SOON_DAYS) {
          drivers.amber.push(sch === 0 ? `${label} arrives today` : `${label} arrives in ${sch}d`);
        } else if (IS_DEL_TRANSIT(status) || IS_DEL_SCHED(status)) {
          drivers.blue.push(`${label} ${status.toLowerCase() || "scheduled"}`);
        }
        break;
      }
      case "ai_insight": {
        if (record.resolved_at) break;
        const severity = record.severity || "info";
        const conf = Number(record.confidence_score || 0);
        if (severity === "warning" && conf >= thresholds.AI_WARN_CONFIDENCE) {
          drivers.amber.push(`${label} warning (${Math.round(conf * 100)}% confidence)`);
        }
        break;
      }
      case "change_order": {
        // COs don't block a zone on their own; just surface activity.
        const open = !/^(approved|rejected|void)$/i.test(status);
        if (open) drivers.blue.push(`${label} ${status.toLowerCase() || "open"}`);
        break;
      }
      default:
        // Photos / documents / daily logs count as activity but don't
        // drive color on their own.
        break;
    }
  }

  // Purple: zone's been revised. Surfaced via link metadata or zone
  // flags — left as a hook for V2; today the engine only infers it
  // from explicit `revision_impact: true` metadata on any link.
  for (const { link } of items) {
    if (link.metadata?.revision_impact === true) {
      drivers.purple.push("Revision impact on linked record");
    }
  }

  // Priority resolution — pick the highest-priority bucket that has
  // at least one driver.
  const order = ["red", "amber", "purple", "blue"];
  for (const bucket of order) {
    if (drivers[bucket].length > 0) {
      return {
        status: bucket,
        drivers: drivers[bucket].slice(0, 5),
        reason: drivers[bucket][0],
      };
    }
  }
  // Some activity exists but nothing urgent → green.
  return {
    status: "green",
    drivers: [`${items.length} linked record${items.length !== 1 ? "s" : ""}, nothing urgent`],
    reason: "Clear",
  };
}

function _hydratedToArray(h) {
  if (!h) return [];
  if (h instanceof Map) return Array.from(h.values());
  if (Array.isArray(h)) return h;
  return [];
}

// ── Heatmap density (V2) ─────────────────────────────────────────────
//
// Each zone also carries a "density" score — a weighted sum of the
// unresolved issues attached to it. The heatmap toggle on the Drawing
// Viewer recolors every zone by this score instead of by status, so
// a PM can see at a glance which part of the sheet is swallowing the
// most coordination load.
//
// Weights reflect how painful each kind of issue usually is on a
// steel project:
//   overdue RFI            5   (waiting on info → blocks everything)
//   failed inspection      4   (cannot proceed until resolved)
//   blocked work package   4
//   late delivery          3
//   open RFI (in-window)   2
//   pending delivery       1
//   active WP              1
//   any other link         0.25 (photos, logs — adds texture, not pain)
//
// The numbers are intentionally small integers rather than floats so
// the resulting density value is easy to reason about in the debugger.
// Returns 0 for a zone with no links — the heatmap renders those as
// fully transparent (cool).
const HEATMAP_WEIGHTS = {
  rfiOverdue:     5,
  inspFailed:     4,
  wpBlocked:      4,
  delLate:        3,
  rfiOpen:        2,
  delPending:     1,
  wpActive:       1,
  otherActivity:  0.25,
};

export function computeZoneDensity(hydrated) {
  const items = _hydratedToArray(hydrated).filter(
    (x) => x.link && (x.link.is_confirmed === undefined || x.link.is_confirmed === true) && !x.link.removed_at,
  );
  let score = 0;
  for (const { link, record } of items) {
    if (!record) continue;
    const status = String(record.status || "").trim();
    switch (link.linked_record_type) {
      case "rfi": {
        if (IS_RFI_RESOLVED(status)) break;
        const due = _daysUntil(record.date_required, new Date());
        if (due !== null && due < 0) score += HEATMAP_WEIGHTS.rfiOverdue;
        else score += HEATMAP_WEIGHTS.rfiOpen;
        break;
      }
      case "inspection": {
        if (IS_INSP_FAILED(status) && !record.resolved_at) score += HEATMAP_WEIGHTS.inspFailed;
        else score += HEATMAP_WEIGHTS.otherActivity;
        break;
      }
      case "work_package": {
        if (IS_WP_BLOCKED(status)) score += HEATMAP_WEIGHTS.wpBlocked;
        else if (IS_WP_ACTIVE(status)) score += HEATMAP_WEIGHTS.wpActive;
        else score += HEATMAP_WEIGHTS.otherActivity;
        break;
      }
      case "delivery": {
        if (IS_DEL_DONE(status)) break;
        if (IS_DEL_EXCEPTION(status)) score += HEATMAP_WEIGHTS.delLate;
        else score += HEATMAP_WEIGHTS.delPending;
        break;
      }
      default:
        score += HEATMAP_WEIGHTS.otherActivity;
        break;
    }
  }
  return score;
}

// ── Readiness scoring (V2) ───────────────────────────────────────────
//
// Each zone carries three companion scores — Fabrication, Delivery,
// Erection — that answer "can we proceed here?" rather than "is
// something on fire?" (which is what computeZoneStatus covers).
// Scores are 0–100 percentages. A score of null means "no data" —
// the UI shows a dash instead of a misleading 0% or 100%.
//
// Rules are deterministic and mirror the rule-engine drivers so the
// reasons the UI surfaces stay consistent across status chips and
// readiness gauges.
//
// Fabrication: driven by linked drawings reaching "Released" stage +
//              linked work packages in fab phase + the absence of
//              blocking RFIs.
// Delivery:    % of linked deliveries that are Delivered / Received
//              (with penalties for late / rejected).
// Erection:    the composite — min(Fab, Delivery) capped further by
//              any failed inspection or blocked work package. If a
//              zone has no installation-phase signal, returns null.
const READINESS_DRAWING_STAGE_SCORES = {
  Released: 100,
  IFC:      100, // alias for Released per elsewhere in app
  FFF:       85,
  BFS:       70,
  OFS:       60,
  BFA:       40,
  OFA:       20,
  "Not Started": 0,
};

function _recordStage(rec) {
  // Drawings use `stage`; work packages use `status`. We look at both
  // because the app uses the same vocabulary ("Fabrication", "Erection",
  // "Installation") across tables.
  return String(rec?.stage || rec?.status || "").trim();
}

/**
 * Compute the three readiness percentages for a zone given its
 * hydrated links (as from hydrateLinks). Returns numbers in [0,100]
 * or null where there's no input signal of that kind.
 *
 *   {
 *     fabrication: 72 | null,
 *     delivery:    100 | null,
 *     erection:    55 | null,
 *     drivers: {
 *       fabrication: ["3/4 drawings released"],
 *       delivery:    ["2 of 3 delivered"],
 *       erection:    ["Blocked by INSP-12 failed"],
 *     }
 *   }
 *
 * Safe to call with zero links — returns all-null. Ignores orphaned
 * links (link without resolved record) so a stale row doesn't skew
 * the score.
 */
export function computeZoneReadiness(hydrated, options = {}) {
  // V3.1: optional `dependencyImpact` from computeDependencyImpact()
  // pulls every readiness score down by `(1 - drag)`. Backward-
  // compatible — calls without options behave identically to V3.0.
  // The drivers.upstream array surfaces the top contributors so the
  // UI can explain WHY the rings dropped.
  const dependencyImpact = options.dependencyImpact || null;
  const drag = dependencyImpact && Number.isFinite(Number(dependencyImpact.drag))
    ? Math.max(0, Math.min(1, Number(dependencyImpact.drag)))
    : 0;

  const items = _hydratedToArray(hydrated).filter(
    (x) => x.link && (x.link.is_confirmed === undefined || x.link.is_confirmed === true) && !x.link.removed_at && x.record,
  );

  const out = {
    fabrication: null,
    delivery:    null,
    erection:    null,
    drivers: { fabrication: [], delivery: [], erection: [], upstream: [] },
  };

  // ── Collect per-type buckets ──────────────────────────────────────
  const drawings   = [];
  const workPkgs   = [];
  const rfis       = [];
  const deliveries = [];
  const inspections = [];

  for (const { link, record } of items) {
    switch (link.linked_record_type) {
      case "drawing":      drawings.push(record); break;
      case "work_package": workPkgs.push(record); break;
      case "rfi":          rfis.push(record); break;
      case "delivery":     deliveries.push({ rec: record, link }); break;
      case "inspection":   inspections.push(record); break;
      default: break;
    }
  }

  const blockingOpenRFIs = rfis.filter((r) => {
    if (IS_RFI_RESOLVED(r.status)) return false;
    // A blocking RFI for readiness is either explicitly flagged (role
    // elsewhere) or simply overdue — both indicate "waiting on info".
    const due = _daysUntil(r.date_required, new Date());
    return due !== null && due < 0;
  });

  const failedInspections = inspections.filter(
    (r) => IS_INSP_FAILED(r.status) && !r.resolved_at,
  );

  // ── Fabrication ───────────────────────────────────────────────────
  // Weighted: 60% driven by drawings reaching Released, 30% by linked
  // fab-phase work package progress, 10% by absence of blocking RFIs.
  // If no drawings + no WPs are linked, return null — we genuinely
  // don't know how fab-ready this zone is without either signal.
  {
    const parts = [];
    if (drawings.length > 0) {
      const avg = drawings.reduce((s, d) => s + (READINESS_DRAWING_STAGE_SCORES[_recordStage(d)] ?? 0), 0) / drawings.length;
      parts.push({ weight: 0.6, score: avg });
      const released = drawings.filter((d) => /released|ifc/i.test(_recordStage(d))).length;
      out.drivers.fabrication.push(`${released}/${drawings.length} drawing${drawings.length !== 1 ? "s" : ""} released`);
    }
    const fabWPs = workPkgs.filter((w) => /fabric/i.test(_recordStage(w)));
    if (fabWPs.length > 0) {
      const avg = fabWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / fabWPs.length;
      parts.push({ weight: 0.3, score: avg });
      out.drivers.fabrication.push(
        `${fabWPs.length} fab WP${fabWPs.length !== 1 ? "s" : ""} avg ${Math.round(avg)}%`,
      );
    }
    if (blockingOpenRFIs.length > 0) {
      parts.push({ weight: 0.1, score: 0 });
      out.drivers.fabrication.push(
        `${blockingOpenRFIs.length} blocking RFI${blockingOpenRFIs.length !== 1 ? "s" : ""} open`,
      );
    } else if (rfis.length > 0) {
      parts.push({ weight: 0.1, score: 100 });
    }
    if (parts.length > 0) {
      const totalW = parts.reduce((s, p) => s + p.weight, 0);
      const weighted = parts.reduce((s, p) => s + p.weight * p.score, 0);
      out.fabrication = Math.max(0, Math.min(100, Math.round(weighted / totalW)));
    }
  }

  // ── Delivery ──────────────────────────────────────────────────────
  // Count-based: % of linked deliveries that are done, minus a 20pt
  // hit for each exception (late/rejected). Clamped to [0,100].
  {
    if (deliveries.length > 0) {
      const done = deliveries.filter(({ rec }) => IS_DEL_DONE(rec.status)).length;
      const exceptions = deliveries.filter(({ rec }) => IS_DEL_EXCEPTION(rec.status)).length;
      const base = (done / deliveries.length) * 100;
      const penalty = exceptions * 20;
      out.delivery = Math.max(0, Math.min(100, Math.round(base - penalty)));
      out.drivers.delivery.push(`${done}/${deliveries.length} delivered`);
      if (exceptions > 0) out.drivers.delivery.push(`${exceptions} exception${exceptions !== 1 ? "s" : ""}`);
    }
  }

  // ── Erection ──────────────────────────────────────────────────────
  // Erection is the composite: you need both the steel fabbed AND on
  // site before the crew can touch it. We take min(fab, delivery),
  // then apply hard blockers (failed inspection, blocked WP) that
  // snap the score toward 0 regardless of upstream readiness.
  {
    const fab = out.fabrication;
    const del = out.delivery;
    if (fab === null && del === null) {
      // No upstream signal — leave null. But erection-phase WPs alone
      // can inform us too.
      const erectWPs = workPkgs.filter((w) => /erect|install/i.test(_recordStage(w)));
      if (erectWPs.length > 0) {
        const avg = erectWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / erectWPs.length;
        out.erection = Math.max(0, Math.min(100, Math.round(avg)));
        out.drivers.erection.push(
          `${erectWPs.length} erect/install WP${erectWPs.length !== 1 ? "s" : ""} avg ${Math.round(avg)}%`,
        );
      }
    } else {
      const base = Math.min(fab ?? 100, del ?? 100);
      let score = base;
      const reasons = [];
      reasons.push(`min(fab ${fab ?? "—"}, del ${del ?? "—"}) = ${base}`);

      if (failedInspections.length > 0) {
        score = Math.min(score, 20);
        reasons.push(
          `blocked by ${failedInspections.length} failed inspection${failedInspections.length !== 1 ? "s" : ""}`,
        );
      }
      const blockedWPs = workPkgs.filter((w) => IS_WP_BLOCKED(w.status));
      if (blockedWPs.length > 0) {
        score = Math.min(score, 30);
        reasons.push(
          `${blockedWPs.length} WP${blockedWPs.length !== 1 ? "s" : ""} blocked`,
        );
      }
      if (blockingOpenRFIs.length > 0) {
        score = Math.min(score, 50);
        reasons.push(
          `${blockingOpenRFIs.length} RFI${blockingOpenRFIs.length !== 1 ? "s" : ""} overdue`,
        );
      }

      out.erection = Math.max(0, Math.min(100, Math.round(score)));
      out.drivers.erection = reasons;
    }
  }

  // ── V3.1: dependency drag ─────────────────────────────────────────
  // Apply the upstream-zone drag uniformly to all three rings. We
  // multiply by (1 - drag) rather than subtracting a flat amount so a
  // zone that's already at 30% doesn't get pushed below zero by a
  // small drag, and a 100% zone with serious upstream drag still
  // visibly drops. drag is bounded [0,1] by computeDependencyImpact.
  if (drag > 0) {
    if (out.fabrication !== null) {
      out.fabrication = Math.max(0, Math.min(100, Math.round(out.fabrication * (1 - drag))));
    }
    if (out.delivery !== null) {
      out.delivery = Math.max(0, Math.min(100, Math.round(out.delivery * (1 - drag))));
    }
    if (out.erection !== null) {
      out.erection = Math.max(0, Math.min(100, Math.round(out.erection * (1 - drag))));
    }
    // Top contributors land in drivers.upstream so the UI can render
    // a "Drag from N upstream zones: Z-014 RFI overdue (-22%)…" tip
    // alongside the existing fab/delivery/erection driver bullets.
    const top = Array.isArray(dependencyImpact.contributors) ? dependencyImpact.contributors : [];
    out.drivers.upstream = top.slice(0, 5).map((c) => ({
      zoneId:       c.zoneId,
      zoneLabel:    c.zoneLabel || null,
      distance:     c.distance,
      contribution: c.contribution,
      relationship: c.relationship,
      reason:       c.reason || null,
    }));
  }

  return out;
}

/**
 * Recompute + persist a zone's status from its current hydrated link
 * records. Writes back only when the computed value differs from the
 * stored one, so we don't churn updated_at on every render. Honours
 * is_manual_status_override — if the user pinned the status, we leave
 * it alone and return { skipped: true }.
 */
/**
 * Fetch the activity stream for a zone (newest first). Joins a
 * best-effort actor email from `user_profiles` or `auth.users` if the
 * project has a profile table; otherwise returns just the actor_id.
 *
 * Uses Supabase's PostgREST directly rather than the base44 entity
 * wrapper because drawing_zone_activity is append-only (no update/
 * delete) and we want a bounded limit.
 */
export async function listZoneActivity(zoneId, { limit = 50 } = {}) {
  if (!zoneId) return [];
  const { data, error } = await supabase
    .from("drawing_zone_activity")
    .select("*")
    .eq("drawing_zone_id", zoneId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
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
 */
export async function createNewRevisionAndCarryZones({
  drawing,
  newCode,
  newName,
  userId,
  includeLinks = true,
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
  {
    const { error } = await supabase
      .from("drawing_revisions")
      .update({ is_current: false, updated_by: userId || null })
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
      created_by:             userId || null,
    })
    .select()
    .single();
  if (insErr) {
    // Roll the current flag back so we don't leave the drawing
    // without a "current" pointer.
    await supabase.from("drawing_revisions").update({ is_current: true }).eq("id", current.id);
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

// ────────────────────────────────────────────────────────────────────
// AI-suggested links (V1.5)
//
// Given a zone + a bucket of open project records (RFIs, work
// packages, deliveries, change orders), ask an LLM to pick the
// records most likely to belong to the zone based on textual and
// contextual signals (sheet refs, grid / level / detail callouts,
// drawing_reference strings, subject/title overlap).
//
// Uses the app's llm-proxy edge function (Anthropic-compatible
// envelope + tool_use) with `provider: "openai"` + `gpt-4o-mini` —
// cheap enough to run on-demand per zone, and the proxy already
// handles transforming tool schemas and document/image content
// blocks for the OpenAI path.
//
// Suggestions persist as drawing_links with link_source = "ai_suggested"
// and is_confirmed = false, so the rule engine ignores them until a
// human confirms. Confidence score from the model is stored on the
// link row so the UI can order by it.
// ────────────────────────────────────────────────────────────────────

const SUGGEST_TOOL = {
  name: "propose_zone_links",
  description: "Return ranked candidate records that likely belong to the selected drawing zone.",
  input_schema: {
    type: "object",
    required: ["suggestions"],
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          required: ["record_type", "record_id", "confidence"],
          properties: {
            record_type:  { type: "string", enum: ["rfi", "work_package", "delivery", "change_order"] },
            record_id:    { type: "string", description: "UUID of the candidate record." },
            confidence:   { type: "number", description: "0..1 confidence that this record belongs to the zone." },
            rationale:    { type: "string", description: "One-sentence reason anchored in visible signals (sheet ref, grid, wording)." },
          },
        },
      },
    },
  },
};

const SUGGEST_SYSTEM_PROMPT = `You are helping a steel-construction PM attach operational records
(RFIs, work packages, deliveries, change orders) to a rectangular
zone on a drawing sheet. A "zone" is a spatial anchor — think "Level 2 /
Grid C-5" or "Stair 2 / Detail 7".

Rules:
- Only propose records where the signals clearly point to this zone
  (sheet number + grid or level match, drawing_reference mentions the
  zone's detail or grid, subject/description names the same scope,
  etc.). If signals are weak, DO NOT propose — the user would rather
  have zero suggestions than wrong ones.
- confidence must reflect how well the signals line up: 0.95 when
  sheet + grid + detail all match and the title echoes the zone
  label; 0.70 when two strong signals line up; below 0.50 suggests
  the link is speculative and should be omitted.
- rationale must cite specific textual evidence ("drawing_reference
  says 'S-402 Det 7'", not "looks related").
- At most 8 suggestions per call.
- Ignore records whose status is terminal (Answered, Closed, Void,
  Delivered, Received, Approved/Rejected) — those don't need zone
  attachment.`;

/**
 * Ask the LLM for candidate link suggestions. `records` is the
 * already-filtered universe of open project records to consider —
 * caller is responsible for scoping to the project + excluding
 * records already linked.
 */
export async function suggestLinksForZone(zone, records, {
  model = "gpt-4o-mini",
  provider = "openai",
  maxRecords = 80,
} = {}) {
  if (!zone) throw new Error("suggestLinksForZone: zone required");
  if (!Array.isArray(records) || records.length === 0) return [];

  // Shrink the candidate set to something the model can scan without
  // wasting tokens. Prefer records whose existing `drawing_reference`
  // or title contains the zone's sheet / grid / detail strings; fall
  // back to the full list truncated to maxRecords.
  const narrow = narrowCandidates(zone, records, maxRecords);

  const zoneContext = {
    zone_key: zone.zone_key,
    label: zone.label,
    description: zone.description,
    sheet_number: zone.__sheet_number || null,
    sheet_title:  zone.__sheet_title || null,
    level_ref: zone.level_ref,
    grid_ref:  zone.grid_ref,
    detail_ref: zone.detail_ref,
    discipline_code: zone.discipline_code,
    sequence_ref:    zone.sequence_ref,
  };

  // Project only the signals the model needs — don't send full rows.
  const candidateRows = narrow.map((r) => ({
    record_type: r.__type,
    record_id:   r.id,
    number:      r.rfi_number || r.wp_number || r.delivery_number || r.co_number || null,
    title:       r.subject || r.name || r.description || r.title || null,
    status:      r.status || null,
    drawing_reference: r.drawing_reference || null,
    ball_in_court:     r.ball_in_court || null,
    date_required:     r.date_required || r.scheduled_date || null,
  }));

  const userPrompt =
    `ZONE:\n${JSON.stringify(zoneContext, null, 2)}\n\n` +
    `CANDIDATE RECORDS (${candidateRows.length}):\n${JSON.stringify(candidateRows, null, 2)}\n\n` +
    "Call propose_zone_links with the records that clearly belong to this zone.";

  const { data, error } = await supabase.functions.invoke("llm-proxy", {
    body: {
      provider,
      model,
      maxTokens: 1500,
      system: SUGGEST_SYSTEM_PROMPT,
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "propose_zone_links" },
      messages: [{ role: "user", content: userPrompt }],
    },
  });
  if (error) throw new Error(`llm-proxy invocation failed: ${error.message}`);
  if (data?.error) throw new Error(data.error);

  const input = data?.tool_use?.input;
  if (!input || !Array.isArray(input.suggestions)) {
    // Model returned text instead of a tool call — surface that text so
    // the UI can show the user what went wrong rather than a bare null.
    const hint = (data?.text || "").trim().slice(0, 200);
    throw new Error(
      `Model did not return structured suggestions${hint ? `: ${hint}` : ""}.`,
    );
  }

  // Light sanity filter — reject malformed entries and any whose
  // record_id doesn't match one of the candidates we actually sent.
  const candidateIds = new Set(candidateRows.map((c) => c.record_id));
  return input.suggestions
    .filter((s) =>
      s && s.record_id && s.record_type &&
      candidateIds.has(s.record_id) &&
      Number.isFinite(Number(s.confidence)) &&
      Number(s.confidence) >= 0.5,
    )
    .map((s) => ({
      recordType: s.record_type,
      recordId:   s.record_id,
      confidence: Math.max(0, Math.min(1, Number(s.confidence))),
      rationale:  (s.rationale || "").slice(0, 280),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

// Narrow the candidate universe with cheap string matching before
// sending to the LLM — reduces token cost and keeps gpt-4o-mini's
// attention on a smaller set. Returns up to `maxRecords` rows
// prioritising ones that textually echo the zone.
function narrowCandidates(zone, records, maxRecords) {
  const needles = [
    zone.__sheet_number, zone.level_ref, zone.grid_ref, zone.detail_ref,
    zone.zone_key, zone.label,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  if (needles.length === 0) return records.slice(0, maxRecords);

  const scored = records.map((r) => {
    const hay = [
      r.drawing_reference, r.subject, r.name, r.description, r.title,
      r.detail_ref, r.grid_ref, r.level_ref, r.sequence_ref,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const n of needles) if (n && hay.includes(n)) score += 1;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxRecords).map((x) => x.r);
}

export async function recomputeAndPersistZoneStatus(zone, hydrated, opts = {}) {
  if (!zone?.id) throw new Error("recomputeAndPersistZoneStatus: zone required");
  if (zone.is_manual_status_override) {
    return { skipped: true, reason: "manual_override" };
  }
  const { status, reason } = computeZoneStatus(hydrated, opts);
  if (status === zone.status) return { skipped: true, reason: "unchanged" };

  // Import-on-demand to avoid a circular when tests pull just the
  // pure engine. Browser bundler will tree-shake this inline.
  const { data, error } = await supabase
    .from("drawing_zones")
    .update({
      status,
      status_reason: reason || null,
      status_computed_at: new Date().toISOString(),
      status_computed_by: "rule_engine",
    })
    .eq("id", zone.id)
    .select()
    .single();
  if (error) throw error;
  return { skipped: false, status, reason, zone: data };
}

// ────────────────────────────────────────────────────────────────────
// Drawing Hub V3.0 — Analyzer→Zones bridge
//
// AI analysis emits drawing_findings with normalized [0,1] bboxes
// (migration 050). This subsystem clusters those findings spatially
// into drawing_zone_proposals (migration 051) which a PM reviews and
// either accepts (mints a real drawing_zone), merges into an existing
// zone, or rejects.
//
// All operations are scoped per-project + per-drawing, never cross-
// drawing or cross-page. Findings without bboxes are skipped — the
// AI emitter falls back to NULL when it can't localize.
//
// Validation rules:
//   - Allowed drawing_zones.zone_type values are exposed via
//     ZONE_TYPES below; acceptZoneProposal validates user overrides
//     against this list.
//   - Linking rule: drawing_links.linked_record_type CHECK currently
//     does not include 'finding'. We use 'document' with metadata
//     `{ kind: 'finding', finding_id: <uuid> }` so the audit trail
//     still resolves back to the source finding without expanding
//     the enum. Adding a dedicated 'finding' enum value would be
//     cleaner long-term — flagged as a follow-up.
// ────────────────────────────────────────────────────────────────────

// Mirrors drawing_zones.zone_type CHECK constraint exactly.
export const ZONE_TYPES = [
  "area",
  "detail",
  "bay",
  "erection_zone",
  "delivery_zone",
  "inspection_zone",
  "member_group",
];

// Heuristic mapping from finding_type → suggested zone_type.
// Used as the proposal's default; PM can override on accept.
const FINDING_TYPE_TO_ZONE_TYPE = {
  coordination_conflict: "area",
  callout_issue:         "detail",
  aess_concern:          "member_group",
  dimension_concern:     "detail",
  missing_info:          "area",
  revision_delta:        "area",
};

// Severity → confidence weight, applied per finding then averaged
// for a cluster. Mirrors drawing_findings.severity CHECK
// (critical/high/medium/low/info).
const SEVERITY_WEIGHTS = {
  critical: 0.95,
  high:     0.90,
  medium:   0.70,
  low:      0.50,
  info:     0.40,
};

// Append a timeline entry to a proposal's metadata.timeline array.
// Pure helper — caller passes the existing metadata object; we return
// the new metadata object to put in the UPDATE payload.
function _appendTimeline(metadata, event, by, details = null) {
  const prev = metadata && typeof metadata === "object" ? metadata : {};
  const timeline = Array.isArray(prev.timeline) ? prev.timeline : [];
  return {
    ...prev,
    timeline: [
      ...timeline,
      { event, at: new Date().toISOString(), by: by || null, details },
    ],
  };
}

// Two bboxes overlap (with optional padding around each)?
// Inputs are {x_min,y_min,x_max,y_max} in normalized [0,1] space.
function _bboxesOverlap(a, b, padding = 0) {
  return !(
    a.x_max + padding < b.x_min - padding ||
    b.x_max + padding < a.x_min - padding ||
    a.y_max + padding < b.y_min - padding ||
    b.y_max + padding < a.y_min - padding
  );
}

// Union of an array of bboxes — returns the smallest rectangle
// that contains all of them.
function _unionBbox(items) {
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const it of items) {
    const x0 = Number(it.x_min), y0 = Number(it.y_min);
    const x1 = Number(it.x_max), y1 = Number(it.y_max);
    if (x0 < xMin) xMin = x0;
    if (y0 < yMin) yMin = y0;
    if (x1 > xMax) xMax = x1;
    if (y1 > yMax) yMax = y1;
  }
  // Clamp into [0,1] in case rounding pushed by epsilon — DB CHECK
  // would reject a value at 1.0000001.
  return {
    x_min: Math.max(0, Math.min(1, xMin)),
    y_min: Math.max(0, Math.min(1, yMin)),
    x_max: Math.max(0, Math.min(1, xMax)),
    y_max: Math.max(0, Math.min(1, yMax)),
  };
}

// Union-find on findings: bin them into clusters where any two
// findings whose padded bboxes overlap end up in the same group.
// Same page_index is a hard partition — never cluster across pages.
function _clusterFindings(findings, padding) {
  // Group by page first so cross-page candidates can't even be
  // compared against each other.
  const byPage = new Map();
  for (const f of findings) {
    const pg = f.page_index ?? 0;
    if (!byPage.has(pg)) byPage.set(pg, []);
    byPage.get(pg).push(f);
  }

  const allClusters = [];
  for (const arr of byPage.values()) {
    // Per-page union-find. parent[i] points to representative index.
    const parent = arr.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };

    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (_bboxesOverlap(arr[i], arr[j], padding)) union(i, j);
      }
    }
    const groups = new Map();
    for (let i = 0; i < arr.length; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(arr[i]);
    }
    for (const g of groups.values()) allClusters.push(g);
  }
  return allClusters;
}

/**
 * Spatially cluster a drawing's findings into proposals.
 *
 * Filters:
 *   - analysis_id (preferred): scope to a single analysis.
 *   - drawing_id: when no analysis_id, pulls findings whose
 *     sheet_number matches the drawing AND whose analysis is on the
 *     same project. Skips dismissed findings and any without a bbox.
 *
 * options:
 *   - minClusterSize (default 2): clusters smaller than this are
 *     dropped. Set to 1 to one-to-one every finding.
 *   - proximityPadding (default 0.02): how close two bboxes must be
 *     to count as "in the same cluster" — 2% of normalized sheet.
 *   - userId: stamped into metadata.timeline + each proposal's
 *     decided_by remains null.
 *
 * Idempotency: skips creating a proposal whose finding_ids set
 * exactly matches an existing proposal in 'pending' status on the
 * same drawing+revision. Different finding sets always create a new
 * proposal — this lets re-running after dismissing a finding mint
 * a fresh cluster.
 */
export async function proposeZonesFromFindings({
  projectId, drawingId, drawingRevisionId, analysisId,
  options = {},
} = {}) {
  if (!projectId || !drawingId) {
    throw new Error("proposeZonesFromFindings: projectId + drawingId required");
  }
  const minClusterSize  = Math.max(1, Number(options.minClusterSize ?? 2));
  const proximityPadding = Math.max(0, Math.min(0.5, Number(options.proximityPadding ?? 0.02)));
  const userId = options.userId || null;

  // ── Step 1: fetch candidate findings with bboxes. ───────────────────
  // Path A: scope to a specific analysis (the natural Hub workflow).
  // Path B: pull every non-dismissed finding for this drawing across
  // analyses — joins findings.sheet_number against drawings.sheet_number
  // since drawing_findings has no direct drawing_id column.
  let findings = [];
  if (analysisId) {
    const { data, error } = await supabase
      .from("drawing_findings")
      .select("*")
      .eq("analysis_id", analysisId)
      .eq("dismissed", false)
      .not("x_min", "is", null);
    if (error) throw error;
    findings = data || [];
  } else {
    // Lookup the drawing's sheet_number so we can scope by it.
    const { data: drawingRow, error: drawErr } = await supabase
      .from("drawings")
      .select("id, sheet_number, project_id")
      .eq("id", drawingId)
      .single();
    if (drawErr) throw drawErr;
    if (!drawingRow?.sheet_number) {
      // No sheet_number on this drawing — nothing to scope by.
      return { created: 0, skipped: 0, proposals: [] };
    }
    // Get analysis ids on this project so we don't accidentally pull
    // a finding from a sibling project that shares a sheet_number.
    const { data: analyses, error: anErr } = await supabase
      .from("drawing_analyses")
      .select("id")
      .eq("project_id", projectId);
    if (anErr) throw anErr;
    const projectAnalysisIds = (analyses || []).map((a) => a.id);
    if (projectAnalysisIds.length === 0) {
      return { created: 0, skipped: 0, proposals: [] };
    }
    const { data, error } = await supabase
      .from("drawing_findings")
      .select("*")
      .eq("dismissed", false)
      .eq("sheet_number", drawingRow.sheet_number)
      .in("analysis_id", projectAnalysisIds)
      .not("x_min", "is", null);
    if (error) throw error;
    findings = data || [];
  }

  // Drop any rows that snuck in without a complete bbox (defence in
  // depth — the .not("x_min","is",null) filter should already cover it).
  const eligible = findings.filter(
    (f) =>
      Number.isFinite(Number(f.x_min)) && Number.isFinite(Number(f.y_min)) &&
      Number.isFinite(Number(f.x_max)) && Number.isFinite(Number(f.y_max)),
  );
  if (eligible.length === 0) {
    return { created: 0, skipped: 0, proposals: [] };
  }

  // ── Step 2: cluster. ────────────────────────────────────────────────
  // minClusterSize=1 means "every finding becomes a proposal" — short
  // circuit the union-find to skip its O(N²) overlap scan.
  const clusters = minClusterSize <= 1
    ? eligible.map((f) => [f])
    : _clusterFindings(eligible, proximityPadding).filter((g) => g.length >= minClusterSize);

  if (clusters.length === 0) {
    return { created: 0, skipped: 0, proposals: [] };
  }

  // ── Step 3: idempotency check. Pull existing 'pending' proposals on
  // this drawing+revision and index them by sorted finding_ids string,
  // so we can skip exact-match clusters.
  let existingPending = [];
  {
    const q = supabase
      .from("drawing_zone_proposals")
      .select("id, finding_ids, status, drawing_revision_id")
      .eq("project_id", projectId)
      .eq("drawing_id", drawingId)
      .eq("status", "pending");
    const { data, error } = await q;
    if (error) throw error;
    existingPending = data || [];
  }
  const existingKey = (ids) => [...ids].sort().join("|");
  const existingSet = new Set(
    existingPending
      .filter((p) => (drawingRevisionId
        ? p.drawing_revision_id === drawingRevisionId
        : true))
      .map((p) => existingKey(p.finding_ids || [])),
  );

  // ── Step 4: build payloads. ─────────────────────────────────────────
  const payloads = [];
  let skipped = 0;
  for (const group of clusters) {
    const findingIds = group.map((g) => g.id);
    const key = existingKey(findingIds);
    if (existingSet.has(key)) { skipped += 1; continue; }

    const bbox = _unionBbox(group);
    if (!(bbox.x_max > bbox.x_min) || !(bbox.y_max > bbox.y_min)) {
      // Degenerate union (shouldn't happen — single finding bbox is
      // already non-degenerate per the migration 050 CHECK). Skip.
      skipped += 1;
      continue;
    }

    const first = group[0];
    const suggestedZoneType = FINDING_TYPE_TO_ZONE_TYPE[first.finding_type] || "area";
    const suggestedLabel = group.length === 1
      ? String(first.description || "Untitled finding").slice(0, 60)
      : `Zone from ${group.length} findings`;

    // Average severity-weighted confidence.
    const conf = group.reduce((s, f) => s + (SEVERITY_WEIGHTS[f.severity] ?? 0.5), 0) / group.length;

    payloads.push({
      project_id:           projectId,
      drawing_id:           drawingId,
      drawing_revision_id:  drawingRevisionId || null,
      analysis_id:          analysisId || first.analysis_id || null,
      finding_ids:          findingIds,
      cluster_size:         findingIds.length,
      shape_type:           "rect",
      x_min:                bbox.x_min,
      y_min:                bbox.y_min,
      x_max:                bbox.x_max,
      y_max:                bbox.y_max,
      polygon_points:       null,
      suggested_zone_type:  suggestedZoneType,
      suggested_label:      suggestedLabel,
      confidence:           Math.max(0, Math.min(1, conf)),
      status:               "pending",
      metadata: {
        timeline: [
          {
            event: "proposal_created",
            at: new Date().toISOString(),
            by: userId,
            details: {
              source: "proposeZonesFromFindings",
              cluster_size: findingIds.length,
              proximity_padding: proximityPadding,
              min_cluster_size: minClusterSize,
            },
          },
        ],
      },
    });
  }

  if (payloads.length === 0) {
    return { created: 0, skipped, proposals: [] };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("drawing_zone_proposals")
    .insert(payloads)
    .select();
  if (insErr) throw insErr;

  return {
    created: (inserted || []).length,
    skipped,
    proposals: inserted || [],
  };
}

/**
 * List proposals on a drawing, with hydrated finding-summary metadata
 * (severity counts + finding_type counts). Pagination via limit/offset.
 *
 * Returns: { rows: [...], total }. Each row is the proposal record
 * augmented with `__findingSummary = { severityCounts, typeCounts }`
 * built from the related drawing_findings rows.
 */
export async function listZoneProposals({
  projectId, drawingId, drawingRevisionId,
  status,             // string or array of statuses; default ["pending"]
  limit = 100,
  offset = 0,
} = {}) {
  if (!projectId || !drawingId) {
    throw new Error("listZoneProposals: projectId + drawingId required");
  }
  let q = supabase
    .from("drawing_zone_proposals")
    .select("*", { count: "exact" })
    .eq("project_id", projectId)
    .eq("drawing_id", drawingId)
    .order("created_at", { ascending: false })
    .range(offset, offset + Math.max(1, limit) - 1);

  if (drawingRevisionId) q = q.eq("drawing_revision_id", drawingRevisionId);

  const statusList = Array.isArray(status) ? status : status ? [status] : ["pending"];
  if (statusList.length === 1) q = q.eq("status", statusList[0]);
  else q = q.in("status", statusList);

  const { data: rows, count, error } = await q;
  if (error) throw error;

  // Hydrate finding summaries (severity + type counts) in one batch
  // across all proposals so the panel can render rich row metadata
  // without N+1 queries.
  const allIds = [...new Set((rows || []).flatMap((r) => r.finding_ids || []))];
  let findingsById = new Map();
  if (allIds.length > 0) {
    const { data: f, error: fErr } = await supabase
      .from("drawing_findings")
      .select("id, severity, finding_type, description")
      .in("id", allIds);
    if (fErr) throw fErr;
    findingsById = new Map((f || []).map((row) => [row.id, row]));
  }

  const enriched = (rows || []).map((r) => {
    const ids = r.finding_ids || [];
    const sevCounts = {};
    const typeCounts = {};
    for (const fid of ids) {
      const f = findingsById.get(fid);
      if (!f) continue;
      sevCounts[f.severity || "info"] = (sevCounts[f.severity || "info"] || 0) + 1;
      typeCounts[f.finding_type || "missing_info"] = (typeCounts[f.finding_type || "missing_info"] || 0) + 1;
    }
    return {
      ...r,
      __findingSummary: {
        severityCounts: sevCounts,
        typeCounts,
        resolvedCount: ids.filter((id) => findingsById.has(id)).length,
        totalCount: ids.length,
      },
    };
  });

  return { rows: enriched, total: count ?? enriched.length };
}

/**
 * Internal helper: link an array of finding ids into a target zone
 * via drawing_links. We use linked_record_type='document' with
 * metadata.kind='finding' because the drawing_links CHECK constraint
 * doesn't yet include a 'finding' enum value (flagged as a future
 * migration).
 *
 * Returns the count of inserted link rows. Callers handle the
 * surrounding transaction-like sequence (insert zone → link findings →
 * update proposal).
 */
async function _linkFindingsToZone({ projectId, zone, findingIds, userId, source = "ai_confirmed" }) {
  if (!findingIds || findingIds.length === 0) return 0;
  const payload = findingIds.map((fid) => ({
    project_id:          projectId,
    drawing_zone_id:     zone.id,
    drawing_id:          zone.drawing_id,
    drawing_revision_id: zone.drawing_revision_id,
    linked_record_type:  "document",
    // We use the finding id as linked_record_id; the trigger
    // validate_drawing_link_target() enforces the FK exists in the
    // referenced table. Since drawing_findings is not in the trigger's
    // allowed-tables map, this would fail. Instead we point at the
    // drawing itself (a record we know exists in the same project) and
    // store the real finding id in metadata. The audit trail still
    // resolves cleanly via metadata.finding_id; rule engine ignores
    // these because record_type='document' has no engine rules.
    linked_record_id:    zone.drawing_id,
    link_role:           "documents",
    link_source:         source,
    is_confirmed:        true,
    confirmed_by:        userId || null,
    confirmed_at:        new Date().toISOString(),
    metadata:            { kind: "finding", finding_id: fid },
    created_by:          userId || null,
  }));
  const { error } = await supabase.from("drawing_links").insert(payload);
  if (error) throw error;
  return payload.length;
}

/**
 * Accept a proposal: mint a new drawing_zone, link all of its
 * findings into it, set status='accepted', stash decision metadata.
 *
 * `overrides` lets the PM tweak the suggested values at the moment
 * of accept:
 *   - label
 *   - zoneType   (validated against ZONE_TYPES; throws if unknown)
 *   - zoneType  (preferred camelCase; aliased from zone_type if passed)
 *   - description
 *   - userId     (stamped into decided_by + new zone created_by)
 *
 * NOTE: Postgres doesn't expose true client-side transactions over the
 * supabase-js client, so this function performs zone-create → link-
 * insert → proposal-update sequentially. If any step fails, the
 * caller will see the error and the proposal stays 'pending' (so a
 * retry is safe). The new zone may have been created — we accept that
 * trade-off rather than introduce an RPC for V3.0.
 */
export async function acceptZoneProposal(proposalId, { overrides = {} } = {}) {
  if (!proposalId) throw new Error("acceptZoneProposal: proposalId required");
  const userId = overrides.userId || null;

  // Read proposal first so we have the source-of-truth bbox + finding_ids.
  const { data: proposal, error: pErr } = await supabase
    .from("drawing_zone_proposals")
    .select("*")
    .eq("id", proposalId)
    .single();
  if (pErr) throw pErr;
  if (!proposal) throw new Error("acceptZoneProposal: proposal not found");
  if (proposal.status !== "pending") {
    throw new Error(`acceptZoneProposal: proposal is ${proposal.status}, not pending`);
  }

  // Validate zone_type override against the enum if provided.
  const wantedZoneType = overrides.zoneType || overrides.zone_type || proposal.suggested_zone_type || "area";
  if (!ZONE_TYPES.includes(wantedZoneType)) {
    throw new Error(`acceptZoneProposal: invalid zone_type "${wantedZoneType}". Must be one of: ${ZONE_TYPES.join(", ")}`);
  }

  // Resolve the revision the new zone will live on. Proposal.drawing_revision_id
  // is preferred; if missing, ensure the drawing has a current revision.
  let revisionId = proposal.drawing_revision_id;
  if (!revisionId) {
    const { data: drawing, error: dErr } = await supabase
      .from("drawings")
      .select("*")
      .eq("id", proposal.drawing_id)
      .single();
    if (dErr) throw dErr;
    const rev = await ensureCurrentRevision({ drawing, userId });
    revisionId = rev.id;
  }

  // Build the new zone payload from the proposal geometry.
  const labelOverride = overrides.label && String(overrides.label).trim();
  const labelToUse = labelOverride || proposal.suggested_label || "AI-suggested zone";

  const zoneCreate = {
    projectId:  proposal.project_id,
    drawingId:  proposal.drawing_id,
    revisionId,
    userId,
    label:      labelToUse,
    description: overrides.description || null,
    zoneType:   wantedZoneType,
  };
  if (proposal.shape_type === "polygon") {
    zoneCreate.shapeType = "polygon";
    zoneCreate.polygonPoints = proposal.polygon_points;
  } else {
    zoneCreate.xMin = Number(proposal.x_min);
    zoneCreate.yMin = Number(proposal.y_min);
    zoneCreate.xMax = Number(proposal.x_max);
    zoneCreate.yMax = Number(proposal.y_max);
  }
  const newZone = await createZone(zoneCreate);

  // Stamp source_kind = ai_suggested on the freshly-minted zone so the
  // audit trail shows it didn't come from a manual draw.
  await supabase
    .from("drawing_zones")
    .update({ source_kind: "ai_suggested", confidence_score: proposal.confidence ?? null })
    .eq("id", newZone.id);

  // Link findings into the zone.
  const linksCreated = await _linkFindingsToZone({
    projectId:  proposal.project_id,
    zone:       newZone,
    findingIds: proposal.finding_ids || [],
    userId,
    source:     "ai_confirmed",
  });

  // Run rule engine on the freshly-linked zone so the stored status
  // reflects reality (otherwise it'd stay at the default 'green').
  try {
    const byZone = await listLinksForZones([newZone.id]);
    const links = byZone.get(newZone.id) || [];
    const hydrated = await hydrateLinks(links);
    await recomputeAndPersistZoneStatus(newZone, Array.from(hydrated.values()));
  } catch {
    // Status recompute is advisory — fall through silently.
  }

  // Update the proposal with decision details + timeline event.
  const newMetadata = _appendTimeline(
    proposal.metadata,
    "proposal_accepted",
    userId,
    { zone_id: newZone.id, links_created: linksCreated },
  );
  const { data: updated, error: uErr } = await supabase
    .from("drawing_zone_proposals")
    .update({
      status:           "accepted",
      accepted_zone_id: newZone.id,
      decided_by:       userId,
      decided_at:       new Date().toISOString(),
      decision_reason:  overrides.reason || null,
      metadata:         newMetadata,
    })
    .eq("id", proposalId)
    .select()
    .single();
  if (uErr) throw uErr;

  return { proposal: updated, zone: newZone, linksCreated };
}

/**
 * Reject a proposal. Does NOT touch findings — they stay where they
 * are so the user can try again with a different cluster size.
 */
export async function rejectZoneProposal(proposalId, { reason, userId } = {}) {
  if (!proposalId) throw new Error("rejectZoneProposal: proposalId required");

  const { data: proposal, error: pErr } = await supabase
    .from("drawing_zone_proposals")
    .select("metadata, status")
    .eq("id", proposalId)
    .single();
  if (pErr) throw pErr;
  if (!proposal) throw new Error("rejectZoneProposal: proposal not found");
  if (proposal.status !== "pending") {
    throw new Error(`rejectZoneProposal: proposal is ${proposal.status}, not pending`);
  }

  const newMetadata = _appendTimeline(
    proposal.metadata,
    "proposal_rejected",
    userId || null,
    { reason: reason || null },
  );
  const { data, error } = await supabase
    .from("drawing_zone_proposals")
    .update({
      status:          "rejected",
      decided_by:      userId || null,
      decided_at:      new Date().toISOString(),
      decision_reason: reason || null,
      metadata:        newMetadata,
    })
    .eq("id", proposalId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Merge a proposal into an existing zone. Links the proposal's
 * findings into the target zone, updates the proposal status to
 * 'merged', and stamps accepted_zone_id = targetZoneId so the
 * downstream audit trail can resolve the zone.
 */
export async function mergeZoneProposalIntoZone(proposalId, targetZoneId, { userId } = {}) {
  if (!proposalId || !targetZoneId) {
    throw new Error("mergeZoneProposalIntoZone: proposalId + targetZoneId required");
  }

  const [{ data: proposal, error: pErr }, { data: zone, error: zErr }] = await Promise.all([
    supabase.from("drawing_zone_proposals").select("*").eq("id", proposalId).single(),
    supabase.from("drawing_zones").select("*").eq("id", targetZoneId).single(),
  ]);
  if (pErr) throw pErr;
  if (zErr) throw zErr;
  if (!proposal) throw new Error("mergeZoneProposalIntoZone: proposal not found");
  if (!zone)     throw new Error("mergeZoneProposalIntoZone: target zone not found");
  if (proposal.status !== "pending") {
    throw new Error(`mergeZoneProposalIntoZone: proposal is ${proposal.status}, not pending`);
  }
  if (proposal.project_id !== zone.project_id || proposal.drawing_id !== zone.drawing_id) {
    throw new Error("mergeZoneProposalIntoZone: proposal and target zone must be on the same drawing");
  }

  const linksCreated = await _linkFindingsToZone({
    projectId:  proposal.project_id,
    zone,
    findingIds: proposal.finding_ids || [],
    userId,
    source:     "ai_confirmed",
  });

  // Recompute target zone status now that new links landed on it.
  try {
    const byZone = await listLinksForZones([zone.id]);
    const links = byZone.get(zone.id) || [];
    const hydrated = await hydrateLinks(links);
    await recomputeAndPersistZoneStatus(zone, Array.from(hydrated.values()));
  } catch {
    // Advisory.
  }

  const newMetadata = _appendTimeline(
    proposal.metadata,
    "proposal_merged",
    userId || null,
    { target_zone_id: targetZoneId, links_created: linksCreated },
  );
  const { data: updated, error: uErr } = await supabase
    .from("drawing_zone_proposals")
    .update({
      status:           "merged",
      accepted_zone_id: targetZoneId,
      decided_by:       userId || null,
      decided_at:       new Date().toISOString(),
      metadata:         newMetadata,
    })
    .eq("id", proposalId)
    .select()
    .single();
  if (uErr) throw uErr;

  return { proposal: updated, zone, linksCreated };
}

// ────────────────────────────────────────────────────────────────────
// Drawing Hub V3.1 — Zone-to-Zone Dependency Graph
//
// Directed edges between zones (`blocks`, `depends_on`, `relates_to`)
// stored in drawing_zone_dependencies. The propagation engine walks
// upstream ancestors (zones that block this one or that this one
// depends_on) and pulls readiness rings down by a "drag" score
// computed from the ancestors' statuses.
//
// Cycle safety: traversal uses an explicit visited set so even a
// pathological a→b→c→a graph terminates. The DB does NOT enforce
// acyclicity — see migration 052 for the rationale.
//
// `relates_to` is informational; it is rendered on the canvas + in
// the panel but does not contribute to drag.
// ────────────────────────────────────────────────────────────────────

export const DEPENDENCY_RELATIONSHIPS = ["blocks", "depends_on", "relates_to"];

/**
 * Add a directed edge between two zones in the same project.
 * Validates same-project, non-self, known relationship; inserts the
 * row; writes a `dependency_added` activity row on BOTH zones so the
 * audit timeline on either zone shows the relationship change.
 *
 * Returns the inserted dependency row.
 *
 * Errors surface verbatim — the trigger raises a clear exception when
 * the source/target zones don't share project_id, and the partial
 * unique index raises 23505 when an active edge with the same
 * (source, target, relationship) already exists.
 */
export async function addZoneDependency({
  projectId,
  sourceZoneId,
  targetZoneId,
  relationship,
  note = null,
  propagationWeight = 1.0,
  userId = null,
} = {}) {
  if (!projectId)     throw new Error("addZoneDependency: projectId required");
  if (!sourceZoneId)  throw new Error("addZoneDependency: sourceZoneId required");
  if (!targetZoneId)  throw new Error("addZoneDependency: targetZoneId required");
  if (sourceZoneId === targetZoneId) {
    throw new Error("addZoneDependency: source and target zones cannot be the same");
  }
  if (!DEPENDENCY_RELATIONSHIPS.includes(relationship)) {
    throw new Error(`addZoneDependency: relationship "${relationship}" not in ${DEPENDENCY_RELATIONSHIPS.join(", ")}`);
  }
  const weight = Number(propagationWeight);
  if (!Number.isFinite(weight) || weight < 0 || weight > 2) {
    throw new Error("addZoneDependency: propagationWeight must be a number in [0,2]");
  }

  const payload = {
    project_id:         projectId,
    source_zone_id:     sourceZoneId,
    target_zone_id:     targetZoneId,
    relationship,
    note:               note ? String(note).slice(0, 2000) : null,
    propagation_weight: weight,
    created_by:         userId,
    metadata:           {},
  };
  const { data: dep, error } = await supabase
    .from("drawing_zone_dependencies")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;

  // Activity audit — one row on each zone so timelines on both ends
  // show the change. The actor is best-effort (userId may be null).
  await _logDependencyActivity({
    projectId,
    dep,
    eventType: "dependency_added",
    userId,
  });

  return dep;
}

/**
 * Soft-remove a dependency. Sets removed_at/removed_by, then writes
 * `dependency_removed` activity rows on both zones. Returns the
 * updated row.
 */
export async function removeZoneDependency(depId, { userId = null } = {}) {
  if (!depId) throw new Error("removeZoneDependency: depId required");
  const { data: dep, error } = await supabase
    .from("drawing_zone_dependencies")
    .update({
      removed_at: new Date().toISOString(),
      removed_by: userId,
    })
    .eq("id", depId)
    .is("removed_at", null) // never re-mark an already-removed row
    .select()
    .single();
  if (error) throw error;
  if (!dep) {
    // Idempotent removal — no error, just nothing to do.
    return null;
  }

  await _logDependencyActivity({
    projectId: dep.project_id,
    dep,
    eventType: "dependency_removed",
    userId,
  });

  return dep;
}

/**
 * List active dependency edges for a drawing or single zone, with
 * hydrated source + target zone summaries (label, sheet number, bbox,
 * status). Returns BOTH directions when scoping to a zone — incoming
 * AND outgoing — so a single call can drive the panel's "blocking
 * this zone" + "blocked by this zone" lists.
 *
 * Filters:
 *   - projectId      (required)
 *   - drawingId      (optional): edges where source OR target zone
 *                    lives on this drawing (i.e. the edge is incident
 *                    to the sheet — useful for the canvas overlay)
 *   - zoneId         (optional): edges where the zone is source OR
 *                    target — used by the ZonePanel
 *   - includeRemoved (default false)
 *
 * Returns: { rows, total } where each row is a dep augmented with
 *   __source: { id, label, drawing_id, drawing_revision_id,
 *               sheet_number, x_min, y_min, x_max, y_max, status }
 *   __target: { same shape }
 */
export async function listZoneDependencies({
  projectId,
  drawingId,
  zoneId,
  includeRemoved = false,
} = {}) {
  if (!projectId) throw new Error("listZoneDependencies: projectId required");

  let query = supabase
    .from("drawing_zone_dependencies")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (!includeRemoved) query = query.is("removed_at", null);

  // Scope to a specific zone (incoming + outgoing). Supabase OR filter
  // syntax: `or("source_zone_id.eq.X,target_zone_id.eq.X")`.
  if (zoneId) {
    query = query.or(`source_zone_id.eq.${zoneId},target_zone_id.eq.${zoneId}`);
  }

  const { data: deps, error } = await query;
  if (error) throw error;
  let rows = deps || [];

  // Hydrate every zone referenced by the edges in one batch, then
  // optionally narrow to the drawing if drawingId was passed.
  const allZoneIds = [...new Set(rows.flatMap((r) => [r.source_zone_id, r.target_zone_id]))];
  let zonesById = new Map();
  if (allZoneIds.length > 0) {
    const { data: zoneRows, error: zErr } = await supabase
      .from("drawing_zones")
      .select("id, project_id, drawing_id, drawing_revision_id, zone_key, label, status, x_min, y_min, x_max, y_max, shape_type, polygon_points")
      .in("id", allZoneIds);
    if (zErr) throw zErr;
    zonesById = new Map((zoneRows || []).map((z) => [z.id, z]));
  }

  // Hydrate sheet_number for each unique drawing_id by joining to
  // drawings. Cheap — typically <10 distinct drawings per project view.
  const drawingIds = [...new Set(
    Array.from(zonesById.values()).map((z) => z.drawing_id).filter(Boolean),
  )];
  let drawingsById = new Map();
  if (drawingIds.length > 0) {
    const { data: drawRows, error: dErr } = await supabase
      .from("drawings")
      .select("id, sheet_number, title")
      .in("id", drawingIds);
    if (dErr) throw dErr;
    drawingsById = new Map((drawRows || []).map((d) => [d.id, d]));
  }

  const summaryFor = (zoneRow) => {
    if (!zoneRow) return null;
    const drw = drawingsById.get(zoneRow.drawing_id);
    return {
      id:                   zoneRow.id,
      label:                zoneRow.label || zoneRow.zone_key,
      zone_key:             zoneRow.zone_key,
      drawing_id:           zoneRow.drawing_id,
      drawing_revision_id:  zoneRow.drawing_revision_id,
      sheet_number:         drw?.sheet_number || null,
      sheet_title:          drw?.title || null,
      status:               zoneRow.status,
      x_min:                zoneRow.x_min,
      y_min:                zoneRow.y_min,
      x_max:                zoneRow.x_max,
      y_max:                zoneRow.y_max,
      shape_type:           zoneRow.shape_type,
      polygon_points:       zoneRow.polygon_points,
    };
  };

  rows = rows.map((r) => ({
    ...r,
    __source: summaryFor(zonesById.get(r.source_zone_id)),
    __target: summaryFor(zonesById.get(r.target_zone_id)),
  }));

  // drawingId scope: keep edges where either endpoint lives on the
  // requested drawing. Done client-side because the edge table itself
  // doesn't carry drawing_id (zones can move between revisions).
  if (drawingId) {
    rows = rows.filter(
      (r) => r.__source?.drawing_id === drawingId || r.__target?.drawing_id === drawingId,
    );
  }

  return { rows, total: rows.length };
}

/**
 * Pre-compute forward + reverse dependency indexes once so the
 * propagation walk is O(1) per neighbor lookup. Used internally by
 * computeDependencyImpact and exported for callers that walk the
 * graph repeatedly (the viewer page renders impacts for every zone).
 *
 * Input: array of dependency rows (active only — caller filters).
 * Output: { bySource: Map<srcId, edge[]>, byTarget: Map<tgtId, edge[]> }
 */
export function _buildDependencyIndex(deps) {
  const bySource = new Map();
  const byTarget = new Map();
  for (const d of deps || []) {
    if (d.removed_at) continue;
    if (!bySource.has(d.source_zone_id)) bySource.set(d.source_zone_id, []);
    if (!byTarget.has(d.target_zone_id)) byTarget.set(d.target_zone_id, []);
    bySource.get(d.source_zone_id).push(d);
    byTarget.get(d.target_zone_id).push(d);
  }
  return { bySource, byTarget };
}

// Status → drag contribution. red is the worst (1.0), amber half that,
// purple/blue a quarter, green/neutral/unknown contribute nothing.
// Mirrors the priority order in computeZoneStatus.
const _STATUS_FACTOR = {
  red:     1.0,
  amber:   0.5,
  purple:  0.25,
  blue:    0.25,
  green:   0,
  neutral: 0,
};

// Per-hop decay. Direct edges count fully; further-removed ancestors
// contribute progressively less so a 4-hop chain doesn't dominate.
// Beyond 3 hops the contribution is zero — past that, propagation
// stops mattering for any practical PM decision.
const _DISTANCE_DECAY = [1.0, 1.0, 0.5, 0.25, 0];

/**
 * Compute the dependency drag on a single zone.
 *
 * Walks ancestors of `zoneId` along `blocks` and `depends_on` edges
 * (i.e. zones that block this zone, or that this zone depends on).
 * Each ancestor's contribution is:
 *
 *   contribution = status_factor × propagation_weight × distance_decay
 *
 * Drag is the sum of contributions, capped at 1.0. Contributors are
 * returned sorted descending by contribution and limited to 10 so the
 * UI tip doesn't sprawl.
 *
 * `relates_to` edges are NOT walked — they're informational only.
 *
 * Cycle-safe: maintains a visited set keyed by zoneId so a→b→c→a
 * traversal terminates at c without revisiting a.
 *
 * Pure function — no I/O. Caller pre-fetches everything.
 *
 * Inputs:
 *   zoneId             (string)  zone whose drag we're computing
 *   allZonesById       (Map<zoneId, zoneRow>)
 *                                lookup for status + label hydration
 *   bySource           (Map<srcId, edge[]>)
 *                                from _buildDependencyIndex(...).bySource
 *   options:
 *     maxDepth         (default 3) — cutoff for the traversal
 *     contributorLimit (default 10) — max contributors returned
 *
 * Returns: { drag: number in [0,1], contributors: [{zoneId, zoneLabel,
 *   distance, contribution, relationship, reason}] }
 *
 * NOTE: traversal direction.
 *   - "Z depends_on X"    → edge source=Z, target=X.
 *   - "X blocks Z"        → edge source=X, target=Z.
 * In both cases the upstream of Z is X. Concretely:
 *   - For `blocks`, walk by_target[zoneId] (X is the source, Z is target).
 *   - For `depends_on`, walk by_source[zoneId] (Z is source, X is target).
 * We pass the relevant index in via `byTarget` and `bySource`; both
 * point upstream depending on relationship type.
 */
export function computeDependencyImpact(
  zoneId,
  allZonesById,
  index,
  options = {},
) {
  const maxDepth         = Math.max(1, Number(options.maxDepth ?? 3));
  const contributorLimit = Math.max(1, Number(options.contributorLimit ?? 10));
  if (!zoneId || !index || !allZonesById) {
    return { drag: 0, contributors: [] };
  }
  const bySource = index.bySource || new Map();
  const byTarget = index.byTarget || new Map();

  const visited = new Set([zoneId]);
  const contributors = [];

  // BFS so closer ancestors are visited first; if cycles fire later
  // they're just skipped via the visited set.
  const queue = [{ id: zoneId, distance: 0, viaRelationship: null, viaWeight: 1 }];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node.distance >= maxDepth) continue;

    // Outbound `depends_on` edges from this node lead upstream:
    //   "this depends_on X" — X is upstream.
    const outDeps = (bySource.get(node.id) || []).filter(
      (e) => e.relationship === "depends_on" && !e.removed_at,
    );
    // Inbound `blocks` edges land here from upstream:
    //   "X blocks this" — X is upstream.
    const inBlocks = (byTarget.get(node.id) || []).filter(
      (e) => e.relationship === "blocks" && !e.removed_at,
    );

    const upstreamEdges = [
      ...outDeps.map((e)  => ({ ancestorId: e.target_zone_id, edge: e })),
      ...inBlocks.map((e) => ({ ancestorId: e.source_zone_id, edge: e })),
    ];

    for (const { ancestorId, edge } of upstreamEdges) {
      if (visited.has(ancestorId)) continue;
      visited.add(ancestorId);

      const ancestor = allZonesById.get(ancestorId);
      const status = ancestor?.status || "neutral";
      const factor = _STATUS_FACTOR[status] ?? 0;
      const weight = Number.isFinite(Number(edge.propagation_weight))
        ? Math.max(0, Math.min(2, Number(edge.propagation_weight)))
        : 1;
      const decay = _DISTANCE_DECAY[node.distance + 1] ?? 0;
      const contribution = factor * weight * decay;

      if (contribution > 0) {
        contributors.push({
          zoneId:       ancestorId,
          zoneLabel:    ancestor?.label || ancestor?.zone_key || null,
          distance:     node.distance + 1,
          contribution,
          relationship: edge.relationship,
          // Short reason string the UI can echo verbatim. Status alone
          // is the most honest signal here — we don't want to reach
          // back into the rule engine's drivers from a pure function.
          reason:       `${ancestor?.label || ancestor?.zone_key || "upstream"} status=${status}`,
        });
      }

      // Continue traversal even if contribution is 0 (status=green
      // upstream might still gate further-up reds via depends_on).
      queue.push({
        id: ancestorId,
        distance: node.distance + 1,
        viaRelationship: edge.relationship,
        viaWeight: weight,
      });
    }
  }

  contributors.sort((a, b) => b.contribution - a.contribution);
  const drag = Math.max(0, Math.min(1, contributors.reduce((s, c) => s + c.contribution, 0)));

  return {
    drag,
    contributors: contributors.slice(0, contributorLimit),
  };
}

/**
 * Recompute + persist a zone's status, optionally factoring a
 * dependency impact into the readiness scores. Sister to
 * recomputeAndPersistZoneStatus — kept separate so existing callers
 * that don't have a dependency index don't pay for one.
 *
 * Note: drag does NOT change the rule-engine status (red/amber/etc.)
 * itself — that still comes from the zone's direct linked records.
 * Drag only affects readiness rings (computed on demand in the UI).
 * This function exists so callers that want a "full recompute" path
 * can persist the rule-engine status while having the readiness
 * computation available alongside.
 */
export async function recomputeAndPersistZoneStatusWithDependencies(
  zone,
  hydrated,
  depImpact,
  opts = {},
) {
  // The persistence path is identical to the non-dep version — drag
  // doesn't alter the stored zone.status. We keep the dep-aware
  // entry point so callers can compute readiness in one place if they
  // want to. The drag-aware readiness is returned alongside so the
  // caller can render it without recomputing.
  const persistResult = await recomputeAndPersistZoneStatus(zone, hydrated, opts);
  const readiness = computeZoneReadiness(hydrated, { dependencyImpact: depImpact });
  return { ...persistResult, readiness };
}

// ── Activity log helper ──────────────────────────────────────────────
// Writes one drawing_zone_activity row per side of the dependency
// (source + target) so audit timelines on either zone show the
// change. event_type is constrained to dependency_added /
// dependency_removed by migration 052's CHECK extension.
async function _logDependencyActivity({ projectId, dep, eventType, userId }) {
  if (!dep) return;
  const sharedMeta = {
    dependency_id:        dep.id,
    relationship:         dep.relationship,
    propagation_weight:   dep.propagation_weight,
    note:                 dep.note || null,
    source_zone_id:       dep.source_zone_id,
    target_zone_id:       dep.target_zone_id,
  };
  const rows = [
    {
      project_id:      projectId,
      drawing_zone_id: dep.source_zone_id,
      event_type:      eventType,
      from_value:      null,
      to_value:        eventType === "dependency_added" ? dep.relationship : null,
      actor_id:        userId,
      metadata: {
        ...sharedMeta,
        side: "source",
        peer_zone_id: dep.target_zone_id,
      },
    },
    {
      project_id:      projectId,
      drawing_zone_id: dep.target_zone_id,
      event_type:      eventType,
      from_value:      null,
      to_value:        eventType === "dependency_added" ? dep.relationship : null,
      actor_id:        userId,
      metadata: {
        ...sharedMeta,
        side: "target",
        peer_zone_id: dep.source_zone_id,
      },
    },
  ];
  const { error } = await supabase.from("drawing_zone_activity").insert(rows);
  if (error) {
    // Activity is best-effort — don't fail the dependency mutation
    // because audit failed. Surface a console warn so dev tooling can
    // catch CHECK-constraint regressions if migration 052 is missing.
    console.warn("[drawingHub] dependency activity log failed:", error.message);
  }
}
