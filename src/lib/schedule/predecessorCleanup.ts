/**
 * predecessorCleanup — strip predecessor links that point at deleted tasks.
 *
 * `schedule_tasks.dependencies` is a TEXT column holding JSON, so there is no
 * foreign key and Postgres cannot cascade a delete. Until this module existed,
 * `deleteTaskMut` / `bulkDeleteMut` deleted the row and nothing else, leaving
 * every link that referenced it dangling — 26 of 137 links in production (19%).
 *
 * A dangling link is not cosmetic. `formatPredecessorLabels` already skips
 * orphans so the PRED column doesn't print "undefined", and the cascade's
 * `applyLink` skips a predecessor it cannot resolve. So the display looks
 * clean while the constraint silently stopped constraining: the successor is
 * free to float, and nothing on screen says so.
 *
 * Existing orphans are repaired once by
 * `20260908*_schedule_predecessor_cleanup.sql`; this module stops new ones.
 */

import { parseDependencies, serializeDependencies } from "@/services/scheduleCascade";

export interface PredecessorCleanupPatch {
  id: string;
  /** Canonical JSON for the surviving links, or null when none survive. */
  dependencies: string | null;
  /** Predecessor ids that were removed — for the audit description. */
  removed: string[];
}

type TaskLike = { id?: string | null; dependencies?: unknown } & Record<string, unknown>;

/**
 * Build the patch list for tasks whose predecessor links reference any of
 * `deletedIds`.
 *
 * Only tasks that actually lose a link are returned. That distinction matters:
 * `serializeDependencies` normalises the legacy id-string shape
 * (`["abc"]` → `[{"id":"abc","type":"FS","lag_days":1}]`), so comparing
 * serialized strings would rewrite every legacy row it passed over. Comparing
 * link *counts* touches only the rows that genuinely changed.
 *
 * Tasks in `deletedIds` are skipped — they are on their way out, and writing to
 * a row mid-delete races the delete for no benefit.
 */
export function stripPredecessorLinks(
  tasks: readonly TaskLike[] | null | undefined,
  deletedIds: Iterable<string> | null | undefined,
): PredecessorCleanupPatch[] {
  const gone = new Set<string>();
  for (const id of deletedIds ?? []) {
    if (id) gone.add(String(id));
  }
  if (gone.size === 0 || !Array.isArray(tasks)) return [];

  const patches: PredecessorCleanupPatch[] = [];

  for (const task of tasks) {
    const id = task?.id;
    if (!id || gone.has(String(id))) continue;

    const links = parseDependencies(task.dependencies);
    if (links.length === 0) continue;

    const survivors = links.filter((link) => !gone.has(String(link.id)));
    if (survivors.length === links.length) continue; // nothing removed

    patches.push({
      id: String(id),
      dependencies: serializeDependencies(survivors),
      removed: links.filter((link) => gone.has(String(link.id))).map((link) => String(link.id)),
    });
  }

  return patches;
}

/**
 * Human-readable summary for the toast after a delete cleaned up links.
 * Returns "" when nothing was cleaned, so the caller can skip the toast.
 */
export function describePredecessorCleanup(patches: readonly PredecessorCleanupPatch[]): string {
  if (!Array.isArray(patches) || patches.length === 0) return "";
  const links = patches.reduce((sum, p) => sum + p.removed.length, 0);
  const linkWord = links === 1 ? "predecessor link" : "predecessor links";
  const taskWord = patches.length === 1 ? "task" : "tasks";
  return `Cleared ${links} ${linkWord} on ${patches.length} ${taskWord}`;
}
