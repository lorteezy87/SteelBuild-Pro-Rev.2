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
  const sequenceNumber = workPackage?.sequence_number || null;
  const area = workPackage?.area || pkg?.area_sequence || null;
  const prioritySequence = !!sequenceNumber;

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
    sequenceNumber,
    area,
    fabricationReady,
    erectionReady,
    fullySuperseded,
  };
}

const MAX_STATE_IDX = DETAILING_STATE_ORDER.length - 1;

/**
 * Sequence-aware readiness rollup: group packages by erection sequence and
 * summarize Detailing % / Fab Ready / Erection Ready / At Risk. This is the
 * sequence-driven view ("what fabricates/erects first") that lets the schedule
 * pull detailing — design doc §7. Packages with no linked sequence fall into
 * an "Unsequenced" bucket (sorted last).
 *
 * @param {Array<{ sequenceNumber?: string|null, effectiveState?: string,
 *   fabricationReady?: boolean, erectionReady?: boolean, atRisk?: boolean }>} entries
 * @returns {Array<{ sequence: string, packageCount: number, detailingPct: number,
 *   fabReadyCount: number, erectionReadyCount: number, atRiskCount: number }>}
 */
export function computeSequenceReadiness(entries) {
  const groups = new Map();
  for (const e of entries || []) {
    const seq = e?.sequenceNumber || "Unsequenced";
    if (!groups.has(seq)) {
      groups.set(seq, { sequence: seq, packageCount: 0, _progressSum: 0, fabReadyCount: 0, erectionReadyCount: 0, atRiskCount: 0 });
    }
    const g = groups.get(seq);
    g.packageCount += 1;
    const idx = DETAILING_STATE_ORDER.indexOf(e?.effectiveState);
    g._progressSum += MAX_STATE_IDX > 0 ? Math.max(0, idx) / MAX_STATE_IDX : 0;
    if (e?.fabricationReady) g.fabReadyCount += 1;
    if (e?.erectionReady) g.erectionReadyCount += 1;
    if (e?.atRisk) g.atRiskCount += 1;
  }
  return Array.from(groups.values())
    .map((g) => ({
      sequence: g.sequence,
      packageCount: g.packageCount,
      detailingPct: g.packageCount ? Math.round((g._progressSum / g.packageCount) * 100) : 0,
      fabReadyCount: g.fabReadyCount,
      erectionReadyCount: g.erectionReadyCount,
      atRiskCount: g.atRiskCount,
    }))
    .sort((a, b) => {
      if (a.sequence === "Unsequenced") return 1;
      if (b.sequence === "Unsequenced") return -1;
      return String(a.sequence).localeCompare(String(b.sequence), undefined, { numeric: true });
    });
}
