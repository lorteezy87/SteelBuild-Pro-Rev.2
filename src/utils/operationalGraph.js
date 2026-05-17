const CLOSED_RFI_STATUSES = new Set(["answered", "closed", "complete", "completed", "cancelled", "canceled", "void"]);
const CLOSED_WORK_STATUSES = new Set(["complete", "completed", "cancelled", "canceled", "void"]);
const CLOSED_DELIVERY_STATUSES = new Set(["delivered", "received", "complete", "completed", "cancelled", "canceled", "void"]);
const CLOSED_LOG_STATUSES = new Set(["void", "deleted", "cancelled", "canceled"]);
const TERMINAL_SUBMITTAL_STATUSES = new Set(["approved", "approved as noted", "released for fabrication", "closed", "void", "cancelled", "canceled"]);
const PRODUCTION_PHASES = ["fabrication", "fab", "shipping", "delivery", "erection", "install", "installation", "field"];

export const GRAPH_SEVERITY = {
  Critical: { weight: 24, color: "var(--status-error-bright)" },
  High: { weight: 14, color: "var(--status-warning-bright)" },
  Medium: { weight: 8, color: "var(--status-warning)" },
  Low: { weight: 4, color: "var(--text-muted)" },
};

export const S_AND_H_OWNERSHIP_MODEL = [
  {
    object: "Drawing Sets",
    primarySystem: "Drawings & Submittals",
    consumers: ["RFIs", "Work Packages", "Fab Release", "Schedule"],
    doNotDuplicateIn: ["Daily Logs", "Spreadsheets"],
  },
  {
    object: "Submittals",
    primarySystem: "Submittal Register",
    consumers: ["Drawings", "RFIs", "PCC", "Schedule"],
    doNotDuplicateIn: ["Separate Excel Log"],
  },
  {
    object: "RFIs",
    primarySystem: "RFI Hub",
    consumers: ["Drawings", "Constraints", "Work Packages", "Change Orders"],
    doNotDuplicateIn: ["Meeting Notes Tracker"],
  },
  {
    object: "Fab Releases",
    primarySystem: "Fab Release",
    consumers: ["Schedule", "Procurement", "Deliveries"],
    doNotDuplicateIn: ["Manual Release Spreadsheets"],
  },
  {
    object: "Deliveries",
    primarySystem: "Deliveries",
    consumers: ["Daily Logs", "Field Hub", "Schedule"],
    doNotDuplicateIn: ["Delivery Whiteboards"],
  },
  {
    object: "Daily Logs",
    primarySystem: "Daily Logs",
    consumers: ["Budget Hours", "PCC", "Reporting"],
    doNotDuplicateIn: ["Separate Superintendent Reports"],
  },
];

export const NO_DUPLICATE_ENTRY_RULES = [
  "Drawings uploaded once only.",
  "RFIs reference drawings instead of attaching duplicate PDFs.",
  "Submittals reference drawing sets instead of re-uploading files.",
  "Deliveries derive from work packages.",
  "Daily logs reference deliveries or work packages instead of free-typing everything.",
  "Schedule dates should flow from linked work packages whenever possible.",
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function display(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function asObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

function parseIds(value) {
  return asArray(value)
    .map((item) => (typeof item === "object" ? item.id || item.wp_id || item.drawing_id || item.drawing_set_id : item))
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function hasText(value) {
  return display(value).length > 0;
}

function isDeleted(row) {
  return Boolean(row?.is_deleted || row?.deleted_at);
}

function isProductionPhase(row) {
  const text = normalize([row?.phase, row?.status, row?.name, row?.task_name, row?.task_type].filter(Boolean).join(" "));
  return PRODUCTION_PHASES.some((token) => text.includes(token));
}

function hasAreaOrSequence(row) {
  const metadata = asObject(row?.metadata);
  return [
    row?.area,
    row?.project_area,
    row?.zone,
    row?.sequence,
    row?.install_phase,
    row?.truck_phase,
    metadata.area,
    metadata.project_area,
    metadata.zone,
    metadata.sequence,
    metadata.install_phase,
    metadata.truck_phase,
  ].some(hasText);
}

function sourceLabel(row, fields, fallback) {
  for (const field of fields) {
    if (hasText(row?.[field])) return row[field];
  }
  return row?.id ? `${fallback} ${String(row.id).slice(0, 8)}` : fallback;
}

function routeFor(domain) {
  if (domain === "Drawing Set" || domain === "Submittal") return "DrawingSubmittalHub";
  if (domain === "RFI") return "RFIs";
  if (domain === "Work Package") return "WorkPackages";
  if (domain === "Delivery") return "Deliveries";
  if (domain === "Daily Log") return "DailyLogs";
  if (domain === "Schedule Task") return "Schedule";
  return null;
}

function addGap(gaps, gap) {
  const severity = GRAPH_SEVERITY[gap.severity] ? gap.severity : "Medium";
  gaps.push({
    id: gap.id,
    domain: gap.domain,
    severity,
    weight: GRAPH_SEVERITY[severity].weight,
    ownerSystem: gap.ownerSystem,
    sourceId: gap.sourceId || null,
    sourceLabel: gap.sourceLabel || gap.domain,
    title: gap.title,
    detail: gap.detail,
    recommendedAction: gap.recommendedAction,
    route: gap.route || routeFor(gap.domain),
    duplicateRisk: Boolean(gap.duplicateRisk),
    ruleKey: gap.ruleKey || null,
  });
}

function buildIndexes({ drawings, drawingSets, submittals, workPackages }) {
  const drawingIdToSetId = new Map();
  const drawingSetToDrawingIds = new Map();
  const submittalSetIds = new Set();
  const workPackageSetIds = new Set();

  for (const set of drawingSets || []) {
    if (!set?.id) continue;
    drawingSetToDrawingIds.set(String(set.id), []);
  }

  for (const drawing of drawings || []) {
    if (!drawing?.id || !drawing.drawing_set_id || isDeleted(drawing)) continue;
    const drawingId = String(drawing.id);
    const setId = String(drawing.drawing_set_id);
    drawingIdToSetId.set(drawingId, setId);
    if (!drawingSetToDrawingIds.has(setId)) drawingSetToDrawingIds.set(setId, []);
    drawingSetToDrawingIds.get(setId).push(drawingId);
  }

  for (const submittal of submittals || []) {
    if (!submittal || isDeleted(submittal)) continue;
    for (const setId of parseIds(submittal.drawing_set_ids)) {
      submittalSetIds.add(setId);
    }
  }

  for (const wp of workPackages || []) {
    if (!wp || isDeleted(wp)) continue;
    for (const rawId of parseIds(wp.linked_drawing_ids)) {
      if (drawingIdToSetId.has(rawId)) workPackageSetIds.add(drawingIdToSetId.get(rawId));
      workPackageSetIds.add(rawId);
    }
  }

  return { drawingIdToSetId, drawingSetToDrawingIds, submittalSetIds, workPackageSetIds };
}

function hasRfiDrawingReference(rfi) {
  const metadata = asObject(rfi?.metadata);
  return [
    rfi?.drawing_reference,
    rfi?.drawing_id,
    rfi?.drawing_set_id,
    metadata.drawing_reference,
    metadata.drawing_id,
    metadata.drawing_set_id,
  ].some(hasText) || parseIds(metadata.drawing_ids).length > 0 || parseIds(metadata.drawing_set_ids).length > 0;
}

function hasDailyLogWorkLink(log) {
  const metadata = asObject(log?.metadata);
  const wpProgress = asArray(log?.wp_progress);
  return wpProgress.some((row) => hasText(row?.wp_id || row?.work_package_id))
    || [metadata.work_package_id, metadata.delivery_id].some(hasText)
    || parseIds(metadata.work_package_ids).length > 0
    || parseIds(metadata.delivery_ids).length > 0;
}

function hasScheduleAnchor(task) {
  const metadata = asObject(task?.metadata);
  return [
    metadata.work_package_id,
    metadata.delivery_id,
    metadata.drawing_set_id,
    task?.work_package_id,
    task?.delivery_id,
  ].some(hasText)
    || parseIds(metadata.work_package_ids).length > 0
    || parseIds(task?.related_rfi_ids).length > 0
    || parseIds(task?.related_action_item_ids).length > 0
    || parseIds(task?.related_change_order_ids).length > 0;
}

function countBy(gaps, field) {
  return gaps.reduce((acc, gap) => {
    const key = gap[field] || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function sortGaps(gaps) {
  return [...gaps].sort((a, b) =>
    b.weight - a.weight ||
    String(a.domain).localeCompare(String(b.domain)) ||
    String(a.sourceLabel).localeCompare(String(b.sourceLabel))
  );
}

export function buildOperationalGraphHealth({
  drawingSets = [],
  drawings = [],
  submittals = [],
  rfis = [],
  workPackages = [],
  deliveries = [],
  dailyLogs = [],
  scheduleTasks = [],
} = {}) {
  const gaps = [];
  const activeDrawingSets = (drawingSets || []).filter((row) => row && !isDeleted(row));
  const activeSubmittals = (submittals || []).filter((row) => row && !isDeleted(row));
  const activeRfis = (rfis || []).filter((row) => row && !isDeleted(row) && !CLOSED_RFI_STATUSES.has(normalize(row.status)));
  const activeWorkPackages = (workPackages || []).filter((row) => row && !isDeleted(row) && !CLOSED_WORK_STATUSES.has(normalize(row.status)));
  const activeDeliveries = (deliveries || []).filter((row) => row && !isDeleted(row) && !CLOSED_DELIVERY_STATUSES.has(normalize(row.status)));
  const activeDailyLogs = (dailyLogs || []).filter((row) => row && !isDeleted(row) && !CLOSED_LOG_STATUSES.has(normalize(row.status)));
  const activeScheduleTasks = (scheduleTasks || []).filter((row) => row && !isDeleted(row) && !CLOSED_WORK_STATUSES.has(normalize(row.status)));
  const indexes = buildIndexes({ drawings, drawingSets: activeDrawingSets, submittals: activeSubmittals, workPackages: activeWorkPackages });

  for (const set of activeDrawingSets) {
    const setId = String(set.id);
    const label = sourceLabel(set, ["set_name", "name", "description"], "Drawing Set");
    const linkedToSubmittal = hasText(set.current_submittal_id) || indexes.submittalSetIds.has(setId);

    if (!linkedToSubmittal) {
      addGap(gaps, {
        id: `drawing-set:${setId}:no-submittal`,
        domain: "Drawing Set",
        severity: "High",
        ownerSystem: "Drawings & Submittals",
        sourceId: set.id,
        sourceLabel: label,
        title: "Drawing set has no linked submittal",
        detail: "S&H workflow treats submittals as wrappers around drawing sets. This set will be tracked manually unless it is linked to a submittal.",
        recommendedAction: "Link this drawing set to the current submittal transmission.",
        duplicateRisk: true,
        ruleKey: "submittals-reference-drawing-sets",
      });
    }

    if (!hasText(set.revision)) {
      addGap(gaps, {
        id: `drawing-set:${setId}:missing-revision`,
        domain: "Drawing Set",
        severity: "Medium",
        ownerSystem: "Drawings & Submittals",
        sourceId: set.id,
        sourceLabel: label,
        title: "Drawing set is missing revision",
        detail: "Revision drives fabrication eligibility and prevents crews from working off stale drawings.",
        recommendedAction: "Enter the drawing set revision before release decisions depend on it.",
      });
    }

    if (!hasText(set.discipline)) {
      addGap(gaps, {
        id: `drawing-set:${setId}:missing-discipline`,
        domain: "Drawing Set",
        severity: "Low",
        ownerSystem: "Drawings & Submittals",
        sourceId: set.id,
        sourceLabel: label,
        title: "Drawing set is missing discipline",
        detail: "Discipline is needed for reliable filtering, ownership, and PCC escalation.",
        recommendedAction: "Classify the drawing set discipline.",
      });
    }

    if (!hasAreaOrSequence(set)) {
      addGap(gaps, {
        id: `drawing-set:${setId}:missing-sequence`,
        domain: "Drawing Set",
        severity: "Medium",
        ownerSystem: "Drawings & Submittals",
        sourceId: set.id,
        sourceLabel: label,
        title: "Drawing set is missing area or sequence",
        detail: "Sequence and area let RFIs, releases, deliveries, and field work line up around install intent.",
        recommendedAction: "Add area, zone, sequence, or install-phase metadata to the drawing set.",
      });
    }

    if (!indexes.workPackageSetIds.has(setId)) {
      addGap(gaps, {
        id: `drawing-set:${setId}:no-work-package`,
        domain: "Drawing Set",
        severity: "Medium",
        ownerSystem: "Drawings & Submittals",
        sourceId: set.id,
        sourceLabel: label,
        title: "Drawing set is not tied to a work package",
        detail: "Approved drawings should feed production packages instead of sitting as disconnected document records.",
        recommendedAction: "Link sheets from this set to the affected work package.",
      });
    }
  }

  for (const submittal of activeSubmittals) {
    const subId = String(submittal.id);
    const label = sourceLabel(submittal, ["submittal_number", "title"], "Submittal");
    const linkedSetIds = parseIds(submittal.drawing_set_ids);
    const terminal = TERMINAL_SUBMITTAL_STATUSES.has(normalize(submittal.status));

    if (linkedSetIds.length === 0) {
      addGap(gaps, {
        id: `submittal:${subId}:no-drawing-set`,
        domain: "Submittal",
        severity: terminal ? "Medium" : "High",
        ownerSystem: "Submittal Register",
        sourceId: submittal.id,
        sourceLabel: label,
        title: "Submittal is not wrapping drawing sets",
        detail: "Submittals should be workflow wrappers around drawing sets, not standalone PDF records.",
        recommendedAction: "Attach one or more drawing sets to this submittal.",
        duplicateRisk: true,
        ruleKey: "submittals-reference-drawing-sets",
      });
    }

    if (hasText(submittal.file_url) && linkedSetIds.length === 0) {
      addGap(gaps, {
        id: `submittal:${subId}:file-without-set-link`,
        domain: "Submittal",
        severity: "High",
        ownerSystem: "Submittal Register",
        sourceId: submittal.id,
        sourceLabel: label,
        title: "Submittal file is disconnected from drawing sets",
        detail: "A submittal PDF without linked drawing sets can become a second drawing log.",
        recommendedAction: "Keep the file as the transmittal record and link it back to uploaded drawing sets.",
        duplicateRisk: true,
        ruleKey: "drawings-uploaded-once",
      });
    }

    if (!terminal && !hasText(submittal.ball_in_court)) {
      addGap(gaps, {
        id: `submittal:${subId}:missing-bic`,
        domain: "Submittal",
        severity: "Medium",
        ownerSystem: "Submittal Register",
        sourceId: submittal.id,
        sourceLabel: label,
        title: "Submittal is missing ball-in-court",
        detail: "Ball-in-court identifies who is blocking the drawing workflow.",
        recommendedAction: "Assign the current reviewer or responsible party.",
      });
    }

    if (!terminal && !hasText(submittal.required_date)) {
      addGap(gaps, {
        id: `submittal:${subId}:missing-required-date`,
        domain: "Submittal",
        severity: "Medium",
        ownerSystem: "Submittal Register",
        sourceId: submittal.id,
        sourceLabel: label,
        title: "Submittal is missing required date",
        detail: "PCC cannot escalate review risk without a due date.",
        recommendedAction: "Add the review required date.",
      });
    }
  }

  for (const rfi of activeRfis) {
    const rfiId = String(rfi.id);
    const label = sourceLabel(rfi, ["rfi_number", "title", "question"], "RFI");

    if (!hasText(rfi.work_package_id)) {
      addGap(gaps, {
        id: `rfi:${rfiId}:no-work-package`,
        domain: "RFI",
        severity: "High",
        ownerSystem: "RFI Hub",
        sourceId: rfi.id,
        sourceLabel: label,
        title: "Open RFI is not linked to a work package",
        detail: "The constraint engine can generate an engineering hold, but production impact is weaker without a work package link.",
        recommendedAction: "Link the affected work package or confirm this RFI has no production impact.",
      });
    }

    if (!hasRfiDrawingReference(rfi)) {
      addGap(gaps, {
        id: `rfi:${rfiId}:no-drawing-reference`,
        domain: "RFI",
        severity: "Medium",
        ownerSystem: "RFI Hub",
        sourceId: rfi.id,
        sourceLabel: label,
        title: "Open RFI is missing drawing reference",
        detail: "RFIs should reference drawing sheets or drawing sets instead of carrying disconnected context.",
        recommendedAction: "Add the sheet, drawing set, or drawing reference affected by the RFI.",
        duplicateRisk: true,
        ruleKey: "rfis-reference-drawings",
      });
    }

    if (!hasText(rfi.ball_in_court || rfi.assigned_to)) {
      addGap(gaps, {
        id: `rfi:${rfiId}:missing-bic`,
        domain: "RFI",
        severity: "Medium",
        ownerSystem: "RFI Hub",
        sourceId: rfi.id,
        sourceLabel: label,
        title: "Open RFI is missing ball-in-court",
        detail: "PCC cannot identify who is blocking the response.",
        recommendedAction: "Set ball-in-court or assigned owner.",
      });
    }

    if (!hasText(rfi.due_date || rfi.date_required)) {
      addGap(gaps, {
        id: `rfi:${rfiId}:missing-due-date`,
        domain: "RFI",
        severity: "Medium",
        ownerSystem: "RFI Hub",
        sourceId: rfi.id,
        sourceLabel: label,
        title: "Open RFI is missing due date",
        detail: "Due dates drive deterministic escalation and schedule-risk signals.",
        recommendedAction: "Enter the needed-by date.",
      });
    }
  }

  for (const wp of activeWorkPackages) {
    const wpId = String(wp.id);
    const label = sourceLabel(wp, ["wp_number", "name"], "Work Package");
    const linkedDrawingIds = parseIds(wp.linked_drawing_ids);

    if (linkedDrawingIds.length === 0) {
      addGap(gaps, {
        id: `work-package:${wpId}:no-drawings`,
        domain: "Work Package",
        severity: isProductionPhase(wp) ? "High" : "Medium",
        ownerSystem: "Work Packages",
        sourceId: wp.id,
        sourceLabel: label,
        title: "Work package has no linked drawings",
        detail: "Work packages are the production backbone and need drawing authority before fab release or erection planning.",
        recommendedAction: "Link the approved drawing sheets or drawing-set package.",
      });
    }

    if (!hasAreaOrSequence(wp)) {
      addGap(gaps, {
        id: `work-package:${wpId}:missing-area-sequence`,
        domain: "Work Package",
        severity: isProductionPhase(wp) ? "Medium" : "Low",
        ownerSystem: "Work Packages",
        sourceId: wp.id,
        sourceLabel: label,
        title: "Work package is missing area or sequence",
        detail: "Sequence-centric planning depends on area, sequence, zone, or install intent.",
        recommendedAction: "Add area/sequence metadata or confirm sequence on the work package.",
      });
    }

    if (isProductionPhase(wp) && !wp.sequence_confirmed) {
      addGap(gaps, {
        id: `work-package:${wpId}:sequence-not-confirmed`,
        domain: "Work Package",
        severity: "High",
        ownerSystem: "Work Packages",
        sourceId: wp.id,
        sourceLabel: label,
        title: "Production work package sequence is not confirmed",
        detail: "Fabrication, loading, delivery, and erection should align before release.",
        recommendedAction: "Confirm the work package sequence before release or delivery.",
      });
    }
  }

  for (const delivery of activeDeliveries) {
    const deliveryId = String(delivery.id);
    const label = sourceLabel(delivery, ["delivery_id", "delivery_title", "description", "load_number"], "Delivery");

    if (!hasText(delivery.work_package_id)) {
      addGap(gaps, {
        id: `delivery:${deliveryId}:no-work-package`,
        domain: "Delivery",
        severity: "High",
        ownerSystem: "Deliveries",
        sourceId: delivery.id,
        sourceLabel: label,
        title: "Delivery is not linked to a work package",
        detail: "Deliveries should derive from work packages so trucking, staging, and erection intent stay aligned.",
        recommendedAction: "Attach the delivery to its work package.",
        duplicateRisk: true,
        ruleKey: "deliveries-derive-from-work-packages",
      });
    }

    if (!hasText(delivery.scheduled_date || delivery.required_date || delivery.expected_ship_date)) {
      addGap(gaps, {
        id: `delivery:${deliveryId}:missing-date`,
        domain: "Delivery",
        severity: "Medium",
        ownerSystem: "Deliveries",
        sourceId: delivery.id,
        sourceLabel: label,
        title: "Delivery is missing schedule date",
        detail: "Field, daily log, and PCC workflows cannot plan around a delivery without a required or scheduled date.",
        recommendedAction: "Enter required date, scheduled date, or expected ship date.",
      });
    }
  }

  for (const log of activeDailyLogs) {
    const logId = String(log.id);
    const label = sourceLabel(log, ["date", "crew_name", "superintendent"], "Daily Log");
    const hasProductionContent = Number(log.headcount || 0) > 0
      || Number(log.hours_worked || 0) > 0
      || hasText(log.activities)
      || hasText(log.delays);

    if (hasProductionContent && !hasDailyLogWorkLink(log)) {
      addGap(gaps, {
        id: `daily-log:${logId}:no-work-link`,
        domain: "Daily Log",
        severity: "Medium",
        ownerSystem: "Daily Logs",
        sourceId: log.id,
        sourceLabel: label,
        title: "Daily log has production content without a work link",
        detail: "Daily logs should feed actual production by referencing work packages, deliveries, RFIs, or action items.",
        recommendedAction: "Add work package progress or related links to the daily log.",
        duplicateRisk: true,
        ruleKey: "daily-logs-reference-work",
      });
    }
  }

  for (const task of activeScheduleTasks) {
    const taskId = String(task.id);
    if (!isProductionPhase(task) || hasScheduleAnchor(task)) continue;
    addGap(gaps, {
      id: `schedule-task:${taskId}:no-source-anchor`,
      domain: "Schedule Task",
      severity: "Low",
      ownerSystem: "Schedule",
      sourceId: task.id,
      sourceLabel: sourceLabel(task, ["wbs_code", "task_name", "name"], "Schedule Task"),
      title: "Production schedule task lacks source links",
      detail: "Schedule dates should connect to work packages, RFIs, action items, or deliveries where possible.",
      recommendedAction: "Link the schedule task to the controlling work package or blocker.",
    });
  }

  const sortedGaps = sortGaps(gaps);
  const weightedPenalty = sortedGaps.reduce((sum, gap) => sum + gap.weight, 0);
  const score = Math.max(0, 100 - Math.min(100, weightedPenalty));
  const recordsReviewed =
    activeDrawingSets.length +
    activeSubmittals.length +
    activeRfis.length +
    activeWorkPackages.length +
    activeDeliveries.length +
    activeDailyLogs.length +
    activeScheduleTasks.length;

  return {
    score,
    recordsReviewed,
    gapCount: sortedGaps.length,
    highImpactCount: sortedGaps.filter((gap) => gap.severity === "Critical" || gap.severity === "High").length,
    duplicateRiskCount: sortedGaps.filter((gap) => gap.duplicateRisk).length,
    gaps: sortedGaps,
    topGaps: sortedGaps.slice(0, 8),
    countsByOwner: countBy(sortedGaps, "ownerSystem"),
    countsByDomain: countBy(sortedGaps, "domain"),
    ownershipModel: S_AND_H_OWNERSHIP_MODEL,
    noDuplicateEntryRules: NO_DUPLICATE_ENTRY_RULES,
  };
}
