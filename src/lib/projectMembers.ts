import type { Database } from "@/types/supabase";

export type ProjectRoleValue = "owner" | "admin" | "pm" | "field" | "viewer";
export type UserProjectRow = Database["public"]["Tables"]["user_projects"]["Row"];
export type UserProfileRow = Database["public"]["Tables"]["user_profiles"]["Row"];
export type MemberActivityRow = Database["public"]["Tables"]["member_activity"]["Row"];
export type ProjectMember = UserProjectRow & {
  email: string | null;
  full_name: string | null;
};
export type RoleOption = { value: ProjectRoleValue; label: string };
export type AddProjectMemberPayload = {
  user_id: string;
  project_id: string;
  role: ProjectRoleValue;
};
export type UpdateProjectMemberRolePayload = {
  role: ProjectRoleValue;
};

export const ALL_ROLES: readonly ProjectRoleValue[] = [
  "owner",
  "admin",
  "pm",
  "field",
  "viewer",
];
export const ASSIGNABLE_ROLES: readonly ProjectRoleValue[] = [
  "admin",
  "pm",
  "field",
  "viewer",
];
export const DEFAULT_ROLE: ProjectRoleValue = "pm";

const ROLE_LABELS: Record<ProjectRoleValue, string> = {
  owner: "Owner",
  admin: "Admin",
  pm: "PM",
  field: "Field",
  viewer: "Viewer",
};

export function isProjectRole(role: unknown): role is ProjectRoleValue {
  return typeof role === "string" && ALL_ROLES.includes(role as ProjectRoleValue);
}

export function formatRole(role: string | null | undefined): string {
  if (!role) return "—";
  return isProjectRole(role) ? ROLE_LABELS[role] : role;
}

export function isProjectAdminRole(
  role: string | null | undefined,
): boolean {
  return role === "owner" || role === "admin";
}

export function isCurrentUser(
  memberUserId: string | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  return Boolean(memberUserId && currentUserId && memberUserId === currentUserId);
}

export function getRoleOptions(
  currentRole: string | null | undefined,
): RoleOption[] {
  const options = ASSIGNABLE_ROLES.map((role) => ({
    value: role,
    label: formatRole(role),
  }));
  if (isProjectRole(currentRole) && !ASSIGNABLE_ROLES.includes(currentRole)) {
    options.unshift({ value: currentRole, label: formatRole(currentRole) });
  }
  return options;
}

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && email.trim().length > 0 && email.includes("@");
}

export function normalizeMemberEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function indexProfiles(
  profiles: readonly UserProfileRow[],
): Record<string, UserProfileRow> {
  return Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
}

export function deriveProjectMembers(
  rows: readonly UserProjectRow[],
  profilesById: Readonly<Record<string, UserProfileRow>>,
): ProjectMember[] {
  return rows.map((row) => {
    const profile = profilesById[row.user_id];
    return {
      ...row,
      email: profile?.email ?? null,
      full_name: profile?.full_name ?? null,
    };
  });
}

export function countProjectAdmins(members: readonly ProjectMember[]): number {
  return members.filter((member) => isProjectAdminRole(member.role)).length;
}

export function pruneSelectedMemberIds(
  selectedIds: ReadonlySet<string>,
  members: readonly ProjectMember[],
): Set<string> {
  const liveIds = new Set(members.map((member) => member.id));
  return new Set([...selectedIds].filter((id) => liveIds.has(id)));
}

export function wouldLeaveProjectWithoutAdmin(
  members: readonly ProjectMember[],
  targetMembers: readonly ProjectMember[],
  nextRole: ProjectRoleValue,
): boolean {
  if (isProjectAdminRole(nextRole)) return false;
  const targetIds = new Set(targetMembers.map((member) => member.id));
  return !members.some(
    (member) => isProjectAdminRole(member.role) && !targetIds.has(member.id),
  );
}

export function shapeAddProjectMemberPayload(
  userId: string,
  projectId: string,
): AddProjectMemberPayload {
  return { user_id: userId, project_id: projectId, role: DEFAULT_ROLE };
}

export function shapeRoleUpdatePayload(
  role: ProjectRoleValue,
): UpdateProjectMemberRolePayload {
  return { role };
}

export function formatActivityEvent(activity: MemberActivityRow): string {
  const target = activity.target_email || activity.target_user_id || "Member";
  if (activity.event_type === "member_added") {
    return `${target} added as ${formatRole(activity.new_role)}`;
  }
  if (activity.event_type === "role_changed") {
    return `${target} changed from ${formatRole(activity.old_role)} to ${formatRole(activity.new_role)}`;
  }
  if (activity.event_type === "member_removed") {
    return `${target} removed from the project`;
  }
  return `${target} updated`;
}
