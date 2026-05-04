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

import { supabase } from "@/lib/supabase";

// Public constants — extracted to drawingHub/constants.js. Re-exported
// here so existing `import { LINKABLE_TYPES } from "@/lib/drawingHub"`
// statements keep working byte-identically.
export {
  LINKABLE_TYPES,
  LINKABLE_TYPE_LABELS,
  STATUS_PRIORITY,
  ALL_STATUSES,
  ZONE_TYPES,
  DEPENDENCY_RELATIONSHIPS,
} from "./drawingHub/constants";

// Pure geometry helper — extracted to drawingHub/zoneGeometry.js.
export { bboxFromPolygonPoints } from "./drawingHub/zoneGeometry";

// Local bindings for the symbols still referenced inside this file.
// (ESM does not auto-bind names from `export ... from`.)
import {
  ZONE_TYPES,
} from "./drawingHub/constants";
import { createZone } from "./drawingHub/zones";
import { ensureCurrentRevision } from "./drawingHub/revisions";
import { recomputeAndPersistZoneStatus } from "./drawingHub/statusEngine";
import { listLinksForZones, hydrateLinks } from "./drawingHub/links";

// Revision lifecycle — extracted to drawingHub/revisions.js. Re-exported
// here so existing imports continue to work; locally bound for use
// inside this file (acceptZoneProposal calls ensureCurrentRevision).
export {
  ensureCurrentRevision,
  carryZonesForward,
  createNewRevisionAndCarryZones,
} from "./drawingHub/revisions";

// Zone CRUD — extracted to drawingHub/zones.js. Re-exported so existing
// imports continue to work; locally bound for use inside this file
// (acceptZoneProposal calls createZone).
export {
  listZones,
  nextZoneKey,
  createZone,
  updateZone,
  deleteZone,
} from "./drawingHub/zones";

// ── Links ────────────────────────────────────────────────────────────
// Extracted to drawingHub/links.js. Re-exported here so existing imports
// (`import { listLinksForZones, ... } from "@/lib/drawingHub"`) continue
// to work byte-identically. Locally bound where used inside this file.
export {
  listLinksForZones,
  createLink,
  removeLink,
  hydrateLinks,
  summarizeLinks,
} from "./drawingHub/links";


// Status / heatmap / readiness engine — extracted to drawingHub/statusEngine.js.
// Re-exported here so existing imports continue to work.
export {
  computeZoneStatus,
  computeZoneDensity,
  computeZoneReadiness,
  recomputeAndPersistZoneStatus,
  recomputeAndPersistZoneStatusWithDependencies,
} from "./drawingHub/statusEngine";


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

// (Revision carry-forward functions extracted to drawingHub/revisions.js
// and re-exported at the top of this file.)

// AI-suggested links — extracted to drawingHub/aiSuggest.js. Re-exported
// here so existing imports continue to work.
export { suggestLinksForZone } from "./drawingHub/aiSuggest";

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
//   - Findings are linked via linked_record_type='finding' (migration 056
//     extended the CHECK constraint and validate_drawing_link_target()).
// ────────────────────────────────────────────────────────────────────

// (ZONE_TYPES exported + imported at the top of this file.)

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
 * via drawing_links using the native 'finding' record type
 * (migration 056 extended the CHECK constraint and the FK validator).
 *
 * Returns the count of inserted link rows.
 */
async function _linkFindingsToZone({ projectId, zone, findingIds, userId, source = "ai_confirmed" }) {
  if (!findingIds || findingIds.length === 0) return 0;
  const payload = findingIds.map((fid) => ({
    project_id:          projectId,
    drawing_zone_id:     zone.id,
    drawing_id:          zone.drawing_id,
    drawing_revision_id: zone.drawing_revision_id,
    linked_record_type:  "finding",
    linked_record_id:    fid,
    link_role:           "documents",
    link_source:         source,
    is_confirmed:        true,
    confirmed_by:        userId || null,
    confirmed_at:        new Date().toISOString(),
    metadata:            {},
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

// Zone-to-zone dependency graph (V3.1) — extracted to
// drawingHub/dependencies.js. Re-exported here so existing imports
// continue to work byte-identically.
export {
  addZoneDependency,
  removeZoneDependency,
  listZoneDependencies,
  _buildDependencyIndex,
  computeDependencyImpact,
} from "./drawingHub/dependencies";
