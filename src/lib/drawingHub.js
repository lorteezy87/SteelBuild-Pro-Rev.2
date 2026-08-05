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

// Revision lifecycle — extracted to drawingHub/revisions.js. Re-exported
// here so existing imports continue to work.
export {
  ensureCurrentRevision,
  carryZonesForward,
  createNewRevisionAndCarryZones,
  recordSheetSlipSheet,
} from "./drawingHub/revisions";

// Zone CRUD — extracted to drawingHub/zones.js. Re-exported so existing
// imports continue to work.
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
// to work byte-identically.
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


// Zone activity stream — extracted to drawingHub/activity.js.
// Re-exported here so existing imports continue to work.
export { listZoneActivity } from "./drawingHub/activity";

// AI-suggested links — extracted to drawingHub/aiSuggest.js. Re-exported
// here so existing imports continue to work.
export { suggestLinksForZone } from "./drawingHub/aiSuggest";

// Analyzer→Zones bridge (V3.0) — extracted to drawingHub/proposals.js.
// Re-exported here so existing imports continue to work.
export {
  proposeZonesFromFindings,
  listZoneProposals,
  acceptZoneProposal,
  rejectZoneProposal,
  mergeZoneProposalIntoZone,
} from "./drawingHub/proposals";

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

// Set-level edit lock (migration 071). Service layer guards every write
// path against assertSetUnlocked(); the UI uses lockSet/unlockSet on
// approval and admin override.
export {
  lockSet,
  unlockSet,
  isSetLocked,
  assertSetUnlocked,
} from "./drawingHub/setLock";

// Sign-off stamps on drawing revisions (migration 072). Append-only audit
// trail — voiding leaves the row in place with is_voided=true.
export {
  listSignoffs,
  createSignoff,
  voidSignoff,
  SIGNOFF_STAMP_TYPES,
} from "./drawingHub/signoffs";
