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
import { linkedRfiNumbers, normNum } from "@/lib/fabReleaseGate";

const ORDER_INDEX = (state) => {
  const i = DETAILING_STATE_ORDER.indexOf(state);
  return i === -1 ? 0 : i;
};
const RELEASED_IDX = ORDER_INDEX("Released");
const ERECTION_RELEASED_IDX = ORDER_INDEX("Released for Erection");

/**
 * Linked RFIs arrive in TWO INCOMPATIBLE SHAPES and must never be pooled:
 *
 *   submittals.linked_rfi_ids → uuid[]  — FKs to rfis.id
 *   drawings.linked_rfi_ids   → text    — a CSV of RFI *numbers* ("RFI #001,
 *                                         RFI #002"), which is literally what
 *                                         SheetFormModal's placeholder asks the
 *                                         detailer to type
 *   drawing_sets.linked_rfi_ids         — does not exist
 *
 * These used to be merged into one Set and intersected with a set of UUIDs, so a
 * sheet-linked open RFI could never match: a package with an unanswered RFI
 * against it still reported `rfiBlocked: false` and `fabricationReady: true`,
 * while the Drawing Health Score on the same screen deducted for that same RFI.
 * Keep the two id spaces separate and match each against its own open set.
 */
function collectLinkedRfiUuids(submittals) {
  const ids = new Set();
  for (const s of submittals || []) {
    const val = s?.linked_rfi_ids;
    if (Array.isArray(val)) {
      for (const v of val) if (v) ids.add(String(v));
    } else if (typeof val === "string") {
      for (const v of val.split(",")) {
        const t = v.trim();
        if (t) ids.add(t);
      }
    }
  }
  return ids;
}

/** Normalized RFI NUMBERS linked from a package's sheets ("RFI #001" → "RFI001"). */
function collectLinkedRfiNumbers(sheets) {
  const nums = new Set();
  for (const s of sheets || []) {
    for (const raw of linkedRfiNumbers(s)) {
      const key = normNum(raw);
      if (key) nums.add(key);
    }
  }
  return nums;
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
 * @param {Set<string>|null} [args.openRfiIds] — UUIDs of OPEN rfis (matches submittal links)
 * @param {Set<string>|null} [args.openRfiNumbers] — normNum'd numbers of OPEN rfis (matches SHEET links)
 * @param {string} [args.today]        — YYYY-MM-DD override (tests)
 * @returns {object} readiness model
 */
export function computeDetailingReadiness({
  pkg, submittals = [], sheets = [], project = null, workPackage = null,
  openRfiIds = null, openRfiNumbers = null, today,
} = {}) {
  const effectiveState = effectiveDetailingState(pkg, submittals, sheets);
  const stateIdx = ORDER_INDEX(effectiveState);

  const erectionStart = workPackage?.scheduled_start_date || null;
  const leadDays = resolveLeadDays(project, pkg);
  const backwardDates = computeBackwardDates(erectionStart, leadDays);
  const scheduleRisk = computeScheduleRisk({ backwardDates, effectiveState, today });

  // RFI blocked: precise when an open-RFI set is supplied — intersect submittal
  // links against open UUIDs and sheet links against open NUMBERS, each in its
  // own id space. Falls back to "has any linked RFI" when neither set is given.
  const linkedRfiUuids = collectLinkedRfiUuids(submittals);
  const linkedRfiNums = collectLinkedRfiNumbers(sheets);
  const rfiBlocked = (openRfiIds || openRfiNumbers)
    ? (!!openRfiIds && [...linkedRfiUuids].some((id) => openRfiIds.has(id)))
      || (!!openRfiNumbers && [...linkedRfiNums].some((n) => openRfiNumbers.has(n)))
    : linkedRfiUuids.size > 0 || linkedRfiNums.size > 0;

  // Revision impacted: some (but not all) sheets superseded → a new revision is
  // working through the package. Fully superseded = the package itself is dead
  // (surfaced via isPackageSuperseded), not "impacted".
  const fullySuperseded = isPackageSuperseded(sheets);
  const revisionImpacted = !fullySuperseded &&
    (sheets || []).some((s) => s && !s.is_deleted && s.is_superseded === true);

  const materialImpacted = !!pkg?.material_impacted;
  const longLeadImpact = !!pkg?.long_lead_impact;
  // Sequence comes from a linked work package when present, but most sets are
  // never reverse-linked, so fall back to drawing_sets.area_sequence — a real
  // column many projects already fill. A set with only area_sequence reports
  // the same value for both `area` and `sequenceNumber` (intended): that value
  // IS its known erection sequence, which flips prioritySequence true below.
  const sequenceNumber = workPackage?.sequence_number || pkg?.area_sequence || null;
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
