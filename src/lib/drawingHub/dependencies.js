/**
 * drawingHub/dependencies.js — Zone-to-zone dependency graph (V3.1).
 *
 * Extracted from src/lib/drawingHub.js. Behavior + Supabase calls are
 * byte-identical to the original.
 *
 * Covers the directed-edge model in drawing_zone_dependencies plus
 * the pure propagation engine (_buildDependencyIndex,
 * computeDependencyImpact). The internal _logDependencyActivity
 * helper writes audit rows on both endpoints.
 */

import { supabase } from "@/lib/supabase";
import { DEPENDENCY_RELATIONSHIPS } from "./constants";
import { assertSetUnlocked } from "./setLock";

/**
 * For dependency add/remove we need the lock guard to gate writes if the
 * source zone's drawing belongs to a locked set. (Target zone could live
 * on a different sheet / set; the lock applies to the side that "owns"
 * the edit — by convention the source.)
 */
async function _drawingIdForZone(zoneId) {
  if (!zoneId) return null;
  const { data, error } = await supabase
    .from("drawing_zones")
    .select("drawing_id")
    .eq("id", zoneId)
    .maybeSingle();
  if (error) return null;
  return data?.drawing_id || null;
}

async function _drawingIdForDependency(depId) {
  if (!depId) return null;
  const { data, error } = await supabase
    .from("drawing_zone_dependencies")
    .select("source_zone_id")
    .eq("id", depId)
    .maybeSingle();
  if (error || !data) return null;
  return _drawingIdForZone(data.source_zone_id);
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
  // Lock guard — gate by the source zone's drawing.
  const drawingId = await _drawingIdForZone(sourceZoneId);
  await assertSetUnlocked(drawingId);
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
  const drawingId = await _drawingIdForDependency(depId);
  await assertSetUnlocked(drawingId);
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

  // Breadth-first traversal so closer ancestors are visited first; if cycles fire later
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
