/**
 * onboardingInvites — turn the onboarding wizard's team roster into a clean set
 * of org invitations for the Team page to review and send.
 *
 * The wizard collects PROJECT roles (owner/admin/pm/field/viewer) + a discipline
 * per row, but an org invitation only carries an ORG role (owner/admin/member) —
 * org membership just grants workspace access; the fine-grained project role is
 * assigned separately on Project Members after the invitee accepts. So pm/field/
 * viewer all map to "member"; the project-role + discipline intent is preserved
 * in project.metadata.onboarding.team_plan for the admin to apply later.
 */

export type OrgRole = "owner" | "admin" | "member";

export interface RosterRow {
  email?: string | null;
  role?: string | null;
  discipline?: string | null;
}

export interface StagedInvite {
  email: string;
  role: OrgRole;
}

export interface PreparedInvites {
  invites: StagedInvite[];
  skipped: {
    invalid: number;        // a non-empty email that isn't a valid address
    alreadyMember: number;  // email already belongs to an org member
    alreadyInvited: number; // email already has a pending invite
    duplicate: number;      // same email appeared twice in the roster
  };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Map a wizard project-role to the org membership role used by invitations.
 * owner/admin carry over; everything else (pm/field/viewer/unknown) → "member".
 */
export function projectRoleToOrgRole(role?: string | null): OrgRole {
  if (role === "owner") return "owner";
  if (role === "admin") return "admin";
  return "member";
}

/**
 * Clamp an org role to what the sender is allowed to grant: a non-owner cannot
 * grant "owner" (the DB's org_invites_insert policy enforces this too), only up
 * to "admin". Owners may grant any role. Used at both the seed and send
 * boundaries of the onboarding invite hand-off so a forced/stale "owner" value
 * can never escalate an invitee above the sender.
 */
export function clampOrgRole(role: OrgRole, opts: { isOwner: boolean }): OrgRole {
  if (role === "owner" && !opts.isOwner) return "admin";
  return role;
}

const norm = (e?: string | null): string => String(e || "").trim().toLowerCase();

/**
 * Clean a roster into a de-duplicated, validated list of org invites, excluding
 * anyone who's already a member or already has a pending invite. Returns the
 * staged invites plus a tally of what was dropped (so the UI can explain it).
 * Blank rows are ignored silently (the wizard seeds an empty row).
 */
export function prepareOnboardingInvites(
  roster: RosterRow[] | null | undefined,
  opts: { existingEmails?: (string | null | undefined)[]; pendingEmails?: (string | null | undefined)[] } = {},
): PreparedInvites {
  const existing = new Set((opts.existingEmails || []).map(norm).filter(Boolean));
  const pending = new Set((opts.pendingEmails || []).map(norm).filter(Boolean));
  const seen = new Set<string>();
  const invites: StagedInvite[] = [];
  const skipped = { invalid: 0, alreadyMember: 0, alreadyInvited: 0, duplicate: 0 };

  for (const row of roster || []) {
    const email = norm(row?.email);
    if (!email) continue;                       // blank row — ignore silently
    if (!EMAIL_RE.test(email)) { skipped.invalid++; continue; }
    if (existing.has(email)) { skipped.alreadyMember++; continue; }
    if (pending.has(email)) { skipped.alreadyInvited++; continue; }
    if (seen.has(email)) { skipped.duplicate++; continue; }
    seen.add(email);
    invites.push({ email, role: projectRoleToOrgRole(row?.role) });
  }

  return { invites, skipped };
}
