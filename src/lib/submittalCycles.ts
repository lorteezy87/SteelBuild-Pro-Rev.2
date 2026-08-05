/**
 * submittalCycles.ts — pure derivation of a submittal's APPROVAL-CYCLE
 * history from its `submittal_rounds` rows (Slice 2 of the drawing
 * approval lifecycle, 2026-07-25).
 *
 * A round row already IS one submit→return cycle (see planRoundWrite in
 * useSubmittals.ts: sends open a cycle, verdicts close it in place,
 * resubmits insert the next row — prior cycles are never overwritten).
 * This module reshapes those rows into the explicit cycle model the
 * product requires:
 *
 *   Cycle 1 — Rev A · submitted · returned · disposition R&R  → stage R&R
 *   Cycle 2 — Rev B · submitted · returned · disposition AAN  → stage OFS
 *
 * Revision attribution: addSubmittalRound stamps the text revision in
 * effect when a cycle opens into `submittal_rounds.metadata.revision`.
 * Historical rows written before that stamp existed have no revision —
 * the derive reports null ("unknown") for them rather than inventing
 * one; only the CURRENT cycle may fall back to the submittal's live
 * `revision` column (they are the same value by construction).
 *
 * Pure: no React, no Supabase, no clock.
 */
import { submittalStatusToStage } from "@/lib/submittalStageMapping";

/** Dispositions that CLOSE an approval cycle (a reviewer verdict). */
export const VERDICT_STATUSES: ReadonlySet<string> = new Set([
  "Approved",
  "Approved as Noted",
  "Revise and Resubmit",
  "Rejected",
  "Released for Fabrication",
]);

export interface CycleRoundLike {
  id?: string | null;
  round_number?: number | null;
  status?: string | null;
  ball_in_court?: string | null;
  submitted_date?: string | null;
  returned_date?: string | null;
  response_notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CycleSubmittalLike {
  revision?: string | null;
}

export interface ApprovalCycle {
  /** Round row id (null for defensive rows without one). */
  id: string | null;
  /** 1-based cycle number (= submittal_rounds.round_number). */
  cycleNumber: number;
  /** Text revision submitted in this cycle, or null when unknown. */
  revision: string | null;
  submittedDate: string | null;
  returnedDate: string | null;
  /** Raw round status ("Submitted", "Approved as Noted", …). */
  status: string;
  /** The reviewer verdict that closed the cycle, or null while out. */
  disposition: string | null;
  /** Derived workflow stage for this cycle's status (R&R first-class). */
  resultingStage: string | null;
  ballInCourt: string | null;
  responseNotes: string;
  /** True while the cycle has not been returned. */
  isOpen: boolean;
  /** True for the latest cycle (the one the submittal is "on"). */
  isCurrent: boolean;
}

/** The text revision stamped on a round at cycle-open, or null. */
export function roundRevision(round: CycleRoundLike | null | undefined): string | null {
  const raw = round?.metadata?.revision;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/**
 * Build the ordered approval-cycle history for one submittal.
 *
 * @param rounds     the submittal's rounds (any order; nulls tolerated)
 * @param submittal  optional — supplies the live revision as a fallback
 *                   for the CURRENT cycle when it carries no stamp
 */
export function buildApprovalCycles(
  rounds: Array<CycleRoundLike | null | undefined> | null | undefined,
  submittal?: CycleSubmittalLike | null,
): ApprovalCycle[] {
  const rows = (Array.isArray(rounds) ? rounds : []).filter(
    (r): r is CycleRoundLike => !!r,
  );
  const sorted = rows.slice().sort(
    (a, b) => (Number(a.round_number) || 0) - (Number(b.round_number) || 0),
  );
  const lastIdx = sorted.length - 1;

  return sorted.map((round, idx) => {
    const status = round.status || "Draft";
    const isCurrent = idx === lastIdx;
    const stamped = roundRevision(round);
    const fallback = isCurrent ? (submittal?.revision ?? null) : null;
    return {
      id: round.id ?? null,
      cycleNumber: Number(round.round_number) || idx + 1,
      revision: stamped ?? (typeof fallback === "string" && fallback.trim() ? fallback.trim() : null),
      submittedDate: round.submitted_date ?? null,
      returnedDate: round.returned_date ?? null,
      status,
      disposition: VERDICT_STATUSES.has(status) ? status : null,
      resultingStage: submittalStatusToStage(status, round.ball_in_court ?? null),
      ballInCourt: round.ball_in_court ?? null,
      responseNotes: round.response_notes || "",
      isOpen: !round.returned_date,
      isCurrent,
    };
  });
}
