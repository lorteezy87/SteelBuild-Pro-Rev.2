/**
 * Pure helpers for Project Members page.
 */
import { isProjectAdminRole } from "@/lib/projectMembers";

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
