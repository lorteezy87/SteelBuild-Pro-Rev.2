/**
 * Pure helpers for Drawings page mutations.
 * Keep React Query / toast / entities out of this module.
 */

import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";

/** Stamp active project + optional project_name on a Drawing create payload. */
export function buildDrawingCreatePayload(
  data: Record<string, unknown>,
  projectId: string | null | undefined,
  projectName?: string | null,
): Record<string, unknown> & { project_id: string } {
  return {
    ...withProjectId(data, projectId),
    ...(projectName != null ? { project_name: projectName } : {}),
  };
}

/** User-facing error for single-row drawing mutations. */
export function formatDrawingWriteError(
  err: unknown,
  verb: "add" | "update" | "delete" | "delete set" | "restore",
): string {
  const detail = toUserErrorMessage(err, "unknown");
  switch (verb) {
    case "add":
      return `Failed to add: ${detail}`;
    case "update":
      return `Failed to update: ${detail}`;
    case "delete":
      return `Failed to delete: ${detail}`;
    case "delete set":
      return `Failed to delete set: ${detail}`;
    case "restore":
      return `Restore failed: ${detail}`;
    default:
      return detail;
  }
}

/** Success copy for cascade / parent-only / legacy set deletes. */
export function formatDeleteSetSuccessMessage(opts: {
  setName: string;
  deleted: number;
  parentOnly?: boolean;
  failedCount?: number;
}): { level: "success" | "warning"; message: string } {
  const { setName, deleted, parentOnly, failedCount = 0 } = opts;
  const base = parentOnly
    ? `Deleted set "${setName}"`
    : `Deleted "${setName}" and ${deleted} sheet${deleted === 1 ? "" : "s"}`;
  if (failedCount > 0) {
    return {
      level: "warning",
      message: `${base}; ${failedCount} sheet${failedCount === 1 ? "" : "s"} failed`,
    };
  }
  return { level: "success", message: base };
}
