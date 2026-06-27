/**
 * drawingHub/zones.js — CRUD for drawing_zones rows.
 *
 * Extracted from src/lib/drawingHub.js. Behavior + Supabase calls are
 * byte-identical to the original; this file is intentionally narrow
 * scope so the data path stays trivial to audit.
 */

import { supabase } from "@/lib/supabase";
import { bboxFromPolygonPoints } from "./zoneGeometry";
import { assertSetUnlocked } from "./setLock";

/**
 * Resolve drawing_id from a zone_id so updateZone / deleteZone can run
 * the lock guard without their callers having to fetch the zone first.
 * Returns null if the zone can't be found (RLS or stale id) — the lock
 * guard tolerates null and the underlying mutation will surface its own
 * error.
 */
async function _drawingIdForZone(zoneId) {
  const { data, error } = await supabase
    .from("drawing_zones")
    .select("drawing_id")
    .eq("id", zoneId)
    .maybeSingle();
  if (error) return null;
  return data?.drawing_id || null;
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

  // Lock guard (migration 071). If the parent set is locked, refuse the
  // write before we do any geometry resolution — a clean rejection beats
  // a half-built payload sailing into a row-level reject.
  await assertSetUnlocked(drawingId);

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
  // Lock guard. _drawingIdForZone resolves zone → drawing so we can
  // bubble up to drawing_sets.is_locked without forcing the caller to
  // pass the drawing id in.
  const drawingId = await _drawingIdForZone(zoneId);
  await assertSetUnlocked(drawingId);
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
  const drawingId = await _drawingIdForZone(zoneId);
  await assertSetUnlocked(drawingId);
  const { error } = await supabase
    .from("drawing_zones")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", zoneId);
  if (error) throw error;
  return { id: zoneId };
}
