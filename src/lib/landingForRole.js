/**
 * landingForRole — pick the default landing page for a user from their
 * per-project role. Used by the index route ("/") ONLY when the user has not
 * saved an explicit "Default Landing Page" preference (an explicit pref always
 * wins).
 *
 * The mapping makes the moat hub the front door for the office roles without
 * stranding field/viewer users on an irrelevant page:
 *   - field            → Field Today          (phone-first capture lane)
 *   - pm/admin/owner   → Detailing Control Center (the drawings/submittals moat)
 *   - viewer / unknown → null                 (stay on the Dashboard overview)
 *
 * Returns a route KEY (e.g. "DrawingSubmittalHub"), matching the index-route
 * redirect contract (`Navigate to={`/${target}`}`), or null meaning
 * "no redirect — render the Dashboard".
 *
 * `hasActiveProject` guards the per-project roles: the role only carries
 * meaning when there's an active project (useProjectRole returns the "viewer"
 * default when its query is disabled, i.e. no project), and the office targets
 * are project-scoped pages — so with no active project we never redirect.
 *
 * @param {string|null|undefined} role  per-project role (owner|admin|pm|field|viewer)
 * @param {boolean} hasActiveProject    whether an active project is resolved
 * @returns {string|null} route key to redirect to, or null for "stay on Dashboard"
 */
export function landingForRole(role, hasActiveProject) {
  if (!hasActiveProject) return null;
  switch (role) {
    case "field":
      return "FieldToday";
    case "pm":
    case "admin":
    case "owner":
      return "DrawingSubmittalHub";
    case "viewer":
    default:
      return null;
  }
}
