/**
 * projectMembers.js — pure helpers for the per-project member-management UI.
 *
 * Kept dependency-free so the unit tests can exercise the predicates without
 * spinning up a React tree. The page (src/pages/ProjectMembers.jsx) imports
 * these for role formatting + self-edit guards, and the test
 * (src/__tests__/projectMembers.test.js) covers the edge cases.
 *
 * The 5 valid roles match the user_projects.role CHECK constraint
 * (migration 079_user_project_roles): owner / admin / pm / field / viewer.
 *
 * `'owner'` is intentionally NOT in ASSIGNABLE_ROLES — the admin UI lets
 * you demote an existing owner but never promote into ownership. Owner
 * grants are still possible via direct SQL or the Supabase dashboard.
 */

// Canonical list — must stay in sync with the DB CHECK constraint.
export const ALL_ROLES = ["owner", "admin", "pm", "field", "viewer"];

// What admins can pick in the role dropdown. 'owner' is excluded by design
// (see file header). If the existing row IS 'owner', the dropdown still
// renders that as the current value via getRoleOptions(currentRole).
export const ASSIGNABLE_ROLES = ["admin", "pm", "field", "viewer"];

// Default role assigned when adding a new member. Matches the DB DEFAULT.
export const DEFAULT_ROLE = "pm";

const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  pm: "PM",
  field: "Field",
  viewer: "Viewer",
};

/**
 * Human-readable label for a role string. Returns "—" for unknown / null
 * so unfamiliar values don't crash the table.
 */
export function formatRole(role) {
  if (!role) return "—";
  return ROLE_LABELS[role] || role;
}

/**
 * Returns true for roles that can administer a project membership roster.
 * Mirrors the SQL role level where owner and admin are both level 3.
 */
export function isProjectAdminRole(role) {
  return role === "owner" || role === "admin";
}

/**
 * Returns true if the membership row's user_id matches the currently
 * logged-in user's id. Used to disable the "remove" button for self
 * (you can demote yourself but you can't kick yourself).
 *
 * Tolerates either argument being null/undefined — returns false in
 * that case so self-protection only kicks in when both sides are known.
 */
export function isCurrentUser(memberUserId, currentUserId) {
  if (!memberUserId || !currentUserId) return false;
  return memberUserId === currentUserId;
}

/**
 * Build the role-dropdown option list for a given member row. The current
 * role always appears (so 'owner' rows can render their existing value),
 * but is only re-listed if it isn't already in ASSIGNABLE_ROLES.
 *
 * Returns an array of { value, label } so the page can map straight to
 * <option> elements without duplicating the formatRole wiring.
 */
export function getRoleOptions(currentRole) {
  const opts = ASSIGNABLE_ROLES.map((r) => ({ value: r, label: formatRole(r) }));
  if (currentRole && !ASSIGNABLE_ROLES.includes(currentRole)) {
    opts.unshift({ value: currentRole, label: formatRole(currentRole) });
  }
  return opts;
}

/**
 * Validate an email string the same way FeatureFlagsAdmin does — a tiny
 * sanity check so we don't fire a no-op INSERT against a typo. Returns
 * true for anything that contains an @ and is non-empty.
 */
export function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0) return false;
  return trimmed.includes("@");
}
