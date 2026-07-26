/**
 * Pure helpers for RFIs page mutations.
 * Keep React Query / toast / entities out of this module.
 */

import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";

/** Stamp active project on an RFI create payload. */
export function buildRfiCreatePayload(
  data: Record<string, unknown>,
  projectId: string | null | undefined,
): Record<string, unknown> & { project_id: string } {
  return withProjectId(data, projectId);
}

/** Stamp project scope for an RFI PDF attachment Document row. */
export function buildRfiAttachmentDocumentPayload(
  fields: Record<string, unknown>,
  projectId: string | null | undefined,
): Record<string, unknown> & { project_id: string } {
  return withProjectId(fields, projectId);
}

/** Stamp project scope for an Alert related to an RFI. */
export function buildRfiAlertPayload(
  fields: Record<string, unknown>,
  projectId: string | null | undefined,
): Record<string, unknown> & { project_id: string } {
  return withProjectId(fields, projectId);
}

export type BulkOutcomeKind = "all_failed" | "partial" | "all_ok";

export function classifyBulkOutcome(ok: number, failed: number): BulkOutcomeKind {
  if (ok === 0 && failed > 0) return "all_failed";
  if (failed > 0) return "partial";
  return "all_ok";
}

/** Toast copy for bulk update/delete on the RFI register. */
export function formatBulkRfiToast(
  action: "updated" | "deleted",
  ok: number,
  failed: number,
): { level: "error" | "warning" | "success"; message: string } {
  const kind = classifyBulkOutcome(ok, failed);
  if (kind === "all_failed") {
    return {
      level: "error",
      message: action === "updated"
        ? `All ${failed} updates failed.`
        : `All ${failed} deletes failed.`,
    };
  }
  if (kind === "partial") {
    return {
      level: "warning",
      message: `${ok} ${action}, ${failed} failed`,
    };
  }
  if (action === "updated") {
    return { level: "success", message: "RFIs updated" };
  }
  return {
    level: "success",
    message: `${ok} RFI${ok === 1 ? "" : "s"} deleted`,
  };
}

/** Normalize notify-field / CRUD error messages. */
export function formatRfiNotifyError(err: unknown): string {
  return `Couldn't notify field: ${toUserErrorMessage(err, "unknown error")}`;
}

/**
 * Build the patch for assigning / reassigning an RFI.
 * Empty / whitespace clears the assignee (null).
 */
export function buildRfiAssignPatch(
  assignee: string | null | undefined,
): { assigned_to: string | null } {
  if (assignee == null) return { assigned_to: null };
  const trimmed = String(assignee).trim();
  return { assigned_to: trimmed === "" ? null : trimmed };
}

/** Create payload that includes an initial assignee under the active project. */
export function buildRfiCreateWithAssigneePayload(
  data: Record<string, unknown>,
  projectId: string | null | undefined,
  assignee: string | null | undefined,
): Record<string, unknown> & { project_id: string; assigned_to: string | null } {
  return {
    ...buildRfiCreatePayload(data, projectId),
    ...buildRfiAssignPatch(assignee),
  };
}
