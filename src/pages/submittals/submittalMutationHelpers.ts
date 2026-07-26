/**
 * Pure helpers for Submittals page mutations.
 * Keep React Query / toast / entities out of this module.
 */

import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { isFabReleaseBlocked } from "@/lib/fabRelease/releaseStatus";

/** Append bulk-edit notes to an existing notes field (blank-safe). */
export function appendSubmittalNotes(
  prior: string | null | undefined,
  notesAppend: string,
): string {
  const existing = (prior || "").trimEnd();
  return existing ? `${existing}\n\n${notesAppend}` : notesAppend;
}

/** True when PostgREST reports the per-project submittal-number unique index. */
export function isSubmittalDuplicateNumberError(err: unknown): boolean {
  const msg = toUserErrorMessage(err, "");
  return /submittals_unique_per_project|duplicate key/i.test(msg);
}

/** User-facing create/update error for a single-row submittal mutation. */
export function formatSubmittalWriteError(
  err: unknown,
  verb: "Create" | "Update" | "Delete" | "Advance" | "Bulk update" | "Bulk delete" | "Bulk add" | "Round" | "Sheet responses",
): string {
  if (verb === "Update" && isFabReleaseBlocked(err)) {
    return 'Release blocked by open RFIs — use the "Release for Fabrication" action to override, or resolve the RFIs.';
  }
  if ((verb === "Create" || verb === "Update") && isSubmittalDuplicateNumberError(err)) {
    return "That submittal number already exists in this project — use a different number.";
  }
  const detail = toUserErrorMessage(err, "Unknown error");
  switch (verb) {
    case "Create":
      return `Create failed: ${detail}`;
    case "Update":
      return `Update failed: ${detail}`;
    case "Delete":
      return `Delete failed: ${detail}`;
    case "Advance":
      return `Advance failed: ${detail}`;
    case "Bulk update":
      return `Bulk update failed: ${detail}`;
    case "Bulk delete":
      return `Bulk delete failed: ${detail}`;
    case "Bulk add":
      return `Bulk add failed: ${detail}`;
    case "Round":
      return `Failed to create round: ${detail}`;
    case "Sheet responses":
      return `Failed to save responses: ${detail}`;
    default:
      return detail;
  }
}

export type BulkOutcomeKind = "all_failed" | "partial" | "all_ok";

/** Classify a batchProcess-style success/fail count for toast routing. */
export function classifyBulkOutcome(ok: number, failed: number): BulkOutcomeKind {
  if (ok === 0 && failed > 0) return "all_failed";
  if (failed > 0) return "partial";
  return "all_ok";
}

/** Toast copy for bulk create/update/delete on the Submittals register. */
export function formatBulkSubmittalToast(
  action: "updated" | "deleted" | "added",
  ok: number,
  failed: number,
): { level: "error" | "warning" | "success"; message: string } {
  const kind = classifyBulkOutcome(ok, failed);
  const noun = `submittal${ok === 1 ? "" : "s"}`;
  if (kind === "all_failed") {
    const verb =
      action === "updated" ? "updated" : action === "deleted" ? "deleted" : "added";
    const hint =
      action === "added"
        ? "Review the input and retry."
        : "The selection remains for retry.";
    return {
      level: "error",
      message: `No submittals ${verb}; ${failed} failed. ${hint}`,
    };
  }
  if (kind === "partial") {
    if (action === "added") {
      return { level: "warning", message: `${ok} added, ${failed} failed` };
    }
    return {
      level: "warning",
      message: `${ok} ${action}, ${failed} failed. Failed rows remain selected.`,
    };
  }
  const label =
    action === "updated" ? `Updated ${ok} ${noun}` :
    action === "deleted" ? `Deleted ${ok} ${noun}` :
    `Added ${ok} ${noun}`;
  return { level: "success", message: label };
}

/** Stamp project scope + defaults for a bulk-add submittal row. */
export function buildBulkSubmittalCreatePayload(
  row: Record<string, unknown>,
  projectId: string | null | undefined,
  projectName: string,
): Record<string, unknown> & { project_id: string } {
  return {
    ...withProjectId(
      {
        project_name: projectName,
        round_number: 1,
        ...row,
      },
      projectId,
    ),
  };
}
