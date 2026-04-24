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
export function computeZoneReadiness(hydrated) {
  const items = _hydratedToArray(hydrated).filter(
    (x) => x.link && (x.link.is_confirmed === undefined || x.link.is_confirmed === true) && !x.link.removed_at && x.record,
  );

  const out = {
    fabrication: null,
    delivery:    null,
    erection:    null,
    drivers: { fabrication: [], delivery: [], erection: [] },
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
