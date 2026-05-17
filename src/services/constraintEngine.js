const DAY_MS = 24 * 60 * 60 * 1000;

const PRIORITIES = new Set(["Critical", "High", "Medium", "Low"]);
const CLOSED_STATUSES = new Set(["closed", "close", "complete", "completed", "cancelled", "canceled", "resolved"]);
const NON_BLOCKING_RFI_STATUSES = new Set(["draft", "answered", ...CLOSED_STATUSES]);
const NON_BLOCKING_DELIVERY_STATUSES = new Set(["delivered", "received", "complete", "completed", "cancelled", "canceled", "closed"]);
const RELEASED_DRAWING_STATES = new Set([
  "released",
  "ifc",
  "issued for construction",
  "ofs",
  "approved",
  "approved as noted",
  "approved_as_noted",
]);
const PRODUCTION_PHASES = new Set(["fabrication", "delivery", "erection", "installation", "closeout"]);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function display(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function asDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function isoDate(value) {
  const parsed = asDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

function todayStart(value) {
  const parsed = value ? asDate(value) : new Date();
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function isBeforeToday(value, today) {
  const parsed = asDate(value);
  return Boolean(parsed && parsed.getTime() < today.getTime());
}

function isWithinDays(value, today, days) {
  const parsed = asDate(value);
  if (!parsed) return false;
  const delta = Math.round((parsed.getTime() - today.getTime()) / DAY_MS);
  return delta >= 0 && delta <= days;
}

function normalizePriority(priority, fallback = "Medium") {
  const raw = display(priority);
  const match = Array.from(PRIORITIES).find((p) => normalize(p) === normalize(raw));
  return match || fallback;
}

function sourceTitle(sourceType, ref, title) {
  return [sourceType, ref, title].map((part) => display(part)).filter(Boolean).join(" - ");
}

function parseLinkedIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isClosedSource(row) {
  return CLOSED_STATUSES.has(normalize(row?.status));
}

function isReleasedDrawing(drawing) {
  if (!drawing || drawing.is_deleted || drawing.is_superseded) return false;
  return [
    drawing.stage,
    drawing.status,
    drawing.set_approval_status,
    drawing.ifc_status,
  ].some((value) => RELEASED_DRAWING_STATES.has(normalize(value)));
}

function projectArea(row) {
  return (
    row?.project_area ||
    row?.area ||
    row?.zone ||
    row?.sequence ||
    row?.location ||
    row?.phase ||
    null
  );
}

function sourceRef(prefix, row, fields) {
  for (const field of fields) {
    if (row?.[field]) return `${prefix} ${row[field]}`;
  }
  return row?.id ? `${prefix} ${String(row.id).slice(0, 8)}` : prefix;
}

function buildExistingConstraintIndex(existingConstraints = []) {
  const keys = new Set();
  for (const constraint of existingConstraints || []) {
    if (!constraint || isClosedSource(constraint)) continue;
    const metadata = constraint.metadata || {};
    const engine = metadata.constraint_engine || metadata.constraintEngine || {};
    const directKeys = [
      constraint.constraint_number,
      metadata.constraint_engine_key,
      metadata.constraintEngineKey,
      metadata.source_key,
      engine.key,
    ];
    for (const key of directKeys) {
      if (key) keys.add(String(key));
    }
    if (metadata.source_type && metadata.source_id) {
      keys.add(`${metadata.source_type}:${metadata.source_id}`);
    }
    if (engine.source_type && engine.source_id) {
      keys.add(`${engine.source_type}:${engine.source_id}`);
    }
  }
  return keys;
}

function makeGeneratedConstraint({
  key,
  sourceType,
  source,
  sourceRef: ref,
  type,
  title,
  description,
  priority = "Medium",
  dueDate = null,
  workPackageId = null,
  projectId = null,
  projectName = null,
  area = null,
  assignedTo = null,
}) {
  return {
    id: `generated:${key}`,
    category: "CONSTRAINT",
    status: "Open",
    priority: normalizePriority(priority),
    constraint_type: type,
    constraint_number: `AUTO-${key.toUpperCase().replaceAll(":", "-")}`,
    title,
    description,
    project_id: projectId || source?.project_id || "",
    project_name: projectName || source?.project_name || null,
    project_area: area || projectArea(source),
    work_package_id: workPackageId || source?.work_package_id || null,
    assigned_to: assignedTo || source?.assigned_to || source?.ball_in_court || source?.crew_name || null,
    due_date: isoDate(dueDate),
    created_at: source?.created_at || source?.created_date || source?.submitted_date || source?.inspection_date || null,
    updated_at: source?.updated_at || null,
    metadata: {
      constraint_engine: {
        generated: true,
        key,
        source_type: sourceType,
        source_id: source?.id || null,
        source_ref: ref,
        source_status: source?.status || null,
      },
    },
    _generated: true,
    _source_type: sourceType,
    _source_id: source?.id || null,
    _source_ref: ref,
    _source_status: source?.status || null,
  };
}

function addConstraint(output, existingKeys, config) {
  const autoNumber = config.key ? `AUTO-${config.key.toUpperCase().replaceAll(":", "-")}` : null;
  if (!config.key || existingKeys.has(config.key) || existingKeys.has(autoNumber)) return;
  output.push(makeGeneratedConstraint(config));
}

function deriveRfiConstraints(output, existingKeys, rfis, today) {
  for (const rfi of rfis || []) {
    if (!rfi || rfi.is_deleted || NON_BLOCKING_RFI_STATUSES.has(normalize(rfi.status))) continue;
    const ref = sourceRef("RFI", rfi, ["rfi_number", "number"]);
    const priority = rfi.schedule_impact || Number(rfi.schedule_impact_days) > 0 || isBeforeToday(rfi.due_date || rfi.date_required, today)
      ? "High"
      : normalizePriority(rfi.priority, "Medium");
    addConstraint(output, existingKeys, {
      key: `rfi:${rfi.id}`,
      sourceType: "RFI",
      source: rfi,
      sourceRef: ref,
      type: "Engineering Hold",
      title: `Engineering Hold: ${sourceTitle(ref, "", rfi.title || rfi.question)}`,
      description: `Generated from ${ref}. This RFI is still open and may block detailing, fabrication release, procurement, or field work until answered and closed.`,
      priority,
      dueDate: rfi.due_date || rfi.date_required,
    });
  }
}

function deriveSubmittalConstraints(output, existingKeys, submittals, today) {
  for (const submittal of submittals || []) {
    if (!submittal || submittal.is_deleted || isClosedSource(submittal)) continue;
    const status = normalize(submittal.status || submittal.review_status || submittal.submittal_status);
    const needsRevision = status.includes("revise") || status.includes("resubmit") || status.includes("rejected");
    const overdue = isBeforeToday(submittal.required_date || submittal.due_date, today);
    if (!needsRevision && !overdue) continue;
    const ref = sourceRef("Submittal", submittal, ["submittal_number", "number"]);
    addConstraint(output, existingKeys, {
      key: `submittal:${submittal.id}`,
      sourceType: "Submittal",
      source: submittal,
      sourceRef: ref,
      type: "Approval Hold",
      title: `Approval Hold: ${sourceTitle(ref, "", submittal.title || submittal.description)}`,
      description: needsRevision
        ? `Generated from ${ref}. The submittal requires revision or resubmission before downstream work can be treated as approved.`
        : `Generated from ${ref}. The submittal approval date is past due and should be escalated before release planning depends on it.`,
      priority: needsRevision || overdue ? "High" : "Medium",
      dueDate: submittal.required_date || submittal.due_date,
      assignedTo: submittal.ball_in_court,
    });
  }
}

function deriveDeliveryConstraints(output, existingKeys, deliveries, today) {
  for (const delivery of deliveries || []) {
    if (!delivery || delivery.is_deleted || NON_BLOCKING_DELIVERY_STATUSES.has(normalize(delivery.status))) continue;
    const requiredDate = delivery.required_date || delivery.scheduled_date || delivery.expected_ship_date;
    const late = isBeforeToday(requiredDate, today);
    const atRiskStatus = ["delayed", "late", "backorder", "backordered", "missing", "hold"].some((token) =>
      normalize(delivery.status).includes(token)
    );
    if (!late && !atRiskStatus && !delivery.is_long_lead) continue;
    const ref = sourceRef("Delivery", delivery, ["delivery_number", "po_number"]);
    addConstraint(output, existingKeys, {
      key: `delivery:${delivery.id}`,
      sourceType: "Delivery",
      source: delivery,
      sourceRef: ref,
      type: "Procurement Hold",
      title: `Procurement Hold: ${sourceTitle(ref, "", delivery.delivery_title || delivery.title || delivery.procurement_category)}`,
      description: `Generated from ${ref}. Required material, delivery, or procurement information is not ready for the current plan.`,
      priority: late || delivery.is_long_lead ? "High" : "Medium",
      dueDate: requiredDate,
    });
  }
}

function deriveInspectionConstraints(output, existingKeys, inspections) {
  for (const inspection of inspections || []) {
    if (!inspection || inspection.is_deleted || isClosedSource(inspection) && normalize(inspection.sign_off_status) !== "rejected") continue;
    const rejected = normalize(inspection.sign_off_status).includes("reject") || normalize(inspection.status).includes("fail");
    const deficiencies = Number(inspection.deficiencies_count || 0);
    if (!rejected && deficiencies <= 0) continue;
    const ref = sourceRef("Inspection", inspection, ["inspection_number"]);
    addConstraint(output, existingKeys, {
      key: `inspection:${inspection.id}`,
      sourceType: "Inspection",
      source: inspection,
      sourceRef: ref,
      type: "Quality Hold",
      title: `Quality Hold: ${sourceTitle(ref, "", inspection.inspection_type || inspection.location)}`,
      description: `Generated from ${ref}. Failed or deficient inspection results must be resolved before dependent fabrication, shipment, or erection work proceeds.`,
      priority: rejected ? "High" : "Medium",
      dueDate: inspection.inspection_date,
      area: inspection.location,
      assignedTo: inspection.inspector_name,
    });
  }
}

function deriveScheduleConstraints(output, existingKeys, scheduleTasks, today) {
  for (const task of scheduleTasks || []) {
    if (!task || task.is_deleted || isClosedSource(task)) continue;
    const status = normalize(task.status);
    const percent = Number(task.percent_complete || 0);
    const incomplete = percent < 100 && !CLOSED_STATUSES.has(status);
    const date = task.end_date || task.start_date || task.target_release;
    const late = incomplete && isBeforeToday(date, today);
    const blocked = status.includes("delay") || status.includes("hold") || display(task.blockers);
    const ref = sourceRef("Task", task, ["task_number", "wbs_code"]);
    if (late || blocked) {
      addConstraint(output, existingKeys, {
        key: `schedule-task:${task.id}`,
        sourceType: "Schedule Task",
        source: task,
        sourceRef: ref,
        type: "Schedule Hold",
        title: `Schedule Hold: ${sourceTitle(ref, "", task.task_name || task.name)}`,
        description: blocked
          ? `Generated from ${ref}. The schedule task is blocked or on hold and should be cleared before downstream work is relied on.`
          : `Generated from ${ref}. The schedule task is late and incomplete, which can slip dependent work.`,
        priority: late || status.includes("delay") ? "High" : "Medium",
        dueDate: date,
        workPackageId: task.work_package_id,
        area: task.area || task.zone || task.phase,
        assignedTo: task.assigned_to || task.crew_name,
      });
    }

    const resources = [
      ...(Array.isArray(task.resource_names) ? task.resource_names : []),
      task.crew_id,
      task.crew_name,
      task.assigned_to,
    ].filter(Boolean);
    if (incomplete && resources.length === 0 && isWithinDays(task.start_date, today, 7)) {
      addConstraint(output, existingKeys, {
        key: `schedule-resource:${task.id}`,
        sourceType: "Schedule Task",
        source: task,
        sourceRef: ref,
        type: "Resource Hold",
        title: `Resource Hold: ${sourceTitle(ref, "", task.task_name || task.name)}`,
        description: `Generated from ${ref}. The task starts within 7 days and does not have a crew or resource assignment.`,
        priority: "Medium",
        dueDate: task.start_date,
        workPackageId: task.work_package_id,
        area: task.area || task.zone || task.phase,
      });
    }
  }
}

function deriveWorkPackageConstraints(output, existingKeys, workPackages, drawings, today) {
  const drawingsById = new Map((drawings || []).map((drawing) => [String(drawing.id), drawing]));
  for (const wp of workPackages || []) {
    if (!wp || wp.is_deleted || isClosedSource(wp)) continue;
    const phase = normalize(wp.phase);
    const inProduction = PRODUCTION_PHASES.has(phase);
    const ref = sourceRef("WP", wp, ["wp_number", "package_number"]);
    const title = wp.name || wp.description || wp.wp_number;
    const percent = Number(wp.percent_complete || 0);
    const incomplete = percent < 100;

    if (inProduction && incomplete && !display(wp.crew)) {
      addConstraint(output, existingKeys, {
        key: `wp-resource:${wp.id}`,
        sourceType: "Work Package",
        source: wp,
        sourceRef: ref,
        type: "Resource Hold",
        title: `Resource Hold: ${sourceTitle(ref, "", title)}`,
        description: `Generated from ${ref}. This active production package has no crew assignment.`,
        priority: "Medium",
        dueDate: wp.scheduled_start_date || wp.released_date,
        workPackageId: wp.id,
        area: projectArea(wp),
      });
    }

    if (normalize(wp.status).includes("hold")) {
      addConstraint(output, existingKeys, {
        key: `wp-hold:${wp.id}`,
        sourceType: "Work Package",
        source: wp,
        sourceRef: ref,
        type: "Production Hold",
        title: `Production Hold: ${sourceTitle(ref, "", title)}`,
        description: `Generated from ${ref}. The work package status is on hold, so it should remain visible as a production blocker.`,
        priority: "High",
        dueDate: wp.scheduled_start_date || wp.scheduled_end_date,
        workPackageId: wp.id,
        area: projectArea(wp),
      });
    }

    if (inProduction && incomplete && !wp.released_date) {
      addConstraint(output, existingKeys, {
        key: `wp-release:${wp.id}`,
        sourceType: "Work Package",
        source: wp,
        sourceRef: ref,
        type: "Production Hold",
        title: `Missing Fab Release: ${sourceTitle(ref, "", title)}`,
        description: `Generated from ${ref}. The package is in a production phase but does not have a release date recorded.`,
        priority: "Medium",
        dueDate: wp.scheduled_start_date,
        workPackageId: wp.id,
        area: projectArea(wp),
      });
    }

    const linkedDrawingIds = parseLinkedIds(wp.linked_drawing_ids);
    const linkedDrawings = linkedDrawingIds.map((id) => drawingsById.get(String(id))).filter(Boolean);
    const hasUnreleasedKnownDrawing = linkedDrawings.length > 0 && linkedDrawings.some((drawing) => !isReleasedDrawing(drawing));
    const missingKnownDrawings = linkedDrawingIds.length > linkedDrawings.length;
    if (inProduction && incomplete && (hasUnreleasedKnownDrawing || missingKnownDrawings)) {
      addConstraint(output, existingKeys, {
        key: `wp-ifc:${wp.id}`,
        sourceType: "Work Package",
        source: wp,
        sourceRef: ref,
        type: "IFC Hold",
        title: `IFC Hold: ${sourceTitle(ref, "", title)}`,
        description: missingKnownDrawings
          ? `Generated from ${ref}. One or more linked drawings cannot be found, so IFC/release readiness is uncertain.`
          : `Generated from ${ref}. One or more linked drawings are not released/IFC for production.`,
        priority: "High",
        dueDate: wp.scheduled_start_date || wp.released_date,
        workPackageId: wp.id,
        area: projectArea(wp),
      });
    }
  }
}

export function deriveOperationalConstraints(sources = {}, options = {}) {
  const today = todayStart(options.today);
  const existingKeys = buildExistingConstraintIndex(sources.existingConstraints || []);
  const output = [];

  deriveRfiConstraints(output, existingKeys, sources.rfis, today);
  deriveSubmittalConstraints(output, existingKeys, sources.submittals, today);
  deriveDeliveryConstraints(output, existingKeys, sources.deliveries, today);
  deriveInspectionConstraints(output, existingKeys, sources.inspections);
  deriveScheduleConstraints(output, existingKeys, sources.scheduleTasks, today);
  deriveWorkPackageConstraints(output, existingKeys, sources.workPackages, sources.drawings, today);

  return output.sort((a, b) => {
    const priorityRank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    const priorityDiff = (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2);
    if (priorityDiff !== 0) return priorityDiff;
    const dateA = a.due_date || "9999-12-31";
    const dateB = b.due_date || "9999-12-31";
    if (dateA !== dateB) return String(dateA).localeCompare(String(dateB));
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

export function isGeneratedConstraint(constraint) {
  return Boolean(constraint?._generated || constraint?.metadata?.constraint_engine?.generated);
}
