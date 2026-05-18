/**
 * PCC Scoring Engine — Deterministic, explainable, steel-specific
 * Every item scored here must have transparent, traceable reasons.
 */

// ─── Severity bands ───────────────────────────────────────────────────────────
export const SEVERITY = {
  CRITICAL: { label: "CRITICAL", value: 4, color: "var(--status-error-bright)",   bg: "rgba(255,59,59,0.10)",   border: "rgba(255,59,59,0.25)"   },
  HIGH:     { label: "HIGH",     value: 3, color: "var(--status-warning-bright)", bg: "rgba(255,180,0,0.10)",   border: "rgba(255,180,0,0.25)"   },
  MEDIUM:   { label: "MEDIUM",   value: 2, color: "var(--status-warning)",        bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.18)"  },
  LOW:      { label: "LOW",      value: 1, color: "var(--text-muted)",            bg: "rgba(136,152,168,0.07)", border: "rgba(136,152,168,0.15)" },
};

// ─── Impact tags ──────────────────────────────────────────────────────────────
// Colors below use `var(--…)` tokens except where a specific cyan hue
// (BLOCKS_DETAILING / BLOCKS_ERECTION) has no semantic equivalent in the
// status palette — keeping the literal hex for those makes the domain
// meaning obvious.
export const IMPACT_TAGS = {
  BLOCKS_DETAILING:  { label: "BLOCKS DETAILING",  color: "#0EA5E9" },
  BLOCKS_FAB:        { label: "BLOCKS FAB",         color: "var(--status-review)" },
  BLOCKS_DELIVERY:   { label: "BLOCKS DELIVERY",    color: "var(--status-success)" },
  BLOCKS_ERECTION:   { label: "BLOCKS ERECTION",    color: "#06B6D4" },
  COST_EXPOSURE:     { label: "COST EXPOSURE",       color: "var(--status-warning-bright)" },
  REVISION_CONFLICT: { label: "REVISION CONFLICT",  color: "var(--status-error)" },
  EXTERNAL_WAIT:     { label: "EXTERNAL WAIT",       color: "var(--text-muted)" },
  LONG_LEAD:         { label: "LONG LEAD",           color: "var(--status-warning)" },
  FIELD_COORD:       { label: "FIELD COORD",         color: "var(--status-success-bright)" },
  SCHEDULE_RISK:     { label: "SCHEDULE RISK",       color: "var(--status-review)" },
  OWNER_MISSING:     { label: "OWNER MISSING",       color: "var(--status-error)" },
  RELEASE_GATE:      { label: "RELEASE GATE",        color: "var(--accent)" },
};

const RELEASE_CONFIRMATIONS = [
  ["vif_confirmed", "VIF missing"],
  ["field_dimensions_confirmed", "Field dimensions missing"],
  ["shop_drawing_revision_checked", "Current shop drawing revision not verified"],
  ["e_sheet_checked", "E sheet not checked"],
  ["load_list_complete", "Load list incomplete"],
  ["sequence_aligned", "Erection sequence not aligned"],
  ["site_ready", "Site readiness not confirmed"],
];

const RELEASE_CONFIRMATION_ACTIONS = {
  vif_confirmed: {
    title: "Confirm VIF",
    impact_area: "Fabrication",
    description: "Verify VIF / field dimensions against the current shop drawing and erection sheet before release.",
  },
  field_dimensions_confirmed: {
    title: "Confirm field dimensions",
    impact_area: "Fabrication",
    description: "Confirm field dimensions are received, current, and reflected in the release package.",
  },
  shop_drawing_revision_checked: {
    title: "Verify current shop drawing revision",
    impact_area: "Fabrication",
    description: "Check the active shop drawing revision before fabrication, shipping, or erection release.",
  },
  e_sheet_checked: {
    title: "Verify E sheet",
    impact_area: "Erection",
    description: "Confirm the erection sheet / E sheet matches the work package and latest approved drawings.",
  },
  load_list_complete: {
    title: "Complete load list",
    impact_area: "Shipping",
    description: "Confirm the load list is complete, checked, and aligned with the planned shipment or delivery.",
  },
  sequence_aligned: {
    title: "Confirm erection sequence",
    impact_area: "Erection",
    description: "Verify fabrication, loading, delivery, and erection sequence are aligned before release.",
  },
  site_ready: {
    title: "Confirm site readiness",
    impact_area: "Erection",
    description: "Confirm access, laydown, crane window, and GC readiness before delivery or installation.",
  },
};

function dateValue(date) {
  if (!date) return null;
  const parsed = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysFromToday(date) {
  const parsed = dateValue(date);
  if (!parsed) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((parsed.getTime() - today.getTime()) / 86400000);
}

function ownerOf(item) {
  return item.assigned_to || item.owner || item.waiting_on || null;
}

// ─── Recommended next actions by record type / state ─────────────────────────
export function recommendNextAction(item) {
  const { type, status, overdueDays, waitingOnExternal, blocksPhase } = item;

  if (type === "RFI") {
    if (overdueDays > 7) return "ESCALATE";
    if (waitingOnExternal) return "FOLLOW UP";
    if (status === "Open") return "ASSIGN";
    if (status === "Answered") return "CLOSE ITEM";
    return "REVIEW";
  }
  if (type === "Drawing") {
    if (status === "OFA" || status === "BFA") return "SEND TO ENGINEER";
    if (status === "Released" && blocksPhase === "Fabrication") return "RELEASE TO FAB";
    if (overdueDays > 0) return "ESCALATE";
    return "REVIEW";
  }
  if (type === "WorkPackage") {
    if (status === "On Hold") return "RESOLVE BLOCKER";
    if (blocksPhase === "Delivery") return "CONFIRM DELIVERY";
    if (blocksPhase === "Erection") return "COORDINATE WITH GC";
    return "RELEASE TO FAB";
  }
  if (type === "Delivery") {
    if (overdueDays > 0) return "ESCALATE";
    if (waitingOnExternal) return "CONFIRM DELIVERY";
    return "REVIEW";
  }
  if (type === "ChangeOrder") {
    if (status === "Pending") return "PRICE CO";
    if (status === "Submitted") return "FOLLOW UP";
    return "REVIEW";
  }
  if (type === "Submittal") {
    if (item.review_recommendation) return item.review_recommendation;
    if (status === "Draft") return "Complete submittal and submit for review";
    if (status === "Revise and Resubmit") return "Address reviewer comments and resubmit";
    if (status === "Under Review") return `Follow up with ${item.waiting_on || "reviewer"}`;
    return "Review submittal status";
  }
  if (type === "ScheduleTask") {
    if (blocksPhase === "Delivery") return "CLEAR RELEASE GATE";
    if (blocksPhase === "Erection") return "VERIFY FIELD READY";
    if (status === "Blocked" || status === "On Hold") return "RESOLVE BLOCKER";
    if (status === "Not Started") return "ASSIGN OWNER";
    return "REVIEW TASK";
  }
  if (type === "ActionItem") {
    if (overdueDays > 0) return "COMPLETE TODAY";
    if (blocksPhase === "Delivery") return "CLEAR RELEASE GATE";
    if (blocksPhase === "Erection") return "VERIFY FIELD READY";
    if (blocksPhase === "Fabrication") return "CLEAR FAB BLOCKER";
    if (status === "Open") return "START";
    return "REVIEW ACTION";
  }
  return "REVIEW";
}

// ─── Core scoring function ────────────────────────────────────────────────────
export function scoreItem(item) {
  let score = 0;
  const reasons = [];
  const tags = [];

  const today = new Date();
  const overdueDays = item.due_date
    ? Math.max(0, Math.ceil((today - new Date(item.due_date + "T00:00:00Z")) / 86400000))
    : 0;
  const dueSoonDays = item.due_date && !overdueDays
    ? Math.ceil((new Date(item.due_date + "T00:00:00Z") - today) / 86400000)
    : null;

  // 1. Base score by type priority
  const typeBase = {
    RFI: 30,
    Drawing: 25,
    Submittal: 26,
    WorkPackage: 28,
    Delivery: 32,
    ChangeOrder: 20,
    ScheduleTask: 18,
    ActionItem: 22,
  };
  score += typeBase[item.type] || 10;

  // 2. Overdue logic — primary driver
  if (overdueDays > 14) {
    score += 50;
    reasons.push(`${overdueDays}d overdue`);
    tags.push("BLOCKS_FAB");
  } else if (overdueDays > 7) {
    score += 35;
    reasons.push(`${overdueDays}d overdue`);
  } else if (overdueDays > 0) {
    score += 20;
    reasons.push(`${overdueDays}d overdue`);
  }

  // 3. Due soon logic
  if (dueSoonDays !== null) {
    if (dueSoonDays <= 3) {
      score += 18;
      reasons.push(`Due in ${dueSoonDays}d`);
    } else if (dueSoonDays <= 7) {
      score += 10;
      reasons.push(`Due in ${dueSoonDays}d`);
    }
  }

  if (item.confirmations) {
    const targetDays = daysFromToday(item.target_date || item.due_date);
    const missing = RELEASE_CONFIRMATIONS
      .filter(([key]) => item.confirmations[key] === false)
      .map(([, label]) => label);

    if (missing.length > 0) {
      score += Math.min(45, missing.length * 12);
      tags.push("RELEASE_GATE");
      reasons.push(missing[0]);
      if (targetDays !== null && targetDays <= 2) {
        score += 25;
        tags.push("BLOCKS_DELIVERY");
        reasons.push("48-hour release gate");
      }
    }
  }

  if (!ownerOf(item)) {
    score += 10;
    tags.push("OWNER_MISSING");
    reasons.push("No owner assigned");
  }

  if (item.impact_area === "Fabrication") { score += 25; tags.push("BLOCKS_FAB"); reasons.push("Fabrication impact"); }
  if (item.impact_area === "Shipping")    { score += 20; tags.push("BLOCKS_DELIVERY"); reasons.push("Shipping impact"); }
  if (item.impact_area === "Erection")    { score += 25; tags.push("BLOCKS_ERECTION"); reasons.push("Erection impact"); }
  if (item.impact_area === "Cost")        { score += 20; tags.push("COST_EXPOSURE"); reasons.push("Cost exposure"); }
  if (item.impact_area === "GC Approval") { score += 15; tags.push("EXTERNAL_WAIT"); reasons.push("GC approval impact"); }

  // 4. RFI-specific scoring
  if (item.type === "RFI") {
    if (item.affects_fabrication) { score += 25; tags.push("BLOCKS_FAB"); reasons.push("Affects fabrication"); }
    if (item.affects_drawings)    { score += 15; tags.push("BLOCKS_DETAILING"); reasons.push("Affects drawings"); }
    if (item.affects_erection)    { score += 20; tags.push("BLOCKS_ERECTION"); reasons.push("Affects erection"); }
    if (item.priority === "Critical" || item.priority === "High") { score += 15; reasons.push("High priority"); }
  }

  // 5a. Drawing scoring
  if (item.type === "Drawing") {
    if (item.stage === "OFA" || item.stage === "BFA") { score += 10; reasons.push("Pending engineer review"); tags.push("BLOCKS_DETAILING"); }
    if (item.priority_flag) { score += 12; reasons.push("Priority flagged"); }
  }

  // 5b. Submittal scoring (review engine integration)
  if (item.type === "Submittal") {
    if (item.review_risk === "critical") { score += 25; reasons.push("Critical review flags"); tags.push("BLOCKS_FAB"); }
    else if (item.review_risk === "warning") { score += 12; reasons.push("Review warnings"); }
    if (item.review_flag_count > 3) { score += 8; reasons.push(`${item.review_flag_count} review flags`); }
    if (item.status === "Revise and Resubmit") { score += 15; tags.push("BLOCKS_DETAILING"); reasons.push("R&R — needs detailer action"); }
    if (item.status === "Under Review") { score += 5; tags.push("EXTERNAL_WAIT"); reasons.push("Under external review"); }
  }

  // 6. Work package scoring
  if (item.type === "WorkPackage") {
    if (item.status === "On Hold") { score += 20; reasons.push("On hold — blocker"); tags.push("BLOCKS_FAB"); }
    if (item.percent_complete < 20 && overdueDays > 3) { score += 10; reasons.push("Low progress, overdue"); }
    if (item.phase === "Erection" || item.phase === "Installation") { score += 8; tags.push("BLOCKS_ERECTION"); }
  }

  // 7. Delivery scoring
  if (item.type === "Delivery") {
    if (item.status === "Delayed") { score += 30; tags.push("BLOCKS_DELIVERY"); reasons.push("Delivery delayed"); }
    if (item.priority === "Critical") { score += 20; reasons.push("Critical delivery"); }
  }

  // 8. Change order scoring
  if (item.type === "ChangeOrder") {
    const exposure = parseFloat(item.amount) || 0;
    if (exposure > 50000) { score += 20; tags.push("COST_EXPOSURE"); reasons.push(`$${(exposure / 1000).toFixed(0)}k exposure`); }
    else if (exposure > 10000) { score += 10; tags.push("COST_EXPOSURE"); reasons.push(`$${(exposure / 1000).toFixed(0)}k exposure`); }
    if (item.status === "Pending") { score += 12; reasons.push("Unsigned CO"); }
  }

  // 9. External wait penalty — aging
  if (item.type === "ScheduleTask") {
    if (item.task_kind === "Gate") { score += 18; tags.push("RELEASE_GATE"); reasons.push("Gate item"); }
    if (item.task_kind === "Milestone") { score += 12; tags.push("SCHEDULE_RISK"); reasons.push("Milestone"); }
    if (item.status === "Blocked" || item.status === "On Hold") { score += 25; tags.push("SCHEDULE_RISK"); reasons.push("Blocked task"); }
  }

  if (item.type === "ActionItem") {
    if (item.priority === "Critical") { score += 24; reasons.push("Critical action"); }
    else if (item.priority === "High") { score += 16; reasons.push("High priority action"); }
    if (item.created_from === "production_meeting_parser") { score += 8; reasons.push("Generated from meeting"); }
    if (item.status === "In Progress") { score += 6; reasons.push("In progress"); }
  }

  const externalWait = item.external_wait_days || 0;
  if (externalWait > 14) { score += 20; tags.push("EXTERNAL_WAIT"); reasons.push(`${externalWait}d waiting on external`); }
  else if (externalWait > 7) { score += 10; tags.push("EXTERNAL_WAIT"); reasons.push(`${externalWait}d external wait`); }

  // 10. Determine severity band
  let severityKey = "LOW";
  if (score >= 80)      severityKey = "CRITICAL";
  else if (score >= 55) severityKey = "HIGH";
  else if (score >= 35) severityKey = "MEDIUM";

  const uniqueTags = [...new Set(tags)];
  const uniqueReasons = [...new Set(reasons)].slice(0, 3);

  return {
    ...item,
    score,
    severity: SEVERITY[severityKey],
    severityKey,
    tags: uniqueTags,
    reasons: uniqueReasons,
    overdueDays,
    dueSoonDays,
    nextAction: recommendNextAction({
      type: item.type,
      status: item.status || item.stage,
      overdueDays,
      waitingOnExternal: externalWait > 7,
      blocksPhase: tags.includes("BLOCKS_ERECTION") ? "Erection" : tags.includes("BLOCKS_DELIVERY") ? "Delivery" : tags.includes("BLOCKS_FAB") ? "Fabrication" : null,
    }),
  };
}

// ─── Map raw entity records to normalized PCC items ─────────────────────────
export function mapRFIsToPCCItems(rfis) {
  const RFI_TERMINAL = new Set(["Answered", "Closed", "Void"]);
  return rfis
    .filter((r) => !RFI_TERMINAL.has(r.status))
    .map((r) => {
      // External wait: only meaningful for RFIs actively waiting on an
      // external party (Under Review / Open with a ball_in_court).
      // Measured from date_submitted — creation date is not a wait.
      const isWaiting = r.status === "Under Review" || r.status === "Open";
      const waitStart = isWaiting ? (r.date_submitted || r.created_date) : null;
      const externalWait = waitStart
        ? Math.max(0, Math.ceil((Date.now() - new Date(waitStart).getTime()) / 86400000))
        : 0;
      return {
        id: `rfi-${r.id}`,
        entityId: r.id,
        type: "RFI",
        title: r.question || r.subject || `RFI #${r.rfi_number || r.id?.slice(0, 8) || "?"}`,
        subtitle: `RFI #${r.rfi_number || ""}`,
        status: r.status,
        due_date: r.date_required || r.due_date || r.required_by,
        assigned_to: r.assigned_to || r.ball_in_court,
        waiting_on: r.ball_in_court || r.assigned_to,
        affects_fabrication: r.affects_fabrication || false,
        affects_drawings: r.affects_drawings || false,
        affects_erection: r.affects_erection || false,
        priority: r.priority || r.severity,
        external_wait_days: externalWait,
        project_id: r.project_id,
        project_name: r.project_name,
      };
    });
}

export function mapDrawingsToPCCItems(drawings) {
  return drawings
    .filter((d) => d.stage !== "Released" && d.stage !== "Void")
    .map((d) => ({
      id: `dwg-${d.id}`,
      entityId: d.id,
      type: "Drawing",
      title: `${d.sheet_number || ""} ${d.title || ""}`.trim() || "Untitled Drawing",
      subtitle: d.drawing_set_name || "Ungrouped",
      status: d.stage,
      due_date: d.due_date,
      stage: d.stage,
      priority_flag: d.priority_flag || false,
      assigned_to: d.reviewer,
      waiting_on: d.reviewer,
      project_id: d.project_id,
      project_name: d.project_name,
    }));
}

export function mapWorkPackagesToPCCItems(wps) {
  return wps
    .filter((w) => w.status !== "Complete" && w.status !== "Cancelled")
    .map((w) => {
      const targetDate = w.ship_date || w.delivery_date || w.install_date || w.released_date;
      const targetDays = daysFromToday(targetDate);
      const phaseNeedsGate = ["Fabrication", "Delivery", "Erection", "Installation"].includes(w.phase) || (targetDays !== null && targetDays <= 10);

      // due_date = the next meaningful deadline for this WP, NOT released_date
      // (released_date is when it WAS released — always in the past for
      // active WPs, which would make every released WP "overdue").
      const dueDate = w.ship_date || w.delivery_date || w.install_date || null;

      // Release-gate confirmations only matter when the WP has explicitly
      // populated gate fields OR is within 14 days of its target date.
      // Applying gates universally inflates scores because most WPs have
      // no gate fields set → all 7 gates read as missing → +45 score.
      const hasAnyGateField = !!(
        w.vif_confirmed || w.field_dimensions_confirmed ||
        w.shop_drawing_revision_checked || w.current_drawing_revision_checked ||
        w.e_sheet_checked || w.erection_sheet_checked ||
        w.load_list_complete || w.load_list_completed ||
        w.sequence_aligned || w.erection_sequence_aligned ||
        w.site_ready || w.drawings_approved
      );
      const gateApplicable = phaseNeedsGate && (hasAnyGateField || (targetDays !== null && targetDays <= 14 && targetDays >= 0));

      return {
        id: `wp-${w.id}`,
        entityId: w.id,
        type: "WorkPackage",
        title: w.name || `WP #${w.id}`,
        subtitle: w.phase || "",
        status: w.status,
        due_date: dueDate,
        target_date: targetDate,
        percent_complete: w.percent_complete || 0,
        phase: w.phase,
        assigned_to: w.assigned_to || w.owner || w.crew,
        waiting_on: null,
        impact_area: w.phase === "Delivery" ? "Shipping" : w.phase === "Erection" || w.phase === "Installation" ? "Erection" : "Fabrication",
        confirmations: gateApplicable ? {
          vif_confirmed: !!(w.vif_confirmed || w.field_dimensions_confirmed),
          field_dimensions_confirmed: !!(w.field_dimensions_confirmed || w.vif_confirmed),
          shop_drawing_revision_checked: !!(w.shop_drawing_revision_checked || w.current_drawing_revision_checked || w.drawings_approved),
          e_sheet_checked: !!(w.e_sheet_checked || w.erection_sheet_checked),
          load_list_complete: !!(w.load_list_complete || w.load_list_completed),
          sequence_aligned: !!(w.sequence_aligned || w.erection_sequence_aligned),
          site_ready: !!w.site_ready,
        } : null,
        project_id: w.project_id,
        project_name: w.project_name,
      };
    });
}

export function mapScheduleTasksToPCCItems(tasks) {
  const TASK_TERMINAL = new Set(["Complete", "Completed", "Cancelled", "Closed", "Done"]);
  return tasks
    .filter((t) => {
      const metadata = t.metadata || {};
      const isSummary = t.is_summary || metadata.is_summary || ["Summary", "Phase"].includes(t.task_type);
      if (isSummary) return false;
      if (TASK_TERMINAL.has(t.status)) return false;
      // Tasks at 100% completion are done regardless of status label
      if (t.percent_complete >= 100) return false;
      return true;
    })
    .map((t) => {
      const metadata = t.metadata || {};
      const dueDate = t.end_date || t.start_date || null;
      const phase = t.phase || "";
      const taskType = t.task_type || "Task";
      const isGate = taskType === "Gate" || /gate|release check|48-hour/i.test(t.task_name || "");
      const isMilestone = taskType === "Milestone" || t.is_milestone;
      const impactArea =
        /deliver|ship|load/i.test(`${phase} ${taskType} ${t.task_name || ""}`) ? "Shipping"
        : /erect|install|field|crane/i.test(`${phase} ${taskType} ${t.task_name || ""}`) ? "Erection"
        : /co|change|cost/i.test(`${phase} ${taskType} ${t.task_name || ""}`) ? "Cost"
        : /fab|shop|release/i.test(`${phase} ${taskType} ${t.task_name || ""}`) ? "Fabrication"
        : null;

      return {
        id: `task-${t.id}`,
        entityId: t.id,
        type: "ScheduleTask",
        title: [t.wbs_code, t.task_name || t.name || "Schedule task"].filter(Boolean).join(" - "),
        subtitle: phase || taskType,
        status: t.status,
        due_date: dueDate,
        target_date: dueDate,
        assigned_to: t.resource_names || t.assigned_to || t.owner || t.crew,
        waiting_on: t.ball_in_court || null,
        task_kind: isGate ? "Gate" : isMilestone ? "Milestone" : taskType,
        impact_area: impactArea,
        confirmations: metadata.release_gate ? {
          vif_confirmed: metadata.release_gate.vif_confirmed !== false,
          field_dimensions_confirmed: metadata.release_gate.field_dimensions_confirmed !== false,
          shop_drawing_revision_checked: metadata.release_gate.shop_drawing_revision_checked !== false,
          e_sheet_checked: metadata.release_gate.e_sheet_checked !== false,
          load_list_complete: metadata.release_gate.load_list_complete !== false,
          sequence_aligned: metadata.release_gate.sequence_aligned !== false,
          site_ready: metadata.release_gate.site_ready !== false,
        } : null,
        project_id: t.project_id,
        project_name: t.project_name,
      };
    });
}

export function mapDeliveriesToPCCItems(deliveries) {
  return deliveries
    .filter((d) => d.status !== "Delivered" && d.status !== "Cancelled" && d.status !== "Received")
    .map((d) => {
      // Only score release gates when the delivery has explicitly set
      // gate fields OR is within 14 days of scheduled date. Without
      // this, every delivery gets 7 missing gates → +45 score.
      const daysOut = daysFromToday(d.scheduled_date);
      const hasAnyGateField = !!(
        d.vif_confirmed || d.field_dimensions_confirmed ||
        d.shop_drawing_revision_checked || d.e_sheet_checked ||
        d.load_list_complete || d.load_list_completed || d.items_confirmed ||
        d.sequence_aligned || d.site_ready
      );
      const gateApplicable = hasAnyGateField || (daysOut !== null && daysOut <= 14 && daysOut >= 0);

      return {
        id: `del-${d.id}`,
        entityId: d.id,
        type: "Delivery",
        title: d.description || `DEL-${d.delivery_id || d.id}`,
        subtitle: `Delivery`,
        status: d.status,
        due_date: d.scheduled_date,
        target_date: d.scheduled_date,
        priority: d.priority,
        assigned_to: d.contact_name,
        waiting_on: d.vendor || d.supplier,
        impact_area: "Shipping",
        confirmations: gateApplicable ? {
          vif_confirmed: d.vif_confirmed !== false,
          field_dimensions_confirmed: d.field_dimensions_confirmed !== false,
          shop_drawing_revision_checked: d.shop_drawing_revision_checked !== false,
          e_sheet_checked: d.e_sheet_checked !== false,
          load_list_complete: !!(d.load_list_complete || d.load_list_completed || d.items_confirmed),
          sequence_aligned: d.sequence_aligned !== false,
          site_ready: d.site_ready !== false,
        } : null,
        project_id: d.project_id,
        project_name: d.project_name,
      };
    });
}

export function mapChangeOrdersToPCCItems(cos) {
  return cos
    .filter((c) => c.status !== "Approved" && c.status !== "Rejected" && c.status !== "Void")
    .map((c) => ({
      id: `co-${c.id}`,
      entityId: c.id,
      type: "ChangeOrder",
      title: c.title || c.description || `CO #${c.change_order_number || c.id}`,
      subtitle: `Change Order`,
      status: c.status,
      due_date: c.due_date || c.required_by,
      amount: c.amount || c.estimated_cost || 0,
      assigned_to: c.assigned_to,
      waiting_on: c.owner || c.gc_name,
      project_id: c.project_id,
      project_name: c.project_name,
    }));
}

// ─── Build scored + sorted priority feed ─────────────────────────────────────
export function mapActionItemsToPCCItems(actionItems) {
  return actionItems
    .filter((a) => a.status !== "Complete" && a.status !== "Cancelled")
    .map((a) => {
      const metadata = a.metadata || {};
      const text = `${a.title || ""} ${a.description || ""}`;
      const impactArea = metadata.impact_area || (
        /\b(ship|deliver|load list|truck)\b/i.test(text) ? "Shipping"
        : /\b(erect|install|field|crane|site)\b/i.test(text) ? "Erection"
        : /\b(co|change order|cost|notice|exposure|backcharge)\b/i.test(text) ? "Cost"
        : /\b(gc|architect|engineer|eor|aor|approval|rfi)\b/i.test(text) ? "GC Approval"
        : /\b(fab|shop|release|vif|drawing|galv|paint)\b/i.test(text) ? "Fabrication"
        : null
      );

      return {
        id: `action-${a.id}`,
        entityId: a.id,
        type: "ActionItem",
        title: a.title || "Untitled Action Item",
        subtitle: metadata.task_type || a.meeting_reference || "Action Item",
        status: a.status,
        due_date: a.due_date,
        target_date: a.due_date,
        priority: a.priority,
        assigned_to: a.assigned_to,
        waiting_on: metadata.waiting_on || null,
        impact_area: impactArea,
        created_from: metadata.created_from,
        project_id: a.project_id,
        project_name: a.project_name,
      };
    });
}

export function buildPriorityFeed(allItems) {
  return allItems
    .map(scoreItem)
    .sort((a, b) => b.score - a.score);
}

// ─── Build signal card KPIs from scored feed ──────────────────────────────────
export function buildSignalKPIs(scoredItems, allDeliveries) {
  const critical   = scoredItems.filter((i) => i.severityKey === "CRITICAL").length;
  const highRisk   = scoredItems.filter((i) => i.severityKey === "HIGH").length;
  const external   = scoredItems.filter((i) => i.tags.includes("EXTERNAL_WAIT")).length;
  const overdueAll = scoredItems.filter((i) => i.overdueDays > 0).length;
  const blocksFab  = scoredItems.filter((i) => i.tags.includes("BLOCKS_FAB")).length;
  const blocksErec = scoredItems.filter((i) => i.tags.includes("BLOCKS_ERECTION")).length;
  const coExposure = scoredItems
    .filter((i) => i.type === "ChangeOrder")
    .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  return { critical, highRisk, external, overdueAll, blocksFab, blocksErec, coExposure };
}

// ─── Build waiting-on board ───────────────────────────────────────────────────
export function buildWaitingOnBoard(scoredItems) {
  const external = scoredItems.filter((i) => i.tags.includes("EXTERNAL_WAIT") || i.external_wait_days > 3);
  const grouped = {};
  external.forEach((item) => {
    const party = item.waiting_on || "Unknown";
    if (!grouped[party]) grouped[party] = [];
    grouped[party].push(item);
  });
  return Object.entries(grouped)
    .map(([party, items]) => ({ party, items, count: items.length, maxScore: items.length > 0 ? Math.max(...items.map((i) => i.score)) : 0 }))
    .sort((a, b) => b.maxScore - a.maxScore);
}

export function buildExecutionWindows(scoredItems) {
  const withWindow = scoredItems
    .map((item) => ({ ...item, daysOut: daysFromToday(item.target_date || item.due_date) }))
    .filter((item) => item.daysOut !== null);

  const today = scoredItems
    .filter((item) => item.overdueDays > 0 || item.dueSoonDays === 0 || item.severityKey === "CRITICAL")
    .slice(0, 12);

  const next48 = withWindow
    .filter((item) => item.daysOut >= 0 && item.daysOut <= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 16);

  const next10 = withWindow
    .filter((item) => item.daysOut >= 0 && item.daysOut <= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);

  const releaseGate = withWindow
    .filter((item) => item.daysOut >= 0 && item.daysOut <= 2 && (item.tags.includes("RELEASE_GATE") || item.tags.includes("BLOCKS_DELIVERY")))
    .sort((a, b) => b.score - a.score)
    .slice(0, 18);

  return { today, next48, next10, releaseGate };
}

export function buildOwnerLoad(scoredItems) {
  const grouped = {};
  scoredItems.forEach((item) => {
    const owner = ownerOf(item) || "Unassigned";
    if (!grouped[owner]) {
      grouped[owner] = {
        owner,
        dueToday: 0,
        due48: 0,
        overdue: 0,
        blocked: 0,
        critical: 0,
        total: 0,
        maxScore: 0,
      };
    }
    const row = grouped[owner];
    const daysOut = daysFromToday(item.target_date || item.due_date);
    row.total += 1;
    row.maxScore = Math.max(row.maxScore, item.score || 0);
    if (item.overdueDays > 0) row.overdue += 1;
    if (daysOut === 0) row.dueToday += 1;
    if (daysOut !== null && daysOut >= 0 && daysOut <= 2) row.due48 += 1;
    if (item.tags.includes("BLOCKS_FAB") || item.tags.includes("BLOCKS_DELIVERY") || item.tags.includes("BLOCKS_ERECTION") || item.tags.includes("RELEASE_GATE")) row.blocked += 1;
    if (item.severityKey === "CRITICAL") row.critical += 1;
  });

  return Object.values(grouped).sort((a, b) =>
    b.critical - a.critical ||
    b.blocked - a.blocked ||
    b.overdue - a.overdue ||
    b.due48 - a.due48 ||
    b.maxScore - a.maxScore
  );
}

export function buildDailyBriefing(scoredItems, executionWindows, waitingBoard) {
  const isHighSignal = (item) => item.severityKey === "CRITICAL" || item.severityKey === "HIGH";
  const hasAnyTag = (item, tags) => tags.some((tag) => item.tags.includes(tag));

  const criticalReleases = scoredItems
    .filter((item) => isHighSignal(item) && hasAnyTag(item, ["RELEASE_GATE", "BLOCKS_DELIVERY", "BLOCKS_FAB", "BLOCKS_ERECTION"]))
    .slice(0, 6);

  const waitingOn = waitingBoard
    .flatMap((group) => group.items.map((item) => ({ ...item, waitingParty: group.party })))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const next48 = (executionWindows?.next48 || [])
    .filter((item) => isHighSignal(item) || hasAnyTag(item, ["RELEASE_GATE", "BLOCKS_DELIVERY", "BLOCKS_FAB", "BLOCKS_ERECTION"]))
    .slice(0, 8);

  const scheduleRisk = scoredItems
    .filter((item) => hasAnyTag(item, ["SCHEDULE_RISK", "OWNER_MISSING"]) || item.type === "ScheduleTask")
    .slice(0, 8);

  const costExposure = scoredItems
    .filter((item) => hasAnyTag(item, ["COST_EXPOSURE"]))
    .slice(0, 6);

  return {
    criticalReleases,
    waitingOn,
    next48,
    scheduleRisk,
    costExposure,
    total:
      criticalReleases.length +
      waitingOn.length +
      next48.length +
      scheduleRisk.length +
      costExposure.length,
  };
}

export function buildReleaseGateActionDrafts(scoredItems, existingActionItems = []) {
  const existingKeys = new Set(
    (existingActionItems || [])
      .map((item) => item?.metadata?.pcc_release_gate_key)
      .filter(Boolean)
  );

  return (scoredItems || [])
    .filter((item) => item?.confirmations && (item.tags || []).includes("RELEASE_GATE"))
    .flatMap((item) => {
      const targetDate = item.target_date || item.due_date || null;
      const daysOut = daysFromToday(targetDate);

      return RELEASE_CONFIRMATIONS
        .filter(([key]) => item.confirmations[key] === false)
        .map(([key, missingLabel]) => {
          const action = RELEASE_CONFIRMATION_ACTIONS[key] || {
            title: missingLabel,
            impact_area: item.impact_area || null,
            description: missingLabel,
          };
          const releaseKey = `${item.type}:${item.entityId || item.id}:${key}`;
          if (existingKeys.has(releaseKey)) return null;

          const priority =
            daysOut !== null && daysOut <= 2 ? "Critical"
            : item.severityKey === "CRITICAL" ? "Critical"
            : item.severityKey === "HIGH" ? "High"
            : "Medium";

          const due_date = targetDate || new Date().toISOString().slice(0, 10);
          const scope = item.subtitle ? `${item.title} (${item.subtitle})` : item.title;

          return {
            key: releaseKey,
            sourceItemId: item.id,
            sourceType: item.type,
            sourceEntityId: item.entityId,
            confirmationKey: key,
            title: `${action.title}: ${item.title}`,
            description: [
              action.description,
              `Source: ${scope}.`,
              `Reason: ${missingLabel}.`,
              targetDate ? `Target date: ${targetDate}.` : null,
            ].filter(Boolean).join("\n"),
            assigned_to: item.assigned_to || "",
            due_date,
            priority,
            status: "Open",
            project_id: item.project_id,
            project_name: item.project_name,
            metadata: {
              created_from: "pcc_release_gate",
              pcc_release_gate_key: releaseKey,
              source_type: item.type,
              source_id: item.entityId || item.id,
              confirmation_key: key,
              missing_confirmation: missingLabel,
              impact_area: action.impact_area || item.impact_area || null,
              source_title: item.title,
              source_subtitle: item.subtitle || null,
              target_date: targetDate,
              pcc_score: item.score,
              pcc_severity: item.severityKey,
            },
          };
        })
        .filter(Boolean);
    })
    .sort((a, b) => {
      const priorityRank = { Critical: 3, High: 2, Medium: 1, Low: 0 };
      return (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0)
        || String(a.due_date || "").localeCompare(String(b.due_date || ""))
        || String(a.title || "").localeCompare(String(b.title || ""));
    });
}
