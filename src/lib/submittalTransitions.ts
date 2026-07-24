/**
 * Submittal status transition rules — client mirror of the DB gate.
 *
 * Lifecycle (canonical):
 *   Draft → Submitted / Under Review → disposition → (R&R/Rejected restart)
 *         → Approved / Approved as Noted → Released for Fabrication
 *
 * Same-status writes are allowed (no-op). Unknown statuses are rejected so
 * legacy strings cannot silently overwrite the workflow.
 */

export const SUBMITTAL_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  Draft: ["Submitted", "Under Review", "Void"],
  Submitted: [
    "Under Review",
    "Approved",
    "Approved as Noted",
    "Revise and Resubmit",
    "Rejected",
    "Void",
  ],
  "Under Review": [
    "Submitted",
    "Approved",
    "Approved as Noted",
    "Revise and Resubmit",
    "Rejected",
    "Void",
  ],
  Approved: ["Released for Fabrication", "Revise and Resubmit", "Under Review", "Void"],
  "Approved as Noted": [
    "Released for Fabrication",
    "Revise and Resubmit",
    "Under Review",
    "Void",
  ],
  "Revise and Resubmit": ["Draft", "Submitted", "Under Review", "Void"],
  Rejected: ["Draft", "Submitted", "Under Review", "Void"],
  "Released for Fabrication": ["Void"],
  Void: [],
};

export type SubmittalTransitionResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validate a submittal status transition.
 * @param from current status (null/empty treated as Draft recovery)
 * @param to target status
 */
export function validateSubmittalTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): SubmittalTransitionResult {
  const target = String(to || "").trim();
  if (!target) return { ok: false, reason: "A target submittal status is required." };
  if (!(target in SUBMITTAL_STATUS_TRANSITIONS)) {
    return { ok: false, reason: `Unknown target submittal status "${target}".` };
  }

  const current = String(from || "").trim() || "Draft";
  if (current === target) return { ok: true };

  if (!(current in SUBMITTAL_STATUS_TRANSITIONS)) {
    // Legacy/unknown source — allow recovery only into a known status.
    return { ok: true };
  }

  const allowed = SUBMITTAL_STATUS_TRANSITIONS[current] || [];
  if (!allowed.includes(target)) {
    return {
      ok: false,
      reason: `Cannot move a submittal from "${current}" to "${target}". Allowed next statuses: ${
        allowed.length ? allowed.join(", ") : "(terminal)"
      }.`,
    };
  }
  return { ok: true };
}

/** True when the target disposition restarts the review cycle. */
export function isSubmittalRestartStatus(status: string | null | undefined): boolean {
  const s = String(status || "").trim();
  return s === "Revise and Resubmit" || s === "Rejected";
}
