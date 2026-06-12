/**
 * submittalSmartTriggers.js — Deterministic follow-up automation for
 * submittal status moves (§20).
 *
 * When a submittal comes back as "Rejected" / "Revise and Resubmit" the
 * detailing team owes a resubmittal; when it comes back "Approved as Noted"
 * they owe a scrub pass that incorporates the reviewer's notes. Both are
 * easy to drop on a busy project, so the system creates a DRAFT action item
 * for the detailing team automatically the moment the status lands.
 *
 * Guardrails:
 *   - Pure trigger decision (computeStatusTrigger) is separate from the
 *     side-effecting runner so it can be unit-tested.
 *   - The runner only CREATES a draft task — it never changes the
 *     submittal, never approves, never closes anything (§17).
 *   - Deduplicated via metadata.trigger_key so re-saving the same status
 *     (or two write paths firing for one move) can't double-create.
 *   - Failures are swallowed with a console.warn: the user's status change
 *     is the primary outcome and must not fail because task creation did.
 */

import { entities } from "@/api/supabaseClient";
import { toast } from "sonner";

/** Map a status transition to a follow-up task spec, or null when the
 * transition needs no automation. Pure. */
export function computeStatusTrigger(prevStatus, nextStatus) {
  if (!nextStatus || prevStatus === nextStatus) return null;
  if (nextStatus === "Rejected" || nextStatus === "Revise and Resubmit") {
    return {
      kind: "resubmit",
      verb: "Revise & resubmit",
      priority: "High",
      dueInDays: 5,
    };
  }
  if (nextStatus === "Approved as Noted") {
    return {
      kind: "incorporate-notes",
      verb: "Incorporate reviewer notes",
      priority: "Medium",
      dueInDays: 7,
    };
  }
  return null;
}

/** Stable dedup key: one task per (submittal, trigger kind, review round). */
export function buildTriggerKey(submittal, trigger) {
  return `submittal:${submittal.id}:${trigger.kind}:r${submittal.total_rounds ?? 0}`;
}

/** Local-timezone date N days from now, YYYY-MM-DD (never UTC — AZ gotcha). */
function localDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/**
 * Run the smart trigger for a status move. Creates (at most) one open
 * action item for the detailing team and toasts so the automation is
 * visible, never silent. Returns the created action item or null.
 *
 * Never throws — trigger failure must not fail the status write.
 */
export async function runSubmittalStatusTriggers({ submittal, prevStatus, nextStatus }) {
  try {
    const trigger = computeStatusTrigger(prevStatus, nextStatus);
    if (!trigger || !submittal?.id || !submittal?.project_id) return null;

    const triggerKey = buildTriggerKey(submittal, trigger);
    const openItems = await entities.ActionItem.filter({
      project_id: submittal.project_id,
      status: "Open",
    });
    const alreadyQueued = (openItems || []).some(
      (item) => item?.metadata?.trigger_key === triggerKey,
    );
    if (alreadyQueued) return null;

    const label = [submittal.submittal_number, submittal.title]
      .filter(Boolean)
      .join(" — ") || "submittal";
    const setCount = Array.isArray(submittal.drawing_set_ids)
      ? submittal.drawing_set_ids.length
      : 0;
    const created = await entities.ActionItem.create({
      project_id: submittal.project_id,
      project_name: submittal.project_name || null,
      title: `${trigger.verb}: ${label}`.slice(0, 220),
      description: [
        `Auto-created by submittal workflow: status moved ${prevStatus || "—"} → ${nextStatus}.`,
        submittal.spec_section ? `Spec section: ${submittal.spec_section}` : null,
        setCount ? `Linked drawing sets: ${setCount}` : null,
        submittal.required_date ? `Submittal required date: ${submittal.required_date}` : null,
        `Review the reviewer's comments, update the drawing package, and route the next round.`,
      ].filter(Boolean).join("\n"),
      status: "Open",
      priority: trigger.priority,
      due_date: localDatePlusDays(trigger.dueInDays),
      assigned_to: "Detailer",
      metadata: {
        trigger_key: triggerKey,
        source: "submittal-status-trigger",
        submittal_id: submittal.id,
        from_status: prevStatus || null,
        to_status: nextStatus,
      },
    });
    toast.success(
      `Detailing task queued: ${trigger.verb.toLowerCase()} ${submittal.submittal_number || "submittal"}`,
    );
    return created;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[submittalSmartTriggers] Failed to create follow-up task:", err);
    return null;
  }
}
