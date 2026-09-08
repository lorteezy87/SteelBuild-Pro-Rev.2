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

/**
 * Keep the assignment pair in step on any payload that touches either half.
 *
 * Audit §4.3. Four columns carry an assignment — `resource_names`,
 * `assigned_to`, `crew_id`, `crew_name` — and `taskOwner` reads
 * `resource_names || assigned_to`. The writers never agreed:
 *
 *   - the two add paths wrote `resource_names` only
 *   - the Task List's inline editor writes `assigned_to` only
 *   - the drawer and the bulk toolbar write both
 *
 * Because the reader prefers `resource_names`, typing a name into the Task
 * List's "Assigned To" cell on any of the 315 production rows that already
 * carry a `resource_names` value saved successfully and then changed nothing
 * the user could see. Writing both makes the edit land wherever it is read.
 *
 * A no-op when neither key is present: a partial update that only moves a date
 * must not restate an assignment it was never given. The crew pair is
 * deliberately untouched — `crew_id` is a foreign key to a real crew record,
 * not free text, and folding it in here would let a typed name overwrite an
 * actual crew assignment.
 */
export function withAssignmentPair<T extends Record<string, any>>(fields: T): T {
  if (!fields) return fields;
  const hasResource = "resource_names" in fields && fields.resource_names !== undefined;
  const hasAssigned = "assigned_to" in fields && fields.assigned_to !== undefined;
  if (!hasResource && !hasAssigned) return fields;
  // `resource_names` wins when both are supplied and differ, because that is
  // the half `taskOwner` reads first — the pair should settle on the value the
  // user was actually looking at.
  const value = hasResource ? fields.resource_names : fields.assigned_to;
  return { ...fields, ...buildScheduleResourceAssignPatch(value) };
}
