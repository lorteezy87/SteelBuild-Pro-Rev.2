/**
 * Pure helpers for schedule task resource / owner assignment.
 */

/** Patch applied when bulk-assigning resources on schedule tasks. */
export function buildScheduleResourceAssignPatch(
  resourceNames: string | null | undefined,
): { resource_names: string | null; assigned_to: string | null } {
  if (resourceNames == null) {
    return { resource_names: null, assigned_to: null };
  }
  const trimmed = String(resourceNames).trim();
  if (!trimmed) {
    return { resource_names: null, assigned_to: null };
  }
  return { resource_names: trimmed, assigned_to: trimmed };
}
