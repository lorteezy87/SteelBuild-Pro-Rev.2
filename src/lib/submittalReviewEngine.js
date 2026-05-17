/**
 * submittalReviewEngine.js — Deterministic 5-stage submittal review pipeline.
 *
 * Intake -> Alignment -> Analysis -> Recommendation -> Action
 *
 * Every stage is pure: takes data in, returns structured results out.
 * No React, no Supabase, no side effects, no AI/LLM calls.
 *
 * Used by:
 *   - Submittals.jsx detail panel (SubmittalReviewStrip)
 *   - PCC signal feed (mapSubmittalsToPCCItems)
 */

// ── Stage metadata ───────────────────────────────────────────────────────────

export const REVIEW_STAGES = {
  INTAKE:         { key: "intake",         label: "Intake",         icon: "inbox",        order: 0 },
  ALIGNMENT:      { key: "alignment",      label: "Alignment",      icon: "check-square", order: 1 },
  ANALYSIS:       { key: "analysis",       label: "Analysis",       icon: "search",       order: 2 },
  RECOMMENDATION: { key: "recommendation", label: "Recommendation", icon: "lightbulb",    order: 3 },
  ACTION:         { key: "action",         label: "Action",         icon: "send",         order: 4 },
};

// ── Flag types ───────────────────────────────────────────────────────────────

export const FLAG_TYPES = {
  MISSING_INFO:        { label: "Missing Information",    severity: "warning", category: "completeness" },
  SPEC_DEVIATION:      { label: "Spec Deviation",         severity: "error",   category: "compliance" },
  BIC_MISMATCH:        { label: "Ball-in-Court Mismatch", severity: "warning", category: "routing" },
  OVERDUE:             { label: "Overdue",                severity: "error",   category: "schedule" },
  STALE:               { label: "Stale — No Activity",    severity: "warning", category: "schedule" },
  ROUND_FRICTION:      { label: "Multiple Rejections",    severity: "warning", category: "quality" },
  NO_LINKED_DRAWINGS:  { label: "No Linked Drawings",     severity: "warning", category: "completeness" },
  RESUBMIT_UNCHANGED:  { label: "Resubmitted Unchanged",  severity: "error",   category: "quality" },
  UNAPPROVED_PRODUCT:  { label: "Unapproved Product",     severity: "error",   category: "compliance" },
};

// ── Recommendations ──────────────────────────────────────────────────────────

export const RECOMMENDATIONS = {
  READY_FOR_APPROVAL: { label: "Submit for Approval", action: "submit",   tone: "success" },
  REQUEST_MORE_INFO:  { label: "Request More Info",    action: "hold",     tone: "warning" },
  RETURN_TO_DETAILER: { label: "Return to Detailer",   action: "return",   tone: "error" },
  EXPEDITE:           { label: "Expedite — Overdue",   action: "escalate", tone: "error" },
  HOLD_FOR_REVIEW:    { label: "Hold for Review",      action: "hold",     tone: "warning" },
  NO_ACTION_NEEDED:   { label: "No Action Needed",     action: "none",     tone: "muted" },
};

// ── Constants ────────────────────────────────────────────────────────────────

const TERMINAL = new Set([
  "Approved", "Approved as Noted", "Released for Fabrication", "Void",
]);
const DETAILER_CLASS = new Set([
  "Detailer", "S&H", "Contractor", "Subcontractor",
]);
const REVIEWER_CLASS = new Set(["EOR", "Architect", "AOR"]);
const DAY_MS = 86_400_000;

// ── Stage 1: INTAKE ──────────────────────────────────────────────────────────

/**
 * Detect and connect. Resolves linked entities and classifies the submittal.
 *
 * @param {object}   submittal      - The submittal record
 * @param {object[]} allSubmittals  - All submittals in the project
 * @param {object[]} drawingSets    - All drawing sets in the project
 * @param {object[]} rfis           - All RFIs in the project
 * @returns {{ isNew, linkedDrawingSets, relatedRFIs, relatedSubmittals, specSection, submittalType }}
 */
export function runIntake(submittal, allSubmittals, drawingSets, rfis) {
  // isNew: created within last 7 days AND status is Draft or Submitted
  const createdAt = new Date(submittal.created_at || submittal.createdDate || 0).getTime();
  const isNew =
    (Date.now() - createdAt) < 7 * DAY_MS &&
    (submittal.status === "Draft" || submittal.status === "Submitted");

  // Resolve drawing_set_ids to actual set objects
  const linkedDrawingSets = (submittal.drawing_set_ids || [])
    .map((id) => drawingSets.find((ds) => ds.id === id))
    .filter(Boolean);

  // Related RFIs: match by spec_section OR by shared drawing_set_ids
  const relatedRFIs = rfis.filter((rfi) => {
    if (submittal.spec_section && rfi.spec_section === submittal.spec_section) return true;
    const rfiDrawingIds = rfi.drawing_ids || rfi.drawing_set_ids || [];
    return (submittal.drawing_set_ids || []).some((id) => rfiDrawingIds.includes(id));
  });

  // Related submittals: same spec_section, different submittal
  const relatedSubmittals = allSubmittals.filter(
    (s) =>
      s.id !== submittal.id &&
      submittal.spec_section &&
      s.spec_section === submittal.spec_section,
  );

  return {
    isNew,
    linkedDrawingSets,
    relatedRFIs,
    relatedSubmittals,
    specSection: submittal.spec_section || null,
    submittalType: submittal.submittal_type || submittal.type || null,
  };
}

// ── Stage 2: ALIGNMENT ──────────────────────────────────────────────────────

/**
 * Evaluate against expected requirements. Returns flags and a 0-100 score.
 *
 * @param {object} submittal - The submittal record
 * @param {object} intake    - Output of runIntake
 * @returns {{ flags: Array<{ type, detail }>, score: number }}
 */
export function runAlignment(submittal, intake) {
  const flags = [];
  let score = 100; // Start perfect, deduct for issues

  // Check: has spec section reference
  if (!submittal.spec_section) {
    flags.push({ type: FLAG_TYPES.MISSING_INFO, detail: "No spec section reference" });
    score -= 15;
  }

  // Check: has linked drawings
  if (!intake.linkedDrawingSets.length) {
    flags.push({ type: FLAG_TYPES.NO_LINKED_DRAWINGS, detail: "No drawing sets linked" });
    score -= 15;
  }

  // Check: has description
  if (!(submittal.description || submittal.title || "").trim()) {
    flags.push({ type: FLAG_TYPES.MISSING_INFO, detail: "No description provided" });
    score -= 10;
  }

  // Check: has required date
  if (!submittal.required_date) {
    flags.push({ type: FLAG_TYPES.MISSING_INFO, detail: "No required date set" });
    score -= 10;
  }

  // Check: has ball-in-court
  if (!submittal.ball_in_court) {
    flags.push({ type: FLAG_TYPES.MISSING_INFO, detail: "Ball-in-court not assigned" });
    score -= 10;
  }

  // Check: BIC makes sense for current status
  if (
    ["Submitted", "Under Review"].includes(submittal.status) &&
    DETAILER_CLASS.has(submittal.ball_in_court)
  ) {
    flags.push({
      type: FLAG_TYPES.BIC_MISMATCH,
      detail: `Status is "${submittal.status}" but ball is with ${submittal.ball_in_court} — should be with reviewer`,
    });
    score -= 10;
  }

  if (
    ["Approved", "Approved as Noted"].includes(submittal.status) &&
    REVIEWER_CLASS.has(submittal.ball_in_court)
  ) {
    flags.push({
      type: FLAG_TYPES.BIC_MISMATCH,
      detail: `Status is "${submittal.status}" but ball is still with reviewer — should route back to detailer or downstream`,
    });
    score -= 10;
  }

  // Check: submittal type is set
  if (!submittal.submittal_type && !submittal.type) {
    flags.push({ type: FLAG_TYPES.MISSING_INFO, detail: "Submittal type not specified" });
    score -= 5;
  }

  return { flags, score: Math.max(0, score) };
}

// ── Stage 3: ANALYSIS ───────────────────────────────────────────────────────

/**
 * Flag discrepancies. Carries forward alignment flags and adds schedule,
 * quality, and compliance checks.
 *
 * @param {object}   submittal - The submittal record
 * @param {object}   intake    - Output of runIntake
 * @param {object}   alignment - Output of runAlignment
 * @param {object[]} rounds    - Submittal rounds for this submittal
 * @returns {{ flags: Array<{ type, detail, category? }>, riskLevel: "clear"|"warning"|"critical" }}
 */
export function runAnalysis(submittal, intake, alignment, rounds = []) {
  const flags = [...alignment.flags]; // Carry forward alignment flags
  const now = Date.now();

  // Check: overdue
  if (submittal.required_date && !TERMINAL.has(submittal.status)) {
    const reqDate = new Date(submittal.required_date).getTime();
    if (reqDate < now) {
      const daysOver = Math.round((now - reqDate) / DAY_MS);
      flags.push({
        type: FLAG_TYPES.OVERDUE,
        detail: `${daysOver} day${daysOver === 1 ? "" : "s"} past required date`,
        category: "schedule",
      });
    }
  }

  // Check: stale (no activity for >14 days while open)
  if (!TERMINAL.has(submittal.status)) {
    const lastActivity = new Date(
      submittal.updated_at || submittal.updatedDate || submittal.created_at || submittal.createdDate || 0,
    ).getTime();
    const staleDays = Math.round((now - lastActivity) / DAY_MS);
    if (staleDays > 14) {
      flags.push({
        type: FLAG_TYPES.STALE,
        detail: `No activity for ${staleDays} days`,
        category: "schedule",
      });
    }
  }

  // Check: round friction (>2 rounds with >=2 rejections)
  if (rounds.length > 2) {
    const rejections = rounds.filter(
      (r) => r.status === "Revise and Resubmit" || r.status === "Rejected",
    );
    if (rejections.length >= 2) {
      flags.push({
        type: FLAG_TYPES.ROUND_FRICTION,
        detail: `${rejections.length} rejection${rejections.length === 1 ? "" : "s"} across ${rounds.length} round${rounds.length === 1 ? "" : "s"}`,
        category: "quality",
      });
    }
  }

  // Check: resubmitted without apparent changes
  if (submittal.status === "Submitted" && rounds.length > 0) {
    const lastRound = rounds[rounds.length - 1];
    if (
      lastRound &&
      (lastRound.status === "Revise and Resubmit" || lastRound.status === "Rejected")
    ) {
      if (!submittal.notes?.trim() || submittal.notes === lastRound.notes) {
        flags.push({
          type: FLAG_TYPES.RESUBMIT_UNCHANGED,
          detail: "Resubmitted after rejection — no documented changes",
          category: "quality",
        });
      }
    }
  }

  // Check: related RFIs with cost impact
  const costImpactRFIs = intake.relatedRFIs.filter(
    (rfi) => rfi.cost_impact || rfi.has_cost_impact,
  );
  if (costImpactRFIs.length > 0) {
    flags.push({
      type: FLAG_TYPES.SPEC_DEVIATION,
      detail: `${costImpactRFIs.length} related RFI${costImpactRFIs.length === 1 ? "" : "s"} with cost impact — verify spec compliance`,
      category: "compliance",
    });
  }

  // Determine risk level
  const errorCount = flags.filter((f) => f.type.severity === "error").length;
  const warningCount = flags.filter((f) => f.type.severity === "warning").length;
  const riskLevel =
    errorCount > 0 ? "critical" : warningCount > 1 ? "warning" : "clear";

  return { flags, riskLevel };
}

// ── Stage 4: RECOMMENDATION ─────────────────────────────────────────────────

/**
 * Suggest next steps based on the analysis results.
 *
 * @param {object} submittal - The submittal record
 * @param {object} analysis  - Output of runAnalysis
 * @returns {{ recommendation, summary, details: string[] }}
 */
export function runRecommendation(submittal, analysis) {
  // Already terminal
  if (TERMINAL.has(submittal.status)) {
    return {
      recommendation: RECOMMENDATIONS.NO_ACTION_NEEDED,
      summary: `Submittal is ${submittal.status} — no further review action required.`,
      details: [],
    };
  }

  const errorFlags = analysis.flags.filter((f) => f.type.severity === "error");
  const warningFlags = analysis.flags.filter((f) => f.type.severity === "warning");

  // Has overdue flag
  if (analysis.flags.some((f) => f.type === FLAG_TYPES.OVERDUE)) {
    return {
      recommendation: RECOMMENDATIONS.EXPEDITE,
      summary: "Submittal is past required date — escalate to PM for expedited review.",
      details: analysis.flags.map((f) => f.detail),
    };
  }

  // Has resubmit-unchanged or unapproved product
  if (
    analysis.flags.some(
      (f) => f.type === FLAG_TYPES.RESUBMIT_UNCHANGED || f.type === FLAG_TYPES.UNAPPROVED_PRODUCT,
    )
  ) {
    return {
      recommendation: RECOMMENDATIONS.RETURN_TO_DETAILER,
      summary: "Submittal has unresolved quality issues — return to detailer with specific comments.",
      details: errorFlags.map((f) => f.detail),
    };
  }

  // Has missing info
  const missingInfoFlags = analysis.flags.filter(
    (f) => f.type === FLAG_TYPES.MISSING_INFO || f.type === FLAG_TYPES.NO_LINKED_DRAWINGS,
  );
  if (missingInfoFlags.length > 0) {
    return {
      recommendation: RECOMMENDATIONS.REQUEST_MORE_INFO,
      summary: `${missingInfoFlags.length} item${missingInfoFlags.length === 1 ? "" : "s"} missing — request additional information before review.`,
      details: missingInfoFlags.map((f) => f.detail),
    };
  }

  // Has spec deviation
  if (analysis.flags.some((f) => f.type === FLAG_TYPES.SPEC_DEVIATION)) {
    return {
      recommendation: RECOMMENDATIONS.HOLD_FOR_REVIEW,
      summary: "Potential spec deviation detected — hold for PM review before proceeding.",
      details: errorFlags.concat(warningFlags).map((f) => f.detail),
    };
  }

  // Has warnings but no errors
  if (warningFlags.length > 0 && errorFlags.length === 0) {
    return {
      recommendation: RECOMMENDATIONS.HOLD_FOR_REVIEW,
      summary: `${warningFlags.length} warning${warningFlags.length === 1 ? "" : "s"} — review before approval.`,
      details: warningFlags.map((f) => f.detail),
    };
  }

  // All clear
  return {
    recommendation: RECOMMENDATIONS.READY_FOR_APPROVAL,
    summary: "All checks passed — submittal is ready for approval routing.",
    details: [],
  };
}

// ── Stage 5: ACTION ─────────────────────────────────────────────────────────

/**
 * Generate email draft and routing based on the recommendation.
 *
 * @param {object} submittal      - The submittal record
 * @param {object} recommendation - Output of runRecommendation
 * @param {object} intake         - Output of runIntake
 * @param {string} projectName    - Display name of the project
 * @returns {{ emailDraft: { subject, body, to }, routing: Array<{ person, action, reason }> }}
 */
export function runAction(submittal, recommendation, intake, projectName = "Project") {
  const submittalLabel =
    submittal.submittal_number || `Submittal #${submittal.id?.slice(0, 6) || "?"}`;
  const specRef = submittal.spec_section ? ` (Spec §${submittal.spec_section})` : "";

  const rec = recommendation.recommendation;
  let subject = "";
  let body = "";

  if (rec === RECOMMENDATIONS.EXPEDITE) {
    subject = `ACTION REQUIRED: ${submittalLabel} Overdue${specRef} — ${projectName}`;
    body = [
      `${submittalLabel} for ${projectName} requires immediate attention.`,
      "",
      recommendation.summary,
      "",
      "Flagged Issues:",
      ...recommendation.details.map((d) => `  • ${d}`),
      "",
      `Current Status: ${submittal.status}`,
      `Ball-in-Court: ${submittal.ball_in_court || "Unassigned"}`,
      submittal.required_date ? `Required Date: ${submittal.required_date}` : "",
      "",
      "Please advise on expedited review path.",
    ]
      .filter(Boolean)
      .join("\n");
  } else if (rec === RECOMMENDATIONS.RETURN_TO_DETAILER) {
    subject = `${submittalLabel} — Return to Detailer${specRef} — ${projectName}`;
    body = [
      `${submittalLabel} requires revision before proceeding.`,
      "",
      recommendation.summary,
      "",
      "Issues to Address:",
      ...recommendation.details.map((d) => `  • ${d}`),
      "",
      `Current Status: ${submittal.status}`,
      `Round Count: ${submittal.round_count || submittal.round_number || "Unknown"}`,
      "",
      "Please coordinate with the detailer to resolve these items.",
    ]
      .filter(Boolean)
      .join("\n");
  } else if (rec === RECOMMENDATIONS.REQUEST_MORE_INFO) {
    subject = `${submittalLabel} — Information Needed${specRef} — ${projectName}`;
    body = [
      `${submittalLabel} is missing required information for review.`,
      "",
      "Missing Items:",
      ...recommendation.details.map((d) => `  • ${d}`),
      "",
      `Current Status: ${submittal.status}`,
      "",
      "Please provide the missing information so we can proceed with review.",
    ]
      .filter(Boolean)
      .join("\n");
  } else if (rec === RECOMMENDATIONS.HOLD_FOR_REVIEW) {
    subject = `${submittalLabel} — Review Hold${specRef} — ${projectName}`;
    body = [
      `${submittalLabel} has been flagged for PM review before proceeding.`,
      "",
      recommendation.summary,
      "",
      "Flagged Items:",
      ...recommendation.details.map((d) => `  • ${d}`),
      "",
      `Current Status: ${submittal.status}`,
      `Ball-in-Court: ${submittal.ball_in_court || "Unassigned"}`,
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    subject = `${submittalLabel} — Ready for Approval${specRef} — ${projectName}`;
    body = [
      `${submittalLabel} has passed all review checks and is ready for routing.`,
      "",
      `Spec Section: ${submittal.spec_section || "Not specified"}`,
      `Type: ${submittal.submittal_type || submittal.type || "Not specified"}`,
      `Linked Drawing Sets: ${intake.linkedDrawingSets.map((ds) => ds.set_name || ds.name || ds.id).join(", ") || "None"}`,
      intake.relatedRFIs.length ? `Related RFIs: ${intake.relatedRFIs.length}` : "",
      "",
      "No issues detected. Proceed with standard approval routing.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // Routing
  const routing = [];
  if (rec.action === "escalate") {
    routing.push({
      person: "PM",
      action: "Expedite review",
      reason: "Submittal is past required date",
    });
  }
  if (rec.action === "return") {
    routing.push({
      person: "Detailer",
      action: "Address comments and resubmit",
      reason: "Quality issues identified",
    });
  }
  if (rec.action === "hold") {
    routing.push({
      person: "PM",
      action: "Review flagged items",
      reason: recommendation.summary,
    });
  }
  if (rec.action === "submit") {
    routing.push({
      person: submittal.ball_in_court || "EOR",
      action: "Review and approve",
      reason: "All checks passed",
    });
  }

  return {
    emailDraft: { subject, body, to: "PM" },
    routing,
  };
}

// ── Full pipeline runner ─────────────────────────────────────────────────────

/**
 * Run the complete 5-stage review pipeline on a single submittal.
 *
 * @param {object} submittal - The submittal record
 * @param {object} context   - { allSubmittals, drawingSets, rfis, rounds, projectName }
 * @returns {object} { intake, alignment, analysis, recommendation, action, overallScore, riskLevel }
 */
export function reviewSubmittal(submittal, context) {
  const {
    allSubmittals = [],
    drawingSets = [],
    rfis = [],
    rounds = [],
    projectName = "Project",
  } = context;

  const intake = runIntake(submittal, allSubmittals, drawingSets, rfis);
  const alignment = runAlignment(submittal, intake);
  const analysis = runAnalysis(submittal, intake, alignment, rounds);
  const recommendation = runRecommendation(submittal, analysis);
  const action = runAction(submittal, recommendation, intake, projectName);

  return {
    intake,
    alignment,
    analysis,
    recommendation,
    action,
    overallScore: alignment.score,
    riskLevel: analysis.riskLevel,
  };
}

// ── PCC integration ─────────────────────────────────────────────────────────

/**
 * Map submittals into PCC feed items with review-driven scoring.
 * Follows the same pattern as mapRFIsToPCCItems, mapDrawingsToPCCItems, etc.
 *
 * @param {object[]} submittals          - All submittals in the project
 * @param {object[]} allSubmittals       - Same array (used as context for cross-refs)
 * @param {object[]} drawingSets         - All drawing sets in the project
 * @param {object[]} rfis               - All RFIs in the project
 * @param {object}   roundsBySubmittal   - Map of submittal_id -> round[]
 * @returns {object[]} PCC-shaped items
 */
export function mapSubmittalsToPCCItems(
  submittals,
  allSubmittals,
  drawingSets,
  rfis,
  roundsBySubmittal = {},
) {
  return submittals
    .filter((s) => !TERMINAL.has(s.status))
    .map((s) => {
      const rounds = roundsBySubmittal[s.id] || [];
      const review = reviewSubmittal(s, {
        allSubmittals,
        drawingSets,
        rfis,
        rounds,
      });

      return {
        id: `sub-${s.id}`,
        entityId: s.id,
        type: "Submittal",
        title:
          `${s.submittal_number || ""} ${s.description || s.title || ""}`.trim() ||
          "Untitled Submittal",
        subtitle: s.spec_section ? `Spec §${s.spec_section}` : s.submittal_type || "",
        status: s.status,
        due_date: s.required_date,
        assigned_to: s.ball_in_court,
        waiting_on: s.ball_in_court,
        project_id: s.project_id,
        project_name: s.project_name,
        // Review engine results
        review_score: review.overallScore,
        review_risk: review.riskLevel,
        review_recommendation: review.recommendation.recommendation.label,
        review_flag_count: review.analysis.flags.length,
      };
    });
}
