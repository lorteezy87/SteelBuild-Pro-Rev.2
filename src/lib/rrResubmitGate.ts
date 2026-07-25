/**
 * rrResubmitGate.ts — the R&R → OFA transmission-evidence gate (Slice 3 of
 * the drawing approval lifecycle, 2026-07-25).
 *
 * Product rule: a package that came back Revise-and-Resubmit / Rejected must
 * REMAIN in the R&R stage until the revised set is ACTUALLY retransmitted.
 * Starting work, uploading files, or creating a draft is not a resubmission.
 * The move back to a sent status (→ OFA) therefore requires evidence:
 *
 *   1. an actual submission date for the new cycle,
 *   2. a recipient (the ball-in-court party receiving the resubmittal), and
 *   3. the next revision assigned — WHEN the returned cycle's revision is
 *      known (stamped in submittal_rounds.metadata.revision), resubmitting
 *      the SAME revision is blocked. Packages that don't track revisions
 *      (no stamp / empty revision) are not retroactively blocked.
 *
 * Enforced client-side in addSubmittalRound (the single audited write path)
 * and server-side by the enforce_submittal_status_transition trigger
 * (date + recipient — the DB cannot see the proposed cycle revision).
 *
 * Pure: no React, no Supabase, no clock.
 */

/** Dispositions whose exit-to-sent move requires resubmission evidence. */
export const RR_SOURCE_STATUSES: ReadonlySet<string> = new Set([
  "Revise and Resubmit",
  "Rejected",
]);

/** Sent statuses — the moves that put a package back out for approval. */
const SENT_TARGETS: ReadonlySet<string> = new Set(["Submitted", "Under Review"]);

export interface RrResubmitGateInput {
  /** Submittal status BEFORE the move. */
  priorStatus: string | null | undefined;
  /** Requested status. */
  nextStatus: string;
  /** Actual transmission date for the new cycle. */
  submittedDate?: string | null;
  /** Ball-in-court party receiving the resubmittal. */
  recipient?: string | null;
  /** Text revision that will be in effect for the new cycle. */
  revision?: string | null;
  /** The returned cycle's stamped revision (null when unknown/untracked). */
  priorCycleRevision?: string | null;
}

export type RrResubmitGateResult =
  | { ok: true }
  | { ok: false; missing: string[]; reason: string };

const norm = (value: string | null | undefined): string =>
  String(value ?? "").trim().toUpperCase();

/**
 * Evaluate the resubmission-evidence gate. Returns `{ ok: true }` when the
 * move is not an R&R→sent resubmission or when all evidence is present;
 * otherwise lists what is missing plus one actionable reason string.
 */
export function evaluateRrResubmitGate(input: RrResubmitGateInput): RrResubmitGateResult {
  const from = String(input.priorStatus ?? "").trim();
  const to = String(input.nextStatus ?? "").trim();
  if (!RR_SOURCE_STATUSES.has(from) || !SENT_TARGETS.has(to)) return { ok: true };

  const missing: string[] = [];
  if (!String(input.submittedDate ?? "").trim()) missing.push("submission date");
  if (!String(input.recipient ?? "").trim()) missing.push("recipient");

  const priorRev = norm(input.priorCycleRevision);
  if (priorRev && norm(input.revision) === priorRev) missing.push("next revision");

  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    missing,
    reason:
      `RR_RESUBMIT_BLOCKED: This package is in R&R — it moves back out for approval only when the revised set is actually transmitted. ` +
      `Missing: ${missing.join(", ")}.` +
      (missing.includes("next revision")
        ? ` The returned cycle already went out as Rev ${String(input.priorCycleRevision ?? "").trim()}; assign the next revision before resubmitting.`
        : ""),
  };
}
