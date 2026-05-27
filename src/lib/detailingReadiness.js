/**
 * detailingReadiness.js — the per-package OPERATIONAL READINESS read-model.
 *
 * Pure + deterministic. No React, no Supabase. Combines the coalesced state,
 * the backward schedule, the linked RFIs/revisions/WP, and the two manual flags
 * into the single readiness object the Detailing Control Center renders. Nothing
 * here is stored (except the two manual flags it reads through) — it is a
 * computed read-model so it can never drift (design doc §4).
 */

import {
  DETAILING_STATE_ORDER,
  effectiveDetailingState,
  isPackageSuperseded,
} from "@/lib/detailingPackageState";
import {
  resolveLeadDays,
  computeBackwardDates,
  computeScheduleRisk,
} from "@/lib/detailingSchedule";

const ORDER_INDEX = (state) => {
  const i = DETAILING_STATE_ORDER.indexOf(state);
  return i === -1 ? 0 : i;
};
const RELEASED_IDX = ORDER_INDEX("Released");
const ERECTION_RELEASED_IDX = ORDER_INDEX("Released for Erection");

/** Collect linked RFI ids from a package's sheets + submittals + the set row. */
function collectLinkedRfiIds(pkg, submittals, sheets) {
  const ids = new Set();
  const add = (val) => {
    if (Array.isArray(val)) val.forEach((v) => v && ids.add(String(v)));
    else if (typeof val === "string") val.split(/[,\s]+/).forEach((v) => v && ids.add(v));
  };
  (sheets || []).forEach((s) => add(s?.linked_rfi_ids));
  (submittals || []).forEach((s) => add(s?.linked_rfi_ids));
  add(pkg?.linked_rfi_ids);
  return ids;
}

/**
 * Compute the readiness read-model for one package.
 *
 * @param {object} args
 * @param {object} args.pkg            — the drawing_set row (carries detailing_state, material_impacted, long_lead_impact, metadata)
 * @param {Array}  args.submittals     — submittals linked to the package
 * @param {Array}  args.sheets         — drawings in the package
 * @param {object|null} [args.project] — for project-level lead-day defaults (project.metadata)
 * @param {object|null} [args.workPackage] — the linked WP (for the erection sequence date)
 * @param {Set<string>|null} [args.openRfiIds] — ids of OPEN rfis; when provided, rfiBlocked is precise
 * @param {string} [args.today]        — YYYY-MM-DD override (tests)
 * @returns {object} readiness model
 */
export function computeDetailingReadiness({
  pkg, submittals = [], sheets = [], project = null, workPackage = null, openRfiIds = null, today,
} = {}) {
  const effectiveState = effectiveDetailingState(pkg, submittals, sheets);
  const stateIdx = ORDER_INDEX(effectiveState);

  const erectionStart = workPackage?.scheduled_start_date || null;
  const leadDays = resolveLeadDays(project, pkg);
  const backwardDates = computeBackwardDates(erectionStart, leadDays);
  const scheduleRisk = computeScheduleRisk({ backwardDates, effectiveState, today });

  // RFI blocked: precise when an open-RFI set is supplied (intersect the
  // package's linked RFI ids); otherwise fall back to "has any linked RFI".
  const linkedRfiIds = collectLinkedRfiIds(pkg, submittals, sheets);
  const rfiBlocked = openRfiIds
    ? [...linkedRfiIds].some((id) => openRfiIds.has(id))
    : linkedRfiIds.size > 0;

  // Revision impacted: some (but not all) sheets superseded → a new revision is
  // working through the package. Fully superseded = the package itself is dead
  // (surfaced via isPackageSuperseded), not "impacted".
  const fullySuperseded = isPackageSuperseded(sheets);
  const revisionImpacted = !fullySuperseded &&
    (sheets || []).some((s) => s && !s.is_deleted && s.is_superseded === true);

  const materialImpacted = !!pkg?.material_impacted;
  const longLeadImpact = !!pkg?.long_lead_impact;
  const prioritySequence = !!(workPackage?.sequence_number);

  const fabricationReady = stateIdx >= RELEASED_IDX && !rfiBlocked && !revisionImpacted;
  const erectionReady = stateIdx >= ERECTION_RELEASED_IDX && !rfiBlocked && !revisionImpacted;

  return {
    effectiveState,
    backwardDates,
    scheduleRisk,
    rfiBlocked,
    revisionImpacted,
    materialImpacted,
    longLeadImpact,
    prioritySequence,
    fabricationReady,
    erectionReady,
    fullySuperseded,
  };
}
