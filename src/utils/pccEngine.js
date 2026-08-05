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

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Normalize a string for case-insensitive status comparison */
function norm(value) {
  return String(value || "").trim().toLowerCase();
}

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
  const { type, overdueDays, waitingOnExternal, blocksPhase } = item;
  const s = norm(item.status);

  if (type === "RFI") {
    if (overdueDays > 7) return "ESCALATE";
    if (waitingOnExternal) return "FOLLOW UP";
    if (s === "open") return "ASSIGN";
    if (s === "answered") return "CLOSE ITEM";
    return "REVIEW";
  }
  if (type === "Drawing") {
    if (s === "ofa" || s === "bfa") return "SEND TO ENGINEER";
    if (s === "released" && blocksPhase === "Fabrication") return "RELEASE TO FAB";
    if (overdueDays > 0) return "ESCALATE";
    return "REVIEW";
  }
  if (type === "WorkPackage") {
    if (s === "on hold") return "RESOLVE BLOCKER";
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
    // change_orders.status vocabulary: Draft / Submitted / Under Review /
    // Approved / Rejected / Void (there is no "pending").
    if (s === "draft") return "PRICE CO";
    if (s === "submitted" || s === "under review") return "FOLLOW UP";
    return "REVIEW";
  }
  if (type === "Submittal") {
    if (item.review_recommendation) return item.review_recommendation;
    if (s === "draft") return "Complete submittal and submit for review";
    if (s === "revise and resubmit") return "Address reviewer comments and resubmit";
    if (s === "under review") return `Follow up with ${item.waiting_on || "reviewer"}`;
    return "Review submittal status";
  }
  if (type === "ScheduleTask") {
    if (blocksPhase === "Delivery") return "CLEAR RELEASE GATE";
    if (blocksPhase === "Erection") return "VERIFY FIELD READY";
    // schedule_tasks.status vocabulary is On Hold / Delayed (no "blocked");
    // keep "blocked" as a harmless legacy alias.
    if (s === "blocked" || s === "on hold" || s === "delayed") return "RESOLVE BLOCKER";
    if (s === "not started") return "ASSIGN OWNER";
    return "REVIEW TASK";
  }
  if (type === "ActionItem") {
    if (overdueDays > 0) return "COMPLETE TODAY";
    if (blocksPhase === "Delivery") return "CLEAR RELEASE GATE";
    if (blocksPhase === "Erection") return "VERIFY FIELD READY";
    if (blocksPhase === "Fabrication") return "CLEAR FAB BLOCKER";
    if (s === "open") return "START";
    return "REVIEW ACTION";
  }
  return "REVIEW";
}

// ─── Core scoring function ────────────────────────────────────────────────────
export function scoreItem(item) {
  let score = 0;
  const reasons = [];
  const tags = [];
  // Record each reason with the point value it contributed, so the reason
  // list can be ranked by impact (not push order) before it is truncated.
  const note = (points, text) => reasons.push({ points, text });

  // Overdue / due-soon on the SAME local-calendar-day basis as
  // daysFromToday/dateValue, so the two date paths never disagree and scoring
  // is stable across the day (no wall-clock time-of-day drift). daysFromToday
  // returns whole days: negative = past (overdue), 0 = today, positive = future.
  const dueDelta = daysFromToday(item.due_date);
  const overdueDays = dueDelta !== null && dueDelta < 0 ? -dueDelta : 0;
  const dueSoonDays = dueDelta !== null && dueDelta >= 0 ? dueDelta : null;

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
    note(50, `${overdueDays}d overdue`);
    tags.push("BLOCKS_FAB");
  } else if (overdueDays > 7) {
    score += 35;
    note(35, `${overdueDays}d overdue`);
  } else if (overdueDays > 0) {
    score += 20;
    note(20, `${overdueDays}d overdue`);
  }

  // 3. Due soon logic
  if (dueSoonDays !== null) {
    if (dueSoonDays <= 3) {
      score += 18;
      note(18, `Due in ${dueSoonDays}d`);
    } else if (dueSoonDays <= 7) {
      score += 10;
      note(10, `Due in ${dueSoonDays}d`);
    }
  }

  if (item.confirmations) {
    const targetDays = daysFromToday(item.target_date || item.due_date);
    const missing = RELEASE_CONFIRMATIONS
      .filter(([key]) => item.confirmations[key] === false)
      .map(([, label]) => label);

    if (missing.length > 0) {
      const gatePoints = Math.min(45, missing.length * 12);
      score += gatePoints;
      tags.push("RELEASE_GATE");
      note(gatePoints, missing[0]);
      if (targetDays !== null && targetDays <= 2) {
        score += 25;
        tags.push("BLOCKS_DELIVERY");
        note(25, "48-hour release gate");
      }
    }
  }

  if (!ownerOf(item)) {
    score += 10;
    tags.push("OWNER_MISSING");
    note(10, "No owner assigned");
  }

  if (item.impact_area === "Fabrication") { score += 25; tags.push("BLOCKS_FAB"); note(25, "Fabrication impact"); }
  if (item.impact_area === "Shipping")    { score += 20; tags.push("BLOCKS_DELIVERY"); note(20, "Shipping impact"); }
  if (item.impact_area === "Erection")    { score += 25; tags.push("BLOCKS_ERECTION"); note(25, "Erection impact"); }
  if (item.impact_area === "Cost")        { score += 20; tags.push("COST_EXPOSURE"); note(20, "Cost exposure"); }
  if (item.impact_area === "GC Approval") { score += 15; tags.push("EXTERNAL_WAIT"); note(15, "GC approval impact"); }

  // Normalize status/stage/priority once for case-insensitive comparisons
  const itemStatus = norm(item.status || item.stage);
  const itemPriority = norm(item.priority);

  // 4. RFI-specific scoring
  if (item.type === "RFI") {
    if (item.affects_fabrication) { score += 25; tags.push("BLOCKS_FAB"); note(25, "Affects fabrication"); }
    if (item.affects_drawings)    { score += 15; tags.push("BLOCKS_DETAILING"); note(15, "Affects drawings"); }
    if (item.affects_erection)    { score += 20; tags.push("BLOCKS_ERECTION"); note(20, "Affects erection"); }
    if (itemPriority === "critical" || itemPriority === "high") { score += 15; note(15, "High priority"); }
  }

  // 5a. Drawing scoring
  if (item.type === "Drawing") {
    const stageN = norm(item.stage);
    if (stageN === "ofa" || stageN === "bfa") { score += 10; note(10, "Pending engineer review"); tags.push("BLOCKS_DETAILING"); }
    if (item.priority_flag) { score += 12; note(12, "Priority flagged"); }
  }

  // 5b. Submittal scoring (review engine integration)
  if (item.type === "Submittal") {
    if (item.review_risk === "critical") { score += 25; note(25, "Critical review flags"); tags.push("BLOCKS_FAB"); }
    else if (item.review_risk === "warning") { score += 12; note(12, "Review warnings"); }
    if (item.review_flag_count > 3) { score += 8; note(8, `${item.review_flag_count} review flags`); }
    if (itemStatus === "revise and resubmit") { score += 15; tags.push("BLOCKS_DETAILING"); note(15, "R&R — needs detailer action"); }
    if (itemStatus === "rejected") { score += 18; tags.push("BLOCKS_DETAILING"); note(18, "Rejected — needs resubmission"); }
    if (itemStatus === "under review") { score += 5; tags.push("EXTERNAL_WAIT"); note(5, "Under external review"); }
    if (item.round_friction) { score += 10; note(10, `${item.round_count} rounds — review friction`); }
  }

  // 6. Work package scoring
  if (item.type === "WorkPackage") {
    if (itemStatus === "on hold") { score += 20; note(20, "On hold — blocker"); tags.push("BLOCKS_FAB"); }
    if (item.percent_complete < 20 && overdueDays > 3) { score += 10; note(10, "Low progress, overdue"); }
    const phaseN = norm(item.phase);
    if (phaseN === "erection" || phaseN === "installation") { score += 8; tags.push("BLOCKS_ERECTION"); }
  }

  // 7. Delivery scoring
  if (item.type === "Delivery") {
    if (itemStatus === "delayed") { score += 30; tags.push("BLOCKS_DELIVERY"); note(30, "Delivery delayed"); }
    if (itemPriority === "critical") { score += 20; note(20, "Critical delivery"); }
  }

  // 8. Change order scoring
  if (item.type === "ChangeOrder") {
    const exposure = parseFloat(item.amount) || 0;
    if (exposure > 50000) { score += 20; tags.push("COST_EXPOSURE"); note(20, `$${(exposure / 1000).toFixed(0)}k exposure`); }
    else if (exposure > 10000) { score += 10; tags.push("COST_EXPOSURE"); note(10, `$${(exposure / 1000).toFixed(0)}k exposure`); }
    // change_orders.status has no "pending"; any non-terminal CO (Draft /
    // Submitted / Under Review) is unsigned cost risk.
    if (itemStatus === "draft" || itemStatus === "submitted" || itemStatus === "under review") { score += 12; note(12, "Unsigned CO"); }
  }

  // 9. Schedule task scoring
  if (item.type === "ScheduleTask") {
    if (item.task_kind === "Gate") { score += 18; tags.push("RELEASE_GATE"); note(18, "Gate item"); }
    if (item.task_kind === "Milestone") { score += 12; tags.push("SCHEDULE_RISK"); note(12, "Milestone"); }
    // schedule_tasks.status vocabulary is On Hold / Delayed (no "blocked").
    if (itemStatus === "blocked" || itemStatus === "on hold" || itemStatus === "delayed") { score += 25; tags.push("SCHEDULE_RISK"); note(25, "Blocked task"); }
  }

  if (item.type === "ActionItem") {
    if (itemPriority === "critical") { score += 24; note(24, "Critical action"); }
    else if (itemPriority === "high") { score += 16; note(16, "High priority action"); }
    if (item.created_from === "production_meeting_parser") { score += 8; note(8, "Generated from meeting"); }
    if (itemStatus === "in progress") { score += 6; note(6, "In progress"); }
  }

  const externalWait = item.external_wait_days || 0;
  if (externalWait > 14) { score += 20; tags.push("EXTERNAL_WAIT"); note(20, `${externalWait}d waiting on external`); }
  else if (externalWait > 7) { score += 10; tags.push("EXTERNAL_WAIT"); note(10, `${externalWait}d external wait`); }

  // 10. Determine severity band
  let severityKey = "LOW";
  if (score >= 80)      severityKey = "CRITICAL";
  else if (score >= 55) severityKey = "HIGH";
  else if (score >= 35) severityKey = "MEDIUM";

  const uniqueTags = [...new Set(tags)];
  // Rank reasons by point contribution (desc), de-dupe by text, keep top 3 —
  // so the dominant scoring factor is never crowded out of the "explainable"
  // list by earlier, lower-value reasons. Array.sort is stable, so ties keep
  // their original push order.
  const seenReasons = new Set();
  const uniqueReasons = [];
  reasons
    .slice()
    .sort((a, b) => b.points - a.points)
    .forEach((r) => {
      if (!seenReasons.has(r.text)) { seenReasons.add(r.text); uniqueReasons.push(r.text); }
    });
  const topReasons = uniqueReasons.slice(0, 3);

  return {
    ...item,
    score,
    severity: SEVERITY[severityKey],
    severityKey,
    tags: uniqueTags,
    reasons: topReasons,
    overdueDays,
    dueSoonDays,
    nextAction: recommendNextAction({
      type: item.type,
      status: item.status || item.stage,
      overdueDays,
      waitingOnExternal: externalWait > 7,
      blocksPhase: tags.includes("BLOCKS_ERECTION") ? "Erection" : tags.includes("BLOCKS_DELIVERY") ? "Delivery" : tags.includes("BLOCKS_FAB") ? "Fabrication" : null,
      // Pass through fields recommendNextAction reads directly, so Submittal
      // follow-ups use the real ball_in_court / review recommendation instead
      // of the generic "reviewer" fallback.
      waiting_on: item.waiting_on,
      review_recommendation: item.review_recommendation,
    }),
  };
}

// ─── Map raw entity records to normalized PCC items ─────────────────────────
export function mapRFIsToPCCItems(rfis) {
  const RFI_TERMINAL = new Set(["answered", "closed", "complete", "completed", "cancelled", "canceled", "void"]);
  return (rfis || [])
    .filter((r) => !RFI_TERMINAL.has(norm(r.status)))
    .map((r) => {
      // External wait: only meaningful for RFIs actively waiting on an
      // external party (Under Review / Open with a ball_in_court).
      // Measured from date_submitted — creation date is not a wait.
      const ns = norm(r.status);
      const isWaiting = ns === "under review" || ns === "open";
      const waitStart = isWaiting ? (r.date_submitted || r.created_date) : null;
      // Days waited so far = how far in the past the wait started. daysFromToday
      // is local-midnight anchored (stable within a day, unlike Date.now()) and
      // returns null for missing/unparseable dates, so bad input yields 0 not NaN.
      const waitDelta = daysFromToday(waitStart);
      const externalWait = waitDelta !== null && waitDelta < 0 ? -waitDelta : 0;
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
  const DRAWING_TERMINAL = new Set(["released", "void", "cancelled", "canceled"]);
  return (drawings || [])
    .filter((d) => !DRAWING_TERMINAL.has(norm(d.stage)))
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

/**
 * Basic submittal → PCC mapper (no review-engine scoring).
 *
 * NOTE: scoreItem's Submittal branch scores on review_risk / review_flag_count
 * and recommendNextAction reads review_recommendation — fields this mapper does
 * NOT populate. For review-driven scoring use the review-aware
 * mapSubmittalsToPCCItems exported from src/lib/submittalReviewEngine.js. This
 * one is suffixed *Basic to avoid the duplicate-export name collision.
 */
export function mapSubmittalsToPCCItemsBasic(submittals) {
  const SUB_TERMINAL = new Set([
    "approved", "approved as noted", "released for fabrication",
    "void", "cancelled", "canceled",
  ]);
  return (submittals || [])
    .filter((s) => !SUB_TERMINAL.has(norm(s.status)))
    .map((s) => {
      const requiredDelta = daysFromToday(s.required_date);
      const isOverdue = requiredDelta !== null && requiredDelta < 0;
      const isRejected = norm(s.status) === "rejected" || norm(s.status) === "revise and resubmit";
      const rounds = Number(s.total_rounds) || 0;
      const roundFriction = rounds >= 3;
      const text = `${s.title || ""} ${s.description || ""}`;

      return {
        id: `sub-${s.id}`,
        entityId: s.id,
        type: "Submittal",
        title: [s.submittal_number, s.title || s.description].filter(Boolean).join(" — ") || "Untitled Submittal",
        subtitle: s.spec_section || `Round ${rounds || 1}`,
        status: s.status,
        due_date: s.required_date,
        target_date: s.required_date,
        priority: isRejected ? "High" : isOverdue ? "High" : roundFriction ? "Medium" : s.priority,
        assigned_to: s.ball_in_court,
        waiting_on: s.ball_in_court,
        impact_area: /\b(erect|install|field|crane)\b/i.test(text) ? "Erection"
          // "shop" → Fabrication, but NOT "shop drawing(s)/dwg" (the document
          // itself, present in nearly every shop-drawing submittal title).
          // Lookahead allows space/slash/hyphen separators: "Shop-Drawings",
          // "Shop/Dwg", "Shop Drawings" all suppressed.
          : (/\b(fab|galv|paint)\b/i.test(text) || /\bshop\b(?![\s/-]*(draw|dwg))/i.test(text)) ? "Fabrication"
          : "GC Approval",
        round_count: rounds,
        round_friction: roundFriction,
        is_rejected: isRejected,
        project_id: s.project_id,
        project_name: s.project_name,
      };
    });
}

export function mapWorkPackagesToPCCItems(wps) {
  const WP_TERMINAL = new Set(["complete", "completed", "cancelled", "canceled", "void"]);
  return (wps || [])
    .filter((w) => !WP_TERMINAL.has(norm(w.status)))
    .map((w) => {
      const targetDate = w.ship_date || w.delivery_date || w.install_date || w.released_date;
      const targetDays = daysFromToday(targetDate);
      const phaseNeedsGate = ["Fabrication", "Delivery", "Erection", "Installation"].includes(w.phase) || (targetDays !== null && targetDays <= 10);

      // due_date = the next meaningful deadline for this WP, NOT released_date
      // (released_date is when it WAS released — always in the past for
      // active WPs, which would make every released WP "overdue").
      const dueDate = w.ship_date || w.delivery_date || w.install_date || null;

      // Release-gate confirmations only apply when the WP actually participates
      // in gating (>=1 gate field populated). Applying gates universally — or on
      // mere proximity to the target date — inflates scores because most WPs have
      // no gate fields set → all 7 gates would read as missing → +45.
      const hasAnyGateField = !!(
        w.vif_confirmed || w.field_dimensions_confirmed ||
        w.shop_drawing_revision_checked || w.current_drawing_revision_checked ||
        w.e_sheet_checked || w.erection_sheet_checked ||
        w.load_list_complete || w.load_list_completed ||
        w.sequence_aligned || w.erection_sequence_aligned ||
        w.site_ready || w.drawings_approved
      );
      // Gate only WPs that participate in gating (>=1 gate field set); the old
      // `|| within-14-days` branch defeated hasAnyGateField and inflated every
      // untracked near-term WP by +45 (and spawned 7 phantom action drafts).
      const gateApplicable = phaseNeedsGate && hasAnyGateField;

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
          vif_confirmed: !!w.vif_confirmed,
          field_dimensions_confirmed: !!w.field_dimensions_confirmed,
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
  const TASK_TERMINAL = new Set(["complete", "completed", "cancelled", "canceled", "closed", "done", "void"]);
  const SUMMARY_TYPES = new Set(["summary", "phase"]);
  return (tasks || [])
    .filter((t) => {
      const metadata = t.metadata || {};
      const isSummary = t.is_summary || metadata.is_summary || SUMMARY_TYPES.has(norm(t.task_type));
      if (isSummary) return false;
      if (TASK_TERMINAL.has(norm(t.status))) return false;
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
      const searchText = `${phase} ${taskType} ${t.task_name || ""}`;
      const impactArea =
        /deliver|ship|load/i.test(searchText) ? "Shipping"
        : /erect|install|field|crane/i.test(searchText) ? "Erection"
        // `\bco\b` so the change-order abbrev doesn't match inside
        // coordination / column / concrete / connection.
        : (/\bco\b/i.test(searchText) || /change|cost/i.test(searchText)) ? "Cost"
        : /fab|shop|release/i.test(searchText) ? "Fabrication"
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
        // Unset gate fields read as MISSING (!!), consistent with the WorkPackage
        // and Delivery mappers — setting release_gate opts this task into gating,
        // so every unconfirmed field should surface.
        confirmations: metadata.release_gate ? {
          vif_confirmed: !!metadata.release_gate.vif_confirmed,
          field_dimensions_confirmed: !!metadata.release_gate.field_dimensions_confirmed,
          shop_drawing_revision_checked: !!metadata.release_gate.shop_drawing_revision_checked,
          e_sheet_checked: !!metadata.release_gate.e_sheet_checked,
          load_list_complete: !!metadata.release_gate.load_list_complete,
          sequence_aligned: !!metadata.release_gate.sequence_aligned,
          site_ready: !!metadata.release_gate.site_ready,
        } : null,
        project_id: t.project_id,
        project_name: t.project_name,
      };
    });
}

export function mapDeliveriesToPCCItems(deliveries) {
  const DEL_TERMINAL = new Set(["delivered", "received", "complete", "completed", "cancelled", "canceled", "void"]);
  return (deliveries || [])
    .filter((d) => !DEL_TERMINAL.has(norm(d.status)))
    .map((d) => {
      // Gate only deliveries that participate in gating (>=1 gate field set),
      // consistent with WorkPackages — so untracked deliveries neither inflate
      // from mere proximity nor silently pass with every gate read as confirmed.
      const hasAnyGateField = !!(
        d.vif_confirmed || d.field_dimensions_confirmed ||
        d.shop_drawing_revision_checked || d.e_sheet_checked ||
        d.load_list_complete || d.load_list_completed || d.items_confirmed ||
        d.sequence_aligned || d.site_ready
      );
      const gateApplicable = hasAnyGateField;

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
          vif_confirmed: !!d.vif_confirmed,
          field_dimensions_confirmed: !!d.field_dimensions_confirmed,
          shop_drawing_revision_checked: !!d.shop_drawing_revision_checked,
          e_sheet_checked: !!d.e_sheet_checked,
          load_list_complete: !!(d.load_list_complete || d.load_list_completed || d.items_confirmed),
          sequence_aligned: !!d.sequence_aligned,
          site_ready: !!d.site_ready,
        } : null,
        project_id: d.project_id,
        project_name: d.project_name,
      };
    });
}

export function mapChangeOrdersToPCCItems(cos) {
  const CO_TERMINAL = new Set(["approved", "rejected", "complete", "completed", "cancelled", "canceled", "void"]);
  return (cos || [])
    .filter((c) => !CO_TERMINAL.has(norm(c.status)))
    .map((c) => ({
      id: `co-${c.id}`,
      entityId: c.id,
      type: "ChangeOrder",
      title: c.title || c.description || `CO #${c.change_order_number || c.id}`,
      subtitle: `Change Order`,
      status: c.status,
      due_date: c.due_date || c.required_by,
      // Real column is change_orders.co_amount (dollars). amount/estimated_cost
      // kept only as forward-compat fallbacks; co_amount is authoritative.
      amount: c.co_amount ?? c.amount ?? c.estimated_cost ?? 0,
      assigned_to: c.assigned_to,
      waiting_on: c.owner || c.gc_name,
      project_id: c.project_id,
      project_name: c.project_name,
    }));
}

// ─── Build scored + sorted priority feed ─────────────────────────────────────
export function mapActionItemsToPCCItems(actionItems) {
  const AI_TERMINAL = new Set(["complete", "completed", "done", "resolved", "cancelled", "canceled", "closed", "void"]);
  return (actionItems || [])
    .filter((a) => !AI_TERMINAL.has(norm(a.status)))
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
  return (allItems || [])
    .map(scoreItem)
    .sort((a, b) => b.score - a.score);
}

// ─── Build signal card KPIs from scored feed ──────────────────────────────────
export function buildSignalKPIs(scoredItems) {
  const items = scoredItems || [];
  const critical   = items.filter((i) => i.severityKey === "CRITICAL").length;
  const highRisk   = items.filter((i) => i.severityKey === "HIGH").length;
  const external   = items.filter((i) => i.tags.includes("EXTERNAL_WAIT")).length;
  const overdueAll = items.filter((i) => i.overdueDays > 0).length;
  const blocksFab  = items.filter((i) => i.tags.includes("BLOCKS_FAB")).length;
  const blocksErec = items.filter((i) => i.tags.includes("BLOCKS_ERECTION")).length;
  const coExposure = items
    .filter((i) => i.type === "ChangeOrder")
    .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  return { critical, highRisk, external, overdueAll, blocksFab, blocksErec, coExposure };
}

// ─── Build waiting-on board ───────────────────────────────────────────────────
export function buildWaitingOnBoard(scoredItems) {
  const external = (scoredItems || []).filter((i) => i.tags.includes("EXTERNAL_WAIT") || i.external_wait_days > 3);
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
  const items = scoredItems || [];
  const withWindow = items
    .map((item) => ({ ...item, daysOut: daysFromToday(item.target_date || item.due_date) }))
    .filter((item) => item.daysOut !== null);

  // dueSoonDays === 0 now correctly matches due-today items (scoreItem anchors
  // overdue/due-soon on the same local-calendar-day basis as daysFromToday).
  const today = items
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
  (scoredItems || []).forEach((item) => {
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
  const items = scoredItems || [];
  const isHighSignal = (item) => item.severityKey === "CRITICAL" || item.severityKey === "HIGH";
  const hasAnyTag = (item, tags) => tags.some((tag) => item.tags.includes(tag));

  const criticalReleases = items
    .filter((item) => isHighSignal(item) && hasAnyTag(item, ["RELEASE_GATE", "BLOCKS_DELIVERY", "BLOCKS_FAB", "BLOCKS_ERECTION"]))
    .slice(0, 6);

  const waitingOn = (waitingBoard || [])
    .flatMap((group) => group.items.map((item) => ({ ...item, waitingParty: group.party })))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const next48 = (executionWindows?.next48 || [])
    .filter((item) => isHighSignal(item) || hasAnyTag(item, ["RELEASE_GATE", "BLOCKS_DELIVERY", "BLOCKS_FAB", "BLOCKS_ERECTION"]))
    .slice(0, 8);

  const scheduleRisk = items
    .filter((item) => hasAnyTag(item, ["SCHEDULE_RISK", "OWNER_MISSING"]) || item.type === "ScheduleTask")
    .slice(0, 8);

  const costExposure = items
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
