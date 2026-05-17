import { sortDrawingSetPackages } from "@/lib/drawingSetOrdering";

export const FAB_STAGES = [
  {
    id: "drawings_approved",
    label: "Drawings Approved",
    short: "DWG",
    color: "var(--accent)",
    description: "Released drawing packages exist and the work is ready to prep.",
  },
  {
    id: "material_on_hand",
    label: "Material On Hand",
    short: "MATL",
    color: "var(--secondary)",
    description: "VIF and load-list checks are ready for release planning.",
  },
  {
    id: "shop_released",
    label: "Released To Shop",
    short: "REL",
    color: "var(--status-warning)",
    description: "Package has been issued to the shop for fabrication.",
  },
  {
    id: "in_fabrication",
    label: "In Fabrication",
    short: "FAB",
    color: "var(--phase-fab)",
    description: "Active shop work is underway.",
  },
  {
    id: "fabricated",
    label: "Fabricated",
    short: "DONE",
    color: "var(--status-info)",
    description: "Fabrication is substantially complete before finish.",
  },
  {
    id: "finish_treatment",
    label: "Paint / Galv",
    short: "FIN",
    color: "#B45309",
    description: "Paint, galvanizing, or final finish treatment.",
  },
  {
    id: "ready_to_ship",
    label: "Ready To Ship",
    short: "RTS",
    color: "var(--status-success)",
    description: "Complete or beyond fabrication and available to logistics.",
  },
];

export const STATUS_ORDER = ["Not Started", "In Progress", "Complete", "On Hold"];
export const BOARD_LANES = ["Blocked", "Ready For Release", "Released", "In Shop", "Ready To Ship"];

const STAGE_ORDER = FAB_STAGES.map((stage) => stage.id);
const CLOSED_STATUSES = new Set(["complete", "completed", "closed", "cancelled", "canceled"]);
const RELEASED_DRAWING_STATES = new Set([
  "released",
  "ifc",
  "issued for construction",
  "ofs",
  "approved",
  "approved as noted",
  "approved_as_noted",
]);
const DAY_MS = 24 * 60 * 60 * 1000;

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function clampPercent(value) {
  return Math.min(100, Math.max(0, num(value)));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isClosedStatus(status) {
  return CLOSED_STATUSES.has(normalize(status));
}

function dateValue(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function todayStart(input) {
  const today = input ? dateValue(input) : new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function stageIndex(stageId) {
  const idx = STAGE_ORDER.indexOf(stageId);
  return idx >= 0 ? idx : 0;
}

function normalizeStageId(stageId) {
  return STAGE_ORDER.includes(stageId) ? stageId : "drawings_approved";
}

function drawingSetKey(drawing) {
  if (drawing?.drawing_set_id) return `id:${drawing.drawing_set_id}`;
  const legacyName = String(drawing?.drawing_set_name || "").trim();
  if (legacyName) return `name:${legacyName.toLowerCase()}`;
  return `sheet:${drawing?.id || drawing?.sheet_number || "unknown"}`;
}

function drawingIsReleasedForFab(drawing) {
  if (!drawing || drawing.is_deleted || drawing.is_superseded) return false;
  const candidates = [
    drawing.stage,
    drawing.status,
    drawing.set_approval_status,
    drawing.ifc_status,
  ];
  return candidates.some((value) => RELEASED_DRAWING_STATES.has(normalize(value)));
}

export function parseLinkedIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDrawingContext(wp, drawingsById, drawingSetsById) {
  const ids = parseLinkedIds(wp.linked_drawing_ids);
  const linked = ids.map((id) => drawingsById.get(String(id))).filter(Boolean);
  const released = linked.filter(drawingIsReleasedForFab);
  const setMap = new Map();

  for (const drawing of linked) {
    const key = drawingSetKey(drawing);
    const parent = drawing.drawing_set_id ? drawingSetsById.get(String(drawing.drawing_set_id)) : null;
    const existing = setMap.get(key);
    const next = existing || {
      id: parent?.id || drawing.drawing_set_id || key,
      set_name: parent?.set_name || drawing.drawing_set_name || drawing.sheet_number || "Ungrouped drawing",
      name: parent?.set_name || drawing.drawing_set_name || drawing.sheet_number || "Ungrouped drawing",
      metadata: parent?.metadata,
      drawing_set_number: parent?.drawing_set_number,
      set_number: parent?.set_number,
      package_number: parent?.package_number,
      isUngrouped: !parent && !drawing.drawing_set_name,
      sheetCount: 0,
      releasedCount: 0,
    };
    next.sheetCount += 1;
    if (drawingIsReleasedForFab(drawing)) next.releasedCount += 1;
    setMap.set(key, next);
  }

  const packages = sortDrawingSetPackages(Array.from(setMap.values()));
  return {
    linkedIds: ids,
    linkedDrawings: linked,
    linkedCount: ids.length,
    knownCount: linked.length,
    missingLinks: Math.max(0, ids.length - linked.length),
    releasedCount: released.length,
    hasAny: ids.length > 0,
    hasReleased: released.length > 0,
    allKnownReleased: linked.length > 0 && released.length === linked.length,
    packages,
    packageNames: packages.map((pkg) => pkg.set_name || pkg.name).filter(Boolean),
  };
}

export function getFabStage(wp, drawing = null) {
  const phase = wp.phase || "";
  const status = wp.status || "";
  const pct = clampPercent(wp.percent_complete);
  const complete = isClosedStatus(status) || pct >= 100;

  if (["Delivery", "Erection", "Installation", "Closeout"].includes(phase)) return "ready_to_ship";
  if (complete) return "ready_to_ship";

  if (phase === "Fabrication") {
    if (pct >= 82) return "finish_treatment";
    if (pct >= 65) return "fabricated";
    if (pct >= 25 || status === "In Progress") return "in_fabrication";
    if (wp.released_date) return "shop_released";
    if (wp.vif_confirmed && wp.load_list_complete) return "material_on_hand";
    return "drawings_approved";
  }

  if (phase === "Detailing") {
    if (wp.vif_confirmed && wp.load_list_complete) return "material_on_hand";
    if (status === "Complete" || drawing?.hasReleased) return "drawings_approved";
  }

  return "drawings_approved";
}

export function getWorkPackageDisplayName(wp) {
  return wp.name || wp.description || wp.wp_number || "Unnamed work package";
}

export function getFabReleaseSignals(wp, options = {}) {
  const drawingsById = options.drawingsById || new Map();
  const drawingSetsById = options.drawingSetsById || new Map();
  const today = todayStart(options.today);
  const drawing = buildDrawingContext(wp, drawingsById, drawingSetsById);
  const status = wp.status || "Not Started";
  const progress = clampPercent(wp.percent_complete);
  const stage = normalizeStageId(getFabStage(wp, drawing));
  const stageRank = stageIndex(stage);
  const releasedDate = dateValue(wp.released_date);
  const scheduledStart = dateValue(wp.scheduled_start_date);
  const scheduledEnd = dateValue(wp.scheduled_end_date || wp.target_end_date || wp.due_date);
  const complete = isClosedStatus(status) || progress >= 100 || stage === "ready_to_ship";
  const totalBudgetHours = num(wp.shop_hours_budget);
  const totalActualHours = num(wp.shop_hours_actual);
  const hourBurn = totalBudgetHours > 0 ? Math.round((totalActualHours / totalBudgetHours) * 100) : 0;
  const daysSinceRelease = releasedDate ? daysBetween(releasedDate, today) : null;
  const overduePlan = Boolean(scheduledEnd && scheduledEnd < today && !complete);
  const releasedWithoutProgress = Boolean(releasedDate && daysSinceRelease > 7 && progress < 10 && !complete);
  const needsRelease = stageRank < stageIndex("shop_released");
  const inShop = stageRank >= stageIndex("shop_released") && stageRank < stageIndex("ready_to_ship");

  // S&H release gate data — cross-entity lookups from options
  const wpRfis = options.rfisByWpId?.get(String(wp.id)) || [];
  const hasCriticalRfis = wpRfis.some((rfi) => {
    const s = normalize(rfi.status);
    return !["answered", "closed", "draft"].includes(s) &&
           (rfi.priority === "Critical" || rfi.priority === "High");
  });

  const wpDeliveries = options.deliveriesByWpId?.get(String(wp.id)) || [];
  const hasDeliveryPath = wpDeliveries.length > 0;

  const flags = [];
  if (status === "On Hold") flags.push({ key: "on_hold", label: "On hold", severity: "high" });
  if (!drawing.hasAny && (wp.phase === "Fabrication" || stageRank >= stageIndex("material_on_hand"))) {
    flags.push({ key: "no_drawings", label: "No linked drawings", severity: "high" });
  } else if (drawing.hasAny && !drawing.hasReleased) {
    flags.push({ key: "drawings_not_released", label: "Drawings not released", severity: "high" });
  }
  if (overduePlan) flags.push({ key: "past_plan", label: "Past plan date", severity: "high" });
  if (releasedWithoutProgress) flags.push({ key: "stalled_release", label: "Released with no progress", severity: "high" });
  if (!wp.vif_confirmed && stageRank < stageIndex("in_fabrication")) {
    flags.push({ key: "vif_open", label: "VIF open", severity: "medium" });
  }
  if (!wp.load_list_complete && stageRank < stageIndex("in_fabrication")) {
    flags.push({ key: "load_list_open", label: "Load list open", severity: "medium" });
  }
  if (!String(wp.crew || "").trim() && !complete && stageRank >= stageIndex("shop_released")) {
    flags.push({ key: "no_crew", label: "No shop owner", severity: "medium" });
  }
  if (!releasedDate && stageRank >= stageIndex("in_fabrication") && !complete) {
    flags.push({ key: "missing_release_date", label: "Release date missing", severity: "medium" });
  }
  if (totalBudgetHours > 0 && totalActualHours > totalBudgetHours) {
    flags.push({
      key: "labor_over",
      label: "Shop hours over budget",
      severity: hourBurn >= 115 ? "high" : "medium",
    });
  }
  // S&H submittal gate — check submittals linked to this WP's drawing sets
  const wpDrawingSetIds = new Set(
    (drawing.linkedDrawings || [])
      .map((d) => d.drawing_set_id)
      .filter(Boolean)
      .map(String)
  );
  const wpSubmittals = [];
  for (const dsId of wpDrawingSetIds) {
    const subs = options.submittalsByDrawingSetId?.get(dsId) || [];
    wpSubmittals.push(...subs);
  }
  const hasUnapprovedSubmittals = wpSubmittals.length > 0 && wpSubmittals.some((s) => {
    const st = normalize(s.status || s.review_status || s.submittal_status || "");
    return st.includes("revise") || st.includes("resubmit") || st.includes("rejected") || st === "pending" || st === "submitted";
  });

  // S&H gates — flags
  if (hasCriticalRfis && stageRank < stageIndex("shop_released")) {
    flags.push({ key: "critical_rfis", label: "Critical RFIs open", severity: "high" });
  }
  if (num(wp.shop_hours_budget) <= 0 && num(wp.field_hours_budget) <= 0 && stageRank >= stageIndex("shop_released") && !complete) {
    flags.push({ key: "no_budget", label: "No budget hours", severity: "medium" });
  }
  if (!wp.sequence_confirmed && stageRank >= stageIndex("material_on_hand") && stageRank < stageIndex("shop_released")) {
    flags.push({ key: "sequence_not_confirmed", label: "Sequence not confirmed", severity: "medium" });
  }
  if (!hasDeliveryPath && stageRank >= stageIndex("material_on_hand") && !complete) {
    flags.push({ key: "no_delivery_path", label: "No delivery defined", severity: "medium" });
  }
  if (hasUnapprovedSubmittals && stageRank < stageIndex("shop_released")) {
    flags.push({ key: "submittals_pending", label: "Submittals not approved", severity: "medium" });
  }

  // S&H Weighted Release Readiness Score
  const readinessGates = [
    { key: "drawings_approved", weight: 25, pass: drawing.hasReleased || stageRank >= stageIndex("shop_released") },
    { key: "material_ready", weight: 20, pass: (Boolean(wp.vif_confirmed) && Boolean(wp.load_list_complete)) || stageRank >= stageIndex("in_fabrication") },
    { key: "rfis_clear", weight: 15, pass: !hasCriticalRfis || stageRank >= stageIndex("shop_released") },
    { key: "submittals_approved", weight: 15, pass: !hasUnapprovedSubmittals || stageRank >= stageIndex("shop_released") },
    { key: "budget_assigned", weight: 10, pass: (num(wp.shop_hours_budget) > 0 || num(wp.field_hours_budget) > 0) || stageRank < stageIndex("shop_released") || complete },
    { key: "schedule_clear", weight: 10, pass: (Boolean(wp.sequence_confirmed) && status !== "On Hold") || stageRank < stageIndex("shop_released") || complete },
    { key: "crew_available", weight: 5, pass: Boolean(String(wp.crew || "").trim()) || stageRank < stageIndex("shop_released") || complete },
  ];

  const readinessScore = readinessGates.reduce((sum, gate) => sum + (gate.pass ? gate.weight : 0), 0);

  const readinessBreakdown = readinessGates.map((g) => ({
    key: g.key,
    label: g.key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    weight: g.weight,
    pass: g.pass,
    earned: g.pass ? g.weight : 0,
  }));
  const high = flags.some((flag) => flag.severity === "high");
  const medium = flags.some((flag) => flag.severity === "medium");
  const readyForRelease = needsRelease && readinessScore >= 80 && !high;

  return {
    stage,
    status,
    progress,
    complete,
    releasedDate,
    scheduledStart,
    scheduledEnd,
    overduePlan,
    daysSinceRelease,
    needsRelease,
    inShop,
    readyForRelease,
    drawing,
    flags,
    risk: high ? "high" : medium ? "medium" : "clear",
    readinessScore,
    readinessBreakdown,
    totalBudgetHours,
    totalActualHours,
    hourBurn,
  };
}

export function buildFabReleaseMetrics(workPackages = [], drawings = [], drawingSets = [], options = {}) {
  const drawingsById = new Map(drawings.map((drawing) => [String(drawing.id), drawing]));
  const drawingSetsById = new Map(drawingSets.map((drawingSet) => [String(drawingSet.id), drawingSet]));
  const activeWorkPackages = workPackages.filter((wp) => !wp?.is_deleted);
  const enriched = activeWorkPackages.map((wp) => ({
    ...wp,
    _signals: getFabReleaseSignals(wp, {
      drawingsById,
      drawingSetsById,
      today: options.today,
      rfisByWpId: options.rfisByWpId,
      deliveriesByWpId: options.deliveriesByWpId,
      submittalsByDrawingSetId: options.submittalsByDrawingSetId,
    }),
  }));

  const totalTons = enriched.reduce((sum, wp) => sum + num(wp.tonnage), 0);
  const releasedTons = enriched
    .filter((wp) => stageIndex(wp._signals.stage) >= stageIndex("shop_released"))
    .reduce((sum, wp) => sum + num(wp.tonnage), 0);
  const activeShop = enriched.filter((wp) => wp._signals.inShop);
  const readyToShip = enriched.filter((wp) => wp._signals.stage === "ready_to_ship");
  const readyForRelease = enriched.filter((wp) => wp._signals.readyForRelease);
  const exceptions = enriched.filter((wp) => wp._signals.risk === "high");
  const warnings = enriched.filter((wp) => wp._signals.risk === "medium");
  const onHold = enriched.filter((wp) => wp._signals.status === "On Hold");
  const drawingGaps = enriched.filter((wp) =>
    wp._signals.flags.some((flag) => flag.key === "no_drawings" || flag.key === "drawings_not_released")
  );
  const releaseBlocked = enriched.filter((wp) =>
    wp._signals.needsRelease && wp._signals.risk !== "clear" && wp._signals.stage !== "ready_to_ship"
  );
  const totalBudgetHours = enriched.reduce((sum, wp) => sum + wp._signals.totalBudgetHours, 0);
  const totalActualHours = enriched.reduce((sum, wp) => sum + wp._signals.totalActualHours, 0);
  const weightedProgress = totalTons > 0
    ? Math.round(enriched.reduce((sum, wp) => sum + num(wp.tonnage) * wp._signals.progress, 0) / totalTons)
    : Math.round(enriched.reduce((sum, wp) => sum + wp._signals.progress, 0) / Math.max(1, enriched.length));

  const stageRollup = FAB_STAGES.map((stage) => {
    const items = enriched.filter((wp) => wp._signals.stage === stage.id);
    const tons = items.reduce((sum, wp) => sum + num(wp.tonnage), 0);
    const cumulative = enriched
      .filter((wp) => stageIndex(wp._signals.stage) >= stageIndex(stage.id))
      .reduce((sum, wp) => sum + num(wp.tonnage), 0);
    return {
      ...stage,
      count: items.length,
      tons,
      cumulativeTons: cumulative,
      highRisk: items.filter((wp) => wp._signals.risk === "high").length,
      mediumRisk: items.filter((wp) => wp._signals.risk === "medium").length,
      progress: totalTons > 0 ? Math.round((cumulative / totalTons) * 100) : 0,
    };
  });

  return {
    enriched,
    totalCount: enriched.length,
    totalTons,
    releasedTons,
    weightedProgress,
    activeShop,
    readyToShip,
    readyForRelease,
    exceptions,
    warnings,
    onHold,
    drawingGaps,
    releaseBlocked,
    totalBudgetHours,
    totalActualHours,
    laborBurn: totalBudgetHours > 0 ? Math.round((totalActualHours / totalBudgetHours) * 100) : 0,
    stageRollup,
  };
}

export function fabReleaseLane(wp) {
  const signals = wp._signals || getFabReleaseSignals(wp);
  if (signals.stage === "ready_to_ship") return "Ready To Ship";
  if (signals.risk === "high") return "Blocked";
  if (signals.readyForRelease) return "Ready For Release";
  if (signals.inShop) return signals.stage === "shop_released" ? "Released" : "In Shop";
  return "Ready For Release";
}

export function sortFabPackagesForRelease(a, b) {
  const riskRank = { high: 0, medium: 1, clear: 2 };
  const riskDiff = riskRank[a._signals?.risk || "clear"] - riskRank[b._signals?.risk || "clear"];
  if (riskDiff !== 0) return riskDiff;
  const readyDiff = Number(Boolean(b._signals?.readyForRelease)) - Number(Boolean(a._signals?.readyForRelease));
  if (readyDiff !== 0) return readyDiff;
  const stageDiff = stageIndex(a._signals?.stage) - stageIndex(b._signals?.stage);
  if (stageDiff !== 0) return stageDiff;
  const releaseA = a.released_date || a.scheduled_start_date || "9999-12-31";
  const releaseB = b.released_date || b.scheduled_start_date || "9999-12-31";
  if (releaseA !== releaseB) return String(releaseA).localeCompare(String(releaseB));
  return String(a.wp_number || a.name || "").localeCompare(String(b.wp_number || b.name || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
