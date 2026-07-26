import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Standard result shape for shared mutation helpers. */
export type MutationResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Require a non-empty project id before mutating project-scoped data.
 * Throws so callers can surface a clear user-facing error.
 */
export function assertProjectId(
  projectId: string | null | undefined,
  label = "project"
): asserts projectId is string {
  if (typeof projectId !== "string" || projectId.trim() === "") {
    throw new Error(`Select a ${label} first`);
  }
}

/**
 * Stamp `project_id` on a create/update payload with the *active* project.
 * Forces the active id when a mismatched `project_id` is supplied (write shaping).
 */
export function withProjectId<T extends Record<string, unknown>>(
  data: T,
  projectId: string | null | undefined,
  label = "project",
): T & { project_id: string } {
  assertProjectId(projectId, label);
  if (data.project_id && data.project_id !== projectId) {
    console.warn(
      "[Security] project_id mismatch on write — forcing to active project",
      { provided: data.project_id, active: projectId },
    );
  }
  return { ...data, project_id: projectId };
}

/** Normalize unknown thrown values into a short user-facing message. */
export function toUserErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return fallback;
}

/**
 * Invalidate one or more React Query keys after a successful mutation.
 * Accepts either a single key or a list of keys.
 */
export async function invalidateAfterMutation(
  queryClient: QueryClient,
  keys: QueryKey | QueryKey[]
): Promise<void> {
  const list = Array.isArray(keys[0]) ? (keys as QueryKey[]) : [keys as QueryKey];
  await Promise.all(list.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
