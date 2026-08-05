/**
 * Pure helpers for Project Members page.
 */
import { formatRole, isProjectAdminRole } from "@/lib/projectMembers";
import {
  pruneSelectionToAllowed,
  applySelectionChecked,
  selectAllOrNone,
} from "@/pages/shared/selectionHelpers";

export type MemberRowLike = {
  user_id?: string | null;
  role?: string | null;
  [key: string]: unknown;
};

export type ProfileLike = {
  id?: string;
  email?: string | null;
  full_name?: string | null;
  [key: string]: unknown;
};

export function collectUniqueUserIds(memberRows: MemberRowLike[]): string[] {
  return Array.from(new Set(memberRows.map((m) => m.user_id).filter(Boolean) as string[]));
}

export function indexProfilesById(profiles: ProfileLike[]): Record<string, ProfileLike> {
  const byId: Record<string, ProfileLike> = {};
  for (const p of profiles) {
    if (p?.id) byId[p.id] = p;
  }
  return byId;
}

export function mergeMembersWithProfiles(
  memberRows: MemberRowLike[],
  profilesById: Record<string, ProfileLike | null | undefined>,
) {
  return memberRows.map((row) => {
    const profile = profilesById[row.user_id as string] || null;
    return {
      ...row,
      email: profile?.email || null,
      full_name: profile?.full_name || null,
    };
  });
}

export function countAdminMembers(members: Array<{ role?: string | null }>): number {
  return members.filter((m) => m.role === "owner" || m.role === "admin").length;
}

export function filterSelectedMembers<T extends { id?: string | null }>(
  members: T[],
  selectedIds: Iterable<string>,
): T[] {
  const set = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  return members.filter((m) => m.id != null && set.has(String(m.id)));
}

export function wouldLeaveProjectWithoutAdmin(
  members: Array<{ id?: string | null; role?: string | null }>,
  targetMembers: Array<{ id?: string | null }>,
  nextRole: string,
): boolean {
  if (isProjectAdminRole(nextRole)) return false;
  const targetIds = new Set(targetMembers.map((member) => member.id));
  const remainingAdminCount = members.filter(
    (member) => isProjectAdminRole(member.role) && !targetIds.has(member.id),
  ).length;
  return remainingAdminCount === 0;
}

export function pruneSelectedIds(
  previous: Set<string>,
  liveIds: Iterable<string>,
): Set<string> {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds);
  return pruneSelectionToAllowed(previous, live);
}

export function allMembersSelected(
  members: Array<{ id?: string | null }>,
  selectedIds: Set<string>,
): boolean {
  return members.length > 0 && selectedIds.size === members.length;
}

/** @deprecated Prefer applySelectionChecked from shared selectionHelpers. */
export function nextSelectedIdsToggle(
  previous: Set<string>,
  memberId: string,
  checked: boolean,
): Set<string> {
  return applySelectionChecked(previous, memberId, checked);
}

/** @deprecated Prefer selectAllOrNone from shared selectionHelpers. */
export function nextSelectedIdsAll(
  members: Array<{ id?: string | null }>,
  checked: boolean,
): Set<string> {
  return selectAllOrNone(
    checked,
    members.map((m) => String(m.id)).filter(Boolean),
  );
}

export type ActivityLike = {
  event_type?: string | null;
  target_email?: string | null;
  target_user_id?: string | null;
  old_role?: string | null;
  new_role?: string | null;
};

export function formatActivityEvent(activity: ActivityLike): string {
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

export function commandBarSubtitle(
  selectedProject: { name?: string | null } | null | undefined,
  adminCount: number,
): string {
  return selectedProject
    ? `${selectedProject.name} · ${adminCount} admin${adminCount === 1 ? "" : "s"}`
    : "Pick a project to manage its members";
}

export function bulkUpdateSuccessMessage(changedCount: number): string {
  return changedCount === 1
    ? "Updated 1 member"
    : `Updated ${changedCount} members`;
}

export function removeMemberDescription(
  removeTarget: { email?: string | null; user_id?: string | null; role?: string | null } | null,
): string {
  if (!removeTarget) return "";
  return `Remove ${removeTarget.email || removeTarget.user_id} (${formatRole(removeTarget.role)}) from this project? They will lose all access immediately. This cannot be undone, but you can re-add them.`;
}

export const inputStyle = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "var(--font-body)",
};

export const cellLabelStyle = {
  color: "var(--text-primary)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.05em",
};

