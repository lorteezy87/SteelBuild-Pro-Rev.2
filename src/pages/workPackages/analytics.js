import { isApprovedForFab } from "@/lib/exports/fabRelease";
import { isRejectedSheet, isSupersededSheet, isUnresolvedCurrentRevision } from "@/lib/fabReleaseGate";

const PHASE_ORDER = ["Detailing", "Fabrication", "Delivery", "Erection"];
const CLOSED_STATUSES = new Set(["complete", "completed", "closed", "cancelled", "canceled"]);
// Loose "has some approval" set — kept ONLY for the informational
// `approvedCount` / `hasApproved` fields. It is deliberately NOT what decides
// fabrication readiness: it includes mid-flow outcomes ("Approved",
// "Approved as Noted", "OFS") that the canonical gate does not treat as
// release-ready. See fabReadyState below.
const APPROVED_DRAWING_STAGES = new Set([
  "Released",
  "IFC",
  "Issued for Construction",
  "OFS",
  "Approved",
  "Approved as Noted",
]);

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPercent(value) {
  return Math.min(100, Math.max(0, num(value)));
}

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function todayStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isClosedStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return CLOSED_STATUSES.has(normalized);
}

export function parseLinkedIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function drawingState(wp, drawingsById) {
  const ids = parseLinkedIds(wp.linked_drawing_ids);
  const linked = ids.map((id) => drawingsById.get(String(id))).filter(Boolean);
  const approved = linked.filter((drawing) =>
    APPROVED_DRAWING_STAGES.has(drawing.stage || drawing.status)
  );

  // ── Fabrication readiness, per the CANONICAL gate ──────────────────────
  // Work Packages previously called a package fab-ready when ANY ONE linked
  // sheet sat in the loose stage set above. Fab Release evaluates every sheet
  // and fails closed on rejected / superseded / not-IFC sheets. A package with
  // one approved sheet and six blocked ones therefore read "ready, 0 blocked"
  // here while Fab Release reported "6 blocked" on the same data.
  //
  // Reuse the gate's own per-sheet predicates so the two surfaces can't
  // diverge again, and require EVERY linked sheet to pass. Evidence-backed
  // approvals (submittals / revisions) aren't loaded on this page, so
  // isApprovedForFab runs on sheet state alone — that can only be more
  // conservative than the gate, never falsely green.
  const rejected = linked.filter((d) => isRejectedSheet(d));
  const superseded = linked.filter((d) => isSupersededSheet(d) && !isRejectedSheet(d));
  // A sheet is fab-ready only if the release predicate passes AND the gate
  // wouldn't block it for rejection/supersession. isApprovedForFab checks
  // superseded/void/on_hold release states but not the rejected disposition,
  // which is a separate blocking reason in computeFabReleaseGate.
  const sheetIsFabReady = (d) =>
    isApprovedForFab(d) &&
    !isRejectedSheet(d) &&
    !isSupersededSheet(d) &&
    !isUnresolvedCurrentRevision(d);
  const fabReady = linked.filter(sheetIsFabReady);
  const blockedSheets = linked.filter((d) => !sheetIsFabReady(d));
  // Unresolvable links count as blocked: we can't prove a sheet we can't see.
  const missingLinks = ids.length - linked.length;
  const blockedCount = blockedSheets.length + missingLinks;

  return {
    linkedCount: ids.length,
    knownCount: linked.length,
    approvedCount: approved.length,
    missingLinks,
    hasAny: ids.length > 0,
    hasApproved: approved.length > 0,
    allKnownApproved: linked.length > 0 && approved.length === linked.length,
    // Canonical fab-readiness (matches the Fab Release gate's direction)
    fabReadyCount: fabReady.length,
    rejectedCount: rejected.length,
    supersededCount: superseded.length,
    blockedCount,
    /** Every linked sheet is release-ready and at least one exists. */
    allFabReady: ids.length > 0 && blockedCount === 0,
  };
}

function phaseIndex(phase) {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

export function getWorkPackageSignals(wp, options = {}) {
  const drawingsById = options.drawingsById || new Map();
  const deliveriesByWp = options.deliveriesByWp || new Map();
  const today = options.today ? dateValue(options.today) || options.today : todayStart();
  if (today?.setHours) today.setHours(0, 0, 0, 0);

  const status = wp.status || "Not Started";
  const phase = PHASE_ORDER.includes(wp.phase) ? wp.phase : "Detailing";
  const progress = clampPercent(wp.percent_complete);
  const complete = isClosedStatus(status) || progress >= 100;
  const endDate = dateValue(wp.scheduled_end_date || wp.due_date);
  const overdue = Boolean(endDate && endDate < today && !complete);
  const drawing = drawingState(wp, drawingsById);
  const phaseIdx = phaseIndex(phase);
  const inProductionPhase = phaseIdx >= phaseIndex("Fabrication");
  const inDeliveryOrField = phaseIdx >= phaseIndex("Delivery");
  const inFieldPhase = phaseIdx >= phaseIndex("Erection");
  const totalBudgetHours = num(wp.shop_hours_budget) + num(wp.field_hours_budget);
  const totalActualHours = num(wp.shop_hours_actual) + num(wp.field_hours_actual);
  const hourBurn = totalBudgetHours > 0 ? Math.round((totalActualHours / totalBudgetHours) * 100) : 0;
  const deliveries = deliveriesByWp.get(wp.id) || [];

  const flags = [];
  if (status === "On Hold") flags.push({ key: "on_hold", label: "On hold", severity: "high" });
  if (overdue) flags.push({ key: "overdue", label: "Past plan date", severity: "high" });
  if (inProductionPhase && !drawing.hasAny) {
    flags.push({ key: "no_drawings", label: "No linked drawings", severity: "high" });
  } else if (inProductionPhase && !drawing.allFabReady) {
    // Sheet-level count so this agrees with Fab Release instead of implying
    // "released" the moment a single sheet is approved.
    flags.push({
      key: "drawings_not_released",
      label: drawing.blockedCount > 0
        ? `${drawing.blockedCount} sheet${drawing.blockedCount === 1 ? "" : "s"} not released`
        : "Drawings not released",
      severity: "high",
    });
  }
  // Data-integrity contradiction: 100% complete but still an open status.
  // Surfaced rather than silently coerced either way.
  if (progress >= 100 && !isClosedStatus(status)) {
    flags.push({ key: "pct_status_mismatch", label: `100% but marked ${status}`, severity: "medium" });
  }
  if (inDeliveryOrField && !wp.load_list_complete) {
    flags.push({ key: "load_list", label: "Load list open", severity: "medium" });
  }
  if (inFieldPhase && !wp.sequence_confirmed) {
    flags.push({ key: "sequence", label: "Sequence open", severity: "medium" });
  }
  if (phase !== "Detailing" && !complete && !String(wp.crew || "").trim()) {
    flags.push({ key: "no_crew", label: "No crew", severity: "medium" });
  }
  if (totalBudgetHours > 0 && totalActualHours > totalBudgetHours) {
    flags.push({ key: "labor_over", label: "Labor over budget", severity: "medium" });
  }

  const high = flags.some((flag) => flag.severity === "high");
  const medium = flags.some((flag) => flag.severity === "medium");
  const readinessChecks = [
    drawing.allFabReady || !inProductionPhase,
    Boolean(wp.vif_confirmed) || !inProductionPhase,
    Boolean(wp.load_list_complete) || !inDeliveryOrField,
    Boolean(wp.sequence_confirmed) || !inFieldPhase,
    Boolean(String(wp.crew || "").trim()) || phase === "Detailing" || complete,
    status !== "On Hold",
  ];
  const readinessScore = Math.round(
    (readinessChecks.filter(Boolean).length / readinessChecks.length) * 100
  );

  return {
    phase,
    status,
    progress,
    complete,
    overdue,
    flags,
    risk: high ? "high" : medium ? "medium" : "clear",
    readinessScore,
    drawing,
    deliveriesCount: deliveries.length,
    totalBudgetHours,
    totalActualHours,
    hourBurn,
  };
}

export function buildWorkPackageMetrics(workPackages = [], drawings = [], deliveries = []) {
  const drawingsById = new Map(drawings.map((drawing) => [String(drawing.id), drawing]));
  const deliveriesByWp = new Map();
  for (const delivery of deliveries || []) {
    if (!delivery?.work_package_id || delivery.is_deleted) continue;
    const key = String(delivery.work_package_id);
    const next = deliveriesByWp.get(key) || [];
    next.push(delivery);
    deliveriesByWp.set(key, next);
  }

  const enriched = workPackages.map((wp) => ({
    ...wp,
    _signals: getWorkPackageSignals(wp, { drawingsById, deliveriesByWp }),
  }));

  const totalTons = enriched.reduce((sum, wp) => sum + num(wp.tonnage), 0);
  const totalBudgetHours = enriched.reduce((sum, wp) => sum + wp._signals.totalBudgetHours, 0);
  const totalActualHours = enriched.reduce((sum, wp) => sum + wp._signals.totalActualHours, 0);
  const progress = totalTons > 0
    ? Math.round(enriched.reduce((sum, wp) => sum + num(wp.tonnage) * wp._signals.progress, 0) / totalTons)
    : Math.round(enriched.reduce((sum, wp) => sum + wp._signals.progress, 0) / Math.max(1, enriched.length));

  const phaseRollup = PHASE_ORDER.map((phase) => {
    const items = enriched.filter((wp) => wp._signals.phase === phase);
    const tons = items.reduce((sum, wp) => sum + num(wp.tonnage), 0);
    return {
      phase,
      count: items.length,
      tons,
      progress: tons > 0
        ? Math.round(items.reduce((sum, wp) => sum + num(wp.tonnage) * wp._signals.progress, 0) / tons)
        : Math.round(items.reduce((sum, wp) => sum + wp._signals.progress, 0) / Math.max(1, items.length)),
      highRisk: items.filter((wp) => wp._signals.risk === "high").length,
      mediumRisk: items.filter((wp) => wp._signals.risk === "medium").length,
    };
  });

  const highRisk = enriched.filter((wp) => wp._signals.risk === "high");
  const mediumRisk = enriched.filter((wp) => wp._signals.risk === "medium");
  const onHold = enriched.filter((wp) => wp._signals.status === "On Hold");
  const drawingGaps = enriched.filter((wp) =>
    wp._signals.flags.some((flag) => flag.key === "no_drawings" || flag.key === "drawings_not_released")
  );
  const overdue = enriched.filter((wp) => wp._signals.overdue);
  // Fail-closed: every linked sheet must be release-ready, same direction as
  // the Fab Release gate. `hasApproved` (any one sheet) used to qualify here.
  const readyForFab = enriched.filter((wp) =>
    wp._signals.phase === "Detailing" &&
    wp._signals.drawing.allFabReady &&
    wp._signals.status !== "On Hold"
  );
  /** Packages with at least one sheet the fab gate would block. */
  const fabBlocked = enriched.filter((wp) => (wp._signals.drawing.blockedCount ?? 0) > 0);
  const blockedSheetCount = enriched.reduce(
    (sum, wp) => sum + (wp._signals.drawing.blockedCount ?? 0),
    0,
  );
  const readyForShip = enriched.filter((wp) =>
    wp._signals.phase === "Fabrication" &&
    wp._signals.progress >= 90 &&
    wp._signals.status !== "On Hold"
  );
  const fieldReady = enriched.filter((wp) =>
    wp._signals.phase === "Delivery" &&
    wp._signals.progress >= 90 &&
    wp._signals.readinessScore >= 75
  );

  return {
    enriched,
    totalCount: enriched.length,
    totalTons,
    progress,
    totalBudgetHours,
    totalActualHours,
    laborBurn: totalBudgetHours > 0 ? Math.round((totalActualHours / totalBudgetHours) * 100) : 0,
    phaseRollup,
    highRisk,
    mediumRisk,
    onHold,
    drawingGaps,
    overdue,
    readyForFab,
    fabBlocked,
    blockedSheetCount,
    readyForShip,
    fieldReady,
  };
}

export function sortWorkPackagesForExecution(a, b) {
  const riskRank = { high: 0, medium: 1, clear: 2 };
  const riskDiff = riskRank[a._signals?.risk || "clear"] - riskRank[b._signals?.risk || "clear"];
  if (riskDiff !== 0) return riskDiff;
  const phaseDiff = phaseIndex(a._signals?.phase || a.phase) - phaseIndex(b._signals?.phase || b.phase);
  if (phaseDiff !== 0) return phaseDiff;
  const dateA = a.scheduled_end_date || a.due_date || "9999-12-31";
  const dateB = b.scheduled_end_date || b.due_date || "9999-12-31";
  if (dateA !== dateB) return String(dateA).localeCompare(String(dateB));
  return String(a.wp_number || "").localeCompare(String(b.wp_number || ""));
}

export { PHASE_ORDER };
