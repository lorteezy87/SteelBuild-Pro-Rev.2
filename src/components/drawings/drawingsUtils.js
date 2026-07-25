/**
 * drawingsUtils.js — Pure helper functions for the Drawings module
 *
 * No React imports — these are plain JS utilities for
 * overdue detection, CSV export, and filter/stat computation.
 */

import { IN_REVIEW_STAGES, STAGE_ORDER, WORKFLOW_STAGES } from "./drawingsConfig";
import { derivedSetStage, isStageInReview } from "@/lib/submittalStageMapping";
import { compareDrawingSetPackages, getDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { submittalPipelineRollupFromSubmittals } from "@/pages/dashboard/projectMetrics";

/**
 * Decide whether a stage transition is legal.
 *
 * The corrected submittal state machine (migration 077) is linear:
 *   Not Started → IFA → OFA → BFA → R&R → OFS → IFC → Released
 * R&R is a first-class *derived* stage (submittal status); sheet writes
 * still use the 7-value drawings.stage enum (never store "R&R").
 * We allow:
 *   • Moving forward any number of steps (fast-track from IFA straight
 *     to Released is legitimate for small revisions)
 *   • Moving back to ANY earlier stage (R&R / rework cycles)
 *   • Staying put (no-op)
 *
 * The one transition we reject is moving to an unknown target stage
 * (e.g. legacy rows with dropped pre-077 stage strings). This is the
 * F13 fix — before, any string could overwrite any other stage silently.
 *
 * @param {string} from - Current stage
 * @param {string} to - Target stage
 * @returns {{ok: boolean, reason?: string}}
 */
export function validateStageTransition(from, to) {
  if (from === to) return { ok: true };
  const fromIdx = STAGE_ORDER.indexOf(from);
  const toIdx = STAGE_ORDER.indexOf(to);
  if (toIdx === -1) {
    return { ok: false, reason: `Unknown target stage "${to}"` };
  }
  if (fromIdx === -1) {
    // Coming from a legacy/unknown state — allow the move so the user can
    // recover, but only to a well-defined stage.
    return { ok: true };
  }
  // All forward/backward transitions between valid stages are allowed.
  return { ok: true };
}

/**
 * Classify a direct sheet-stage write before it reaches the entity client.
 * Linked sets belong to the Submittal workflow; only rows without a linked
 * submittal may use the legacy sheet-stage recovery path.
 */
export function classifyDrawingStageMutation(drawing, targetStage, submittalsBySetId = {}) {
  const setId = drawing?.drawing_set_id || null;
  const linked = !!setId && Number(submittalsBySetId[setId]?.total || 0) > 0;
  if (linked) {
    return {
      kind: "submittal",
      allowed: false,
      reason: `Set has a linked submittal (${submittalsBySetId[setId]?.latestStatus || "workflow"}).`,
    };
  }
  return {
    kind: "legacy-recovery",
    allowed: true,
    reason: `Sheet-stage recovery to ${targetStage} for a set without a linked submittal.`,
  };
}

/**
 * Check whether a drawing is overdue: past its due date AND still active.
 * A done/inactive sheet is never "late" — released, superseded (replaced by a
 * newer revision), or part of an approved set.
 *
 * @deprecated reads drawings.stage. Workflow source of truth is the submittals
 * table; this drives drawings-page display badges only. The set-level rollup
 * additionally suppresses overdue for submittal-closed (terminal-approved) sets.
 *
 * @param {{ due_date?: string, stage?: string, is_superseded?: boolean, set_approval_status?: string }} drawing
 * @returns {boolean}
 */
export function isOverdue(drawing) {
  if (!drawing.due_date) return false;
  if (drawing.stage === "Released") return false;
  if (drawing.is_superseded) return false;
  if (drawing.set_approval_status === "approved") return false;
  return new Date(drawing.due_date) < new Date();
}

/**
 * Calculate how many calendar days a drawing is late.
 * Returns 0 if not overdue.
 * @param {{ due_date?: string, stage?: string }} drawing
 * @returns {number}
 */
export function daysLate(drawing) {
  if (!isOverdue(drawing) || !drawing.due_date) return 0;
  return Math.max(1, Math.floor((Date.now() - new Date(drawing.due_date).getTime()) / 86400000));
}

/**
 * Determine urgency CSS class based on days late.
 * @param {number} days
 * @returns {string} CSS class name or empty string
 */
export function urgencyClass(days) {
  if (days >= 14) return "urgency-critical";
  if (days >= 7) return "urgency-danger";
  if (days > 0) return "urgency-warn";
  return "";
}

/**
 * Export a CSV transmittal log for the given drawings.
 * Triggers a browser download.
 * @param {Array} drawings
 * @param {string} [projectName]
 */
export function exportTransmittal(drawings, projectName) {
  const headers = [
    "Sheet Number", "Title", "Discipline", "Revision", "Stage",
    "Submitted Date", "Due Date", "Return Date", "Reviewer",
    "Priority", "Linked RFIs", "Notes",
  ];
  const rows = drawings.map(d => [
    d.sheet_number, d.title, d.discipline, d.revision_number, d.stage,
    d.submitted_date || "", d.due_date || "", d.return_date || "",
    d.reviewer || "", d.priority_flag ? "YES" : "",
    d.linked_rfi_ids || "", d.notes || "",
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName || "project"}_transmittal_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Compute package-level summary stats for the stats bar.
 *
 * Groups drawings by drawing_set_name to count unique packages rather
 * than individual sheets. Set-only parent rows (imported from Drive
 * with no child sheets) are also counted.
 *
 * @param {Array} drawings           — child sheet rows
 * @param {Array} [drawingSetRecords] — parent drawing_sets rows (optional)
 * @returns {{ total: number, released: number, inReview: number, overdue: number, priority: number, sheetCount: number }}
 */
export function computeStats(drawings, drawingSetRecords = []) {
  // Group drawings by set name
  const packages = {};
  drawings.forEach(d => {
    const name = (d.drawing_set_name || "").trim() || "(ungrouped)";
    if (!packages[name]) packages[name] = [];
    packages[name].push(d);
  });

  // Also count set-only parent rows (from Drive import, no child sheets)
  const childSetNames = new Set(Object.keys(packages));
  (drawingSetRecords || []).forEach(ds => {
    const name = (ds?.set_name || "").trim();
    if (name && !childSetNames.has(name)) {
      packages[name] = []; // empty = set-only
    }
  });

  const entries = Object.values(packages);

  return {
    total:      entries.length,
    released:   entries.filter(sheets => sheets.length > 0 && sheets.every(d => d.stage === "Released")).length,
    inReview:   entries.filter(sheets => sheets.some(d => IN_REVIEW_STAGES.includes(d.stage))).length,
    overdue:    entries.filter(sheets => sheets.some(d => isOverdue(d))).length,
    priority:   entries.filter(sheets => sheets.some(d => d.priority_flag)).length,
    sheetCount: drawings.length,
  };
}

/**
 * Submittal-aware variant of computeStats for the Drawings page KPI tiles.
 *
 * Sprint 5: workflow status (RELEASED, IN REVIEW) reads from submittals
 * via derivedSetStage(). The two non-workflow tiles (PACKAGES, PRIORITY)
 * stay sheet-derived because they're document-management facets, not
 * workflow assertions. OVERDUE keeps reading sheet.due_date — a
 * sheet-level deadline, not workflow.
 *
 * For each set we ask: what's the submittal-derived stage?
 *   - has at least one active submittal → use submittal status
 *   - no submittal yet                  → fall back to dominant
 *                                          sheet.stage (preserves today's
 *                                          display for legacy rows)
 *
 * @param {Array} drawings           — child sheet rows
 * @param {Array} drawingSetRecords  — parent drawing_sets rows
 * @param {Array} submittals         — all project submittals
 */
export function computeStatsFromSubmittals(drawings, drawingSetRecords = [], submittals = []) {
  // Group sheets by parent set id (FK-first; fall back to set name).
  const sheetsBySetId = new Map();
  const sheetsBySetName = new Map();
  for (const d of drawings) {
    if (d?.drawing_set_id) {
      if (!sheetsBySetId.has(d.drawing_set_id)) sheetsBySetId.set(d.drawing_set_id, []);
      sheetsBySetId.get(d.drawing_set_id).push(d);
    } else if (d?.drawing_set_name) {
      const k = d.drawing_set_name.trim();
      if (k) {
        if (!sheetsBySetName.has(k)) sheetsBySetName.set(k, []);
        sheetsBySetName.get(k).push(d);
      }
    }
  }

  // Index submittals by drawing_set_id (a single submittal may link
  // multiple sets — fan out).
  const submittalsBySetId = new Map();
  for (const s of submittals || []) {
    if (!s || s.is_deleted) continue;
    const ids = Array.isArray(s.drawing_set_ids) ? s.drawing_set_ids : [];
    for (const id of ids) {
      if (!id) continue;
      if (!submittalsBySetId.has(id)) submittalsBySetId.set(id, []);
      submittalsBySetId.get(id).push(s);
    }
  }

  // Collect a "package" view: every parent drawing_sets row, plus any
  // legacy ungrouped sheets that share a drawing_set_name.
  const packages = [];
  const seenIds = new Set();
  for (const ds of drawingSetRecords || []) {
    if (!ds?.id) continue;
    seenIds.add(ds.id);
    const sheetsHere = sheetsBySetId.get(ds.id) || sheetsBySetName.get(ds.set_name?.trim()) || [];
    const subsHere = submittalsBySetId.get(ds.id) || [];
    packages.push({ id: ds.id, name: ds.set_name, sheets: sheetsHere, submittals: subsHere });
  }
  // Legacy sheets without a parent FK — group by name.
  for (const [name, sheets] of sheetsBySetName.entries()) {
    if (sheets.some((s) => s.drawing_set_id && seenIds.has(s.drawing_set_id))) continue;
    packages.push({ id: null, name, sheets, submittals: [] });
  }

  let released = 0;
  let inReview = 0;
  let overdue  = 0;
  let priority = 0;
  for (const pkg of packages) {
    const stage = derivedSetStage(pkg.submittals, pkg.sheets);
    if (stage === "Released") released++;
    else if (isStageInReview(stage)) inReview++;
    if (pkg.sheets.some((d) => isOverdue(d))) overdue++;
    if (pkg.sheets.some((d) => d.priority_flag)) priority++;
  }

  return {
    total:      packages.length,
    released,
    inReview,
    overdue,
    priority,
    sheetCount: drawings.length,
  };
}

/**
 * Compute per-discipline count map.
 * @param {Array} drawings
 * @param {string[]} disciplines
 * @returns {Record<string, number>}
 */
export function computeDisciplineCounts(drawings, disciplines) {
  const counts = { ALL: drawings.length };
  disciplines.forEach(d => {
    counts[d] = drawings.filter(x => x.discipline === d).length;
  });
  return counts;
}

/**
 * Build revision-control alert objects from current drawing + RFI data.
 *
 * @deprecated reads drawings.set_approval_status (legacy display only).
 * Workflow source of truth is the `submittals` table — read submittals
 * for active workflow rollups. This helper is retained for legacy
 * revision-alert display on the Drawings page.
 *
 * @param {Array} drawings
 * @param {Record<string, object>} rfiMap
 * @returns {Array<object>}
 */
export function buildRevisionAlerts(drawings, rfiMap) {
  const alerts = [];

  // 1. Unacknowledged revisions
  const unacknowledged = drawings.filter(d =>
    Number(d.revision_number || 0) > 0 &&
    !d.set_approval_status &&
    d.stage !== "Released"
  );
  if (unacknowledged.length > 0) {
    alerts.push({
      type: "warning",
      icon: "⚠",
      title: `${unacknowledged.length} Unacknowledged Revision${unacknowledged.length !== 1 ? "s" : ""}`,
      detail: `${unacknowledged.map(d => d.sheet_number).slice(0, 5).join(", ")}${unacknowledged.length > 5 ? ` +${unacknowledged.length - 5} more` : ""} — revised but not yet reviewed/approved`,
      sheets: unacknowledged,
      color: "var(--status-warning)",
      bg: "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.25)",
    });
  }

  // 2. Superseded drawings still active
  const superseded = drawings.filter(d =>
    (d.is_superseded || d.set_approval_status === "superseded") &&
    d.stage !== "Released"
  );
  if (superseded.length > 0) {
    alerts.push({
      type: "danger",
      icon: "⛔",
      title: `${superseded.length} Superseded Drawing${superseded.length !== 1 ? "s" : ""} Still Active`,
      detail: `${superseded.map(d => d.sheet_number).slice(0, 5).join(", ")}${superseded.length > 5 ? ` +${superseded.length - 5} more` : ""} — marked superseded but not at IFC stage. Remove or replace.`,
      sheets: superseded,
      color: "var(--status-error)",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.25)",
    });
  }

  // 3. Drawings blocked by open RFIs
  const withOpenRFIs = drawings.filter(d => {
    if (!d.linked_rfi_ids) return false;
    const rfiNums = d.linked_rfi_ids.split(",").map(s => s.trim());
    return rfiNums.some(num => {
      const rfi = rfiMap[num];
      return rfi && rfi.status !== "Closed" && rfi.status !== "Answered";
    });
  });
  if (withOpenRFIs.length > 0) {
    alerts.push({
      type: "info",
      icon: "!",
      title: `${withOpenRFIs.length} Drawing${withOpenRFIs.length !== 1 ? "s" : ""} Blocked by Open RFIs`,
      detail: `${withOpenRFIs.map(d => d.sheet_number).slice(0, 5).join(", ")}${withOpenRFIs.length > 5 ? ` +${withOpenRFIs.length - 5} more` : ""} — linked RFIs still unresolved`,
      sheets: withOpenRFIs,
      color: "var(--status-info)",
      bg: "rgba(59,130,246,0.06)",
      border: "rgba(59,130,246,0.25)",
    });
  }

  // 4. Rejected drawings needing resubmission
  const rejected = drawings.filter(d => d.set_approval_status === "rejected");
  if (rejected.length > 0) {
    alerts.push({
      type: "danger",
      icon: "X",
      title: `${rejected.length} Rejected Drawing${rejected.length !== 1 ? "s" : ""} Need Resubmission`,
      detail: `${rejected.map(d => d.sheet_number).slice(0, 5).join(", ")}${rejected.length > 5 ? ` +${rejected.length - 5} more` : ""}`,
      sheets: rejected,
      color: "var(--status-error)",
      bg: "rgba(239,68,68,0.06)",
      border: "rgba(239,68,68,0.25)",
    });
  }

  return alerts;
}

// ─── Grouping + aggregate helpers ───────────────────────────────────────────

const UNGROUPED_KEY = "__ungrouped__";
const UNGROUPED_LABEL = "UNGROUPED SHEETS";

/**
 * Group drawings into drawing sets. Identity is the FK `drawing_set_id` when
 * present; legacy rows that only carry the text `drawing_set_name` fall back
 * to a synthetic `name:<trimmed>` key. Sheets with neither go to UNGROUPED.
 *
 * Display names come from `drawingSetMap[id].set_name` when we have the
 * parent row; otherwise we use the legacy text column. This is the F8 fix
 * from the audit: source-of-truth is now the parent FK, not the denormalized
 * string on the child row.
 *
 * Set-level-only rows (drawing_sets records with zero child drawings — e.g.
 * BFA submittal round-trips imported from Drive at the set level) are seeded
 * as groups from `drawingSetMap` after the drawings pass, so they appear in
 * the list with parent-derived aggregates (stage_summary, set_approval_status,
 * issued_date, set_approved_date, file_url).
 */
export function groupByDrawingSet(drawings, drawingSetMap = {}) {
  const buckets = new Map();
  drawings.forEach((d) => {
    const setId = d.drawing_set_id || null;
    const legacyName = (d.drawing_set_name || "").trim();
    const key = setId ? `id:${setId}` : legacyName ? `name:${legacyName}` : UNGROUPED_KEY;
    if (!buckets.has(key)) {
      const parent = setId ? drawingSetMap[setId] : null;
      const displayName = (parent?.set_name || legacyName || "").trim();
      buckets.set(key, {
        key,
        setId,
        name: displayName || UNGROUPED_LABEL,
        parent,
        sheets: [],
      });
    }
    buckets.get(key).sheets.push(d);
  });

  // Seed empty buckets for any drawing_sets record with no child drawings.
  // These are the set-level-only rows imported from the Drive BFA folder
  // walk — they have no per-sheet rows yet (Phase 2 work), but still need
  // to appear in the list so the user can see submittal round-trip state
  // (approved / pending / stage_summary) and jump to the Drive folder.
  Object.values(drawingSetMap).forEach((parent) => {
    if (!parent?.id) return;
    const key = `id:${parent.id}`;
    if (buckets.has(key)) return;
    buckets.set(key, {
      key,
      setId: parent.id,
      name: (parent.set_name || "").trim() || UNGROUPED_LABEL,
      parent,
      sheets: [],
    });
  });

  // Compute aggregates for each group
  const groups = [];
  for (const group of buckets.values()) {
    const sheets = group.sheets.slice().sort((a, b) => {
      const an = (a.sheet_number || "").toString();
      const bn = (b.sheet_number || "").toString();
      return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
    });

    const parent = group.parent || null;
    const setOnly = sheets.length === 0 && !!parent;

    // Stage rollup
    const stageCounts = {};
    STAGE_ORDER.forEach((k) => { stageCounts[k] = 0; });
    sheets.forEach((s) => {
      const k = s.stage || "Not Started";
      stageCounts[k] = (stageCounts[k] || 0) + 1;
    });
    const releasedCount = stageCounts["Released"] || 0;

    // Date rollups
    const submittedDates = sheets.map((s) => s.submitted_date).filter(Boolean).sort();
    const dueDates = sheets.map((s) => s.due_date).filter(Boolean).sort();
    let earliestSubmitted = submittedDates[0] || null;
    let earliestDue = dueDates[0] || null;

    // Overdue rollup
    const overdueCount = sheets.filter((s) => isOverdue(s)).length;
    const maxLate = sheets.reduce((m, s) => Math.max(m, daysLate(s) || 0), 0);

    // AI extraction rollup — used for "X of Y processed" summary badges.
    // Rows without the new status column are treated as already processed
    // (legacy rows) so migration doesn't make the UI look broken.
    const aiProcessed = sheets.filter((s) => !s.ai_extraction_status || s.ai_extraction_status === "Processed").length;
    const aiNeedsReview = sheets.filter((s) => s.ai_extraction_status === "NeedsReview").length;
    const aiExtracting = sheets.filter((s) => s.ai_extraction_status === "Extracting" || s.ai_extraction_status === "Pending").length;
    const aiFailed = sheets.filter((s) => s.ai_extraction_status === "Failed" || s.upload_status === "Failed").length;

    // Approval rollup — all sheets in the set should share status if bulk-approved
    const statuses = new Set(sheets.map((s) => s.set_approval_status).filter(Boolean));
    let aggregateStatus = statuses.size === 1 ? [...statuses][0] : null;

    // Disciplines present
    const disciplines = new Set(sheets.map((s) => s.discipline).filter(Boolean));

    // Priority
    const hasPriority = sheets.some((s) => s.priority_flag);

    // Latest revision (numeric max)
    const revNums = sheets
      .map((s) => Number(String(s.revision_number || "0").replace(/[^\d]/g, "")))
      .filter((n) => !isNaN(n));
    let maxRev = revNums.length ? Math.max(...revNums) : 0;

    // Parent-derived fallbacks for set-level-only rows (no child sheets).
    // We pull from the drawing_sets row so the group summary shows something
    // real instead of a row full of em-dashes.
    let stageSummary = null;
    let driveUrl = null;
    let revisionHistory = null;
    let eventCount = null;
    if (setOnly) {
      aggregateStatus = parent.set_approval_status || null;
      stageSummary = parent.stage_summary || null;
      driveUrl = parent.file_url || null;
      revisionHistory = parent.revision_history || null;
      eventCount = parent.metadata?.event_count ?? null;
      if (parent.discipline) disciplines.add(parent.discipline);
      if (!earliestSubmitted && parent.issued_date) earliestSubmitted = parent.issued_date;
      if (!earliestDue && parent.set_approved_date) earliestDue = parent.set_approved_date;
    }

    groups.push({
      key: group.key,
      setId: group.setId,
      name: group.name,
      setNumber: getDrawingSetNumber(parent || group),
      isUngrouped: group.key === UNGROUPED_KEY,
      setOnly,
      parent,
      sheets,
      aggregates: {
        total: sheets.length,
        stageCounts,
        releasedCount,
        percentReleased: sheets.length > 0 ? Math.round((releasedCount / sheets.length) * 100) : 0,
        earliestSubmitted,
        earliestDue,
        overdueCount,
        maxLate,
        aggregateStatus,
        disciplines: [...disciplines],
        hasPriority,
        maxRev,
        aiProcessed,
        aiNeedsReview,
        aiExtracting,
        aiFailed,
        stageSummary,
        driveUrl,
        revisionHistory,
        eventCount,
      },
    });
  }

  // Action-first default ordering: sets needing attention (overdue, priority,
  // failed or needs-review AI extraction) float to the top so the register
  // answers "what needs action?" at a glance. Package order (drawing-set /
  // package number, then natural name) is preserved WITHIN each partition, and
  // ungrouped loose sheets always stay last.
  const setNeedsAction = (g) => {
    if (g.isUngrouped) return false;
    const a = g.aggregates;
    return a.overdueCount > 0 || a.hasPriority || a.aiNeedsReview > 0 || a.aiFailed > 0;
  };
  groups.sort((x, y) => {
    if (x.isUngrouped !== y.isUngrouped) return x.isUngrouped ? 1 : -1;
    const ax = setNeedsAction(x);
    const ay = setNeedsAction(y);
    if (ax !== ay) return ax ? -1 : 1;
    return compareDrawingSetPackages(x, y);
  });

  return groups;
}

// ─── Drawings page derivations ──────────────────────────────────────────────
//
// Pure derivation helpers extracted from the Drawings page container so its
// useMemo wrappers stay thin and these are unit-testable. The memo wrappers in
// Drawings.jsx keep their exact dependency arrays and just call these.

/** Build a `rfi_number -> rfi` lookup map. */
export function buildRfiMap(rfis) {
  const map = {};
  rfis.forEach(r => { if (r.rfi_number) map[r.rfi_number] = r; });
  return map;
}

/**
 * Reverse-index submittals by drawing_set_id → { total, open, latestStatus,
 * latestId }. A submittal links a uuid[] of sets, so each fans out. "Open" =
 * not in the terminal-approved set (passed in as `terminalApprovedStatuses`,
 * the single source of truth) nor "Void". Submittals arrive pre-sorted by
 * -submitted_date, so the FIRST encountered status for a set is the latest.
 */
export function buildSubmittalsBySetId(submittals, terminalApprovedStatuses) {
  const CLOSED = new Set([...terminalApprovedStatuses, "Void"]);
  const map = {};
  (submittals || []).forEach((s) => {
    if (s.is_deleted) return;
    const ids = Array.isArray(s.drawing_set_ids) ? s.drawing_set_ids : [];
    const open = !CLOSED.has(s.status);
    ids.forEach((id) => {
      if (!id) return;
      if (!map[id]) {
        map[id] = {
          total: 0,
          open: 0,
          latestStatus: s.status || null,
          latestId: s.id || null,
        };
      }
      map[id].total += 1;
      if (open) map[id].open += 1;
    });
  });
  return map;
}

/**
 * Filter drawings by free-text search (sheet #, title, reviewer, spec section),
 * discipline, and the stage filter (real stage keys plus the `_overdue`,
 * `_inReview`, `_priority` pseudo-stages).
 */
export function filterDrawings(drawings, { search, discipline, stageFilter }) {
  let list = [...drawings];
  if (search.trim()) {
    const q = search.toLowerCase();
    list = list.filter(d =>
      d.sheet_number?.toLowerCase().includes(q) ||
      d.title?.toLowerCase().includes(q) ||
      d.reviewer?.toLowerCase().includes(q) ||
      d.spec_section?.toLowerCase().includes(q)
    );
  }
  if (discipline !== "ALL") list = list.filter(d => d.discipline === discipline);
  if (stageFilter !== "ALL") {
    if (stageFilter === "_overdue") list = list.filter(d => isOverdue(d));
    else if (stageFilter === "_inReview") list = list.filter(d => IN_REVIEW_STAGES.includes(d.stage));
    else if (stageFilter === "_priority") list = list.filter(d => d.priority_flag);
    else list = list.filter(d => d.stage === stageFilter);
  }
  return list;
}

/** Group drawings by their legacy `drawing_set_name` string → { name: sheets[] }. */
export function groupByDrawingSetName(drawings) {
  const map = {};
  drawings.forEach(d => {
    const name = d.drawing_set_name?.trim();
    if (!name) return;
    if (!map[name]) map[name] = [];
    map[name].push(d);
  });
  return map;
}

/** Return a stable identity for a drawing set, preferring the FK. */
export function getDrawingSetIdentity(drawing) {
  if (drawing?.drawing_set_id) return `id:${drawing.drawing_set_id}`;
  const name = String(drawing?.drawing_set_name || "").trim();
  return name ? `name:${name}` : null;
}

/**
 * Deduped, sorted set-name list from the legacy name grouping + real
 * drawing_sets parent rows. Powers the upload modal autocomplete + duplicate
 * detection.
 */
export function computeExistingSetNames(drawingSets, drawingSetRecords) {
  const names = new Set(Object.keys(drawingSets));
  drawingSetRecords.forEach(ds => {
    if (ds?.set_name?.trim()) names.add(ds.set_name.trim());
  });
  return [...names].sort();
}

/** Build an `id -> parent drawing_sets row` lookup map. */
export function buildDrawingSetMap(drawingSetRecords) {
  const map = {};
  drawingSetRecords.forEach(ds => { if (ds?.id) map[ds.id] = ds; });
  return map;
}

/**
 * The single drawing-set name shared across the current selection, or null
 * when the selection is empty or spans multiple sets.
 */
export function computeSelectedSetName(selected, drawings) {
  if (selected.size === 0) return null;
  const names = new Set();
  for (const id of selected) {
    const d = drawings.find(x => x.id === id);
    if (d?.drawing_set_name?.trim()) names.add(d.drawing_set_name.trim());
  }
  return names.size === 1 ? [...names][0] : null;
}

/**
 * Submittal Stage Pipeline counts + active index. Counts derive from submittals
 * via submittalPipelineRollupFromSubmittals (one count per active submittal,
 * mapped to a stage by status+BIC+approved_date), plus a Not-Started bucket
 * counting packages with no submittal yet AND no released sheet. Returns
 * `{ pipeStages, activeIdx }` for the caller to render.
 */
export function computeStagePipeline({ submittals, drawingSetRecords, drawings, stageFilter }) {
  const rollup = submittalPipelineRollupFromSubmittals(submittals);
  // Count packages with no submittal as Not Started — they're
  // the inverse of every set that's already represented in the
  // submittal rollup.
  const packagesWithSubmittal = new Set();
  (submittals || []).forEach((s) => {
    if (!s || s.is_deleted) return;
    if (s.status === "Void") return;
    const ids = Array.isArray(s.drawing_set_ids) ? s.drawing_set_ids : [];
    ids.forEach((id) => packagesWithSubmittal.add(id));
  });
  const notStartedCount = drawingSetRecords.filter(
    (ds) => ds?.id && !packagesWithSubmittal.has(ds.id) &&
      derivedSetStage([], (drawings || []).filter((d) => d.drawing_set_id === ds.id)) === "Not Started"
  ).length;
  // WORKFLOW_STAGES (not STAGES): the pipeline shows submittal-DERIVED
  // stages, so the first-class R&R bucket (2026-07-25) gets its own
  // chevron instead of silently dropping R&R rows. Display only — the
  // sheet stage filter still operates over the 7-value sheet enum.
  const counts = WORKFLOW_STAGES.reduce((acc, s) => {
    acc[s.key] = s.key === "Not Started"
      ? notStartedCount
      : (rollup.counts[s.key] || 0);
    return acc;
  }, {});
  // Pipeline stages (use only the forward-flow stages; Released is the terminal)
  const pipeStages = WORKFLOW_STAGES.map((s) => ({
    id: s.key,
    label: s.label,
    color: s.color,
    count: counts[s.key] || 0,
  }));
  // Active = current stage filter if it's a real stage, else the first
  // non-empty non-terminal stage (the bottleneck).
  let activeIdx = 0;
  const filteredActive = stageFilter !== "ALL" && !stageFilter.startsWith("_")
    ? WORKFLOW_STAGES.findIndex((s) => s.key === stageFilter)
    : -1;
  if (filteredActive >= 0) {
    activeIdx = filteredActive;
  } else {
    for (let i = WORKFLOW_STAGES.length - 2; i >= 1; i--) {
      if (counts[WORKFLOW_STAGES[i].key] > 0) { activeIdx = i; break; }
    }
  }
  return { pipeStages, activeIdx };
}
