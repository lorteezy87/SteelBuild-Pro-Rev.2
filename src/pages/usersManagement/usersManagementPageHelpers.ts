import { getAvatarColor } from "@/lib/avatars";
/** Pure helpers for UsersManagement page shell. */

export type UserLike = {
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  status?: string | null;
  last_active?: string | null;
  last_login?: string | null;
  [key: string]: unknown;
};

export function getActivityStatus(
  user: UserLike,
  nowMs: number = Date.now(),
): "pending" | "active" | "inactive" {
  if (user.status === "invited" || user.status === "pending") return "pending";
  const lastDate = user.last_active || user.last_login;
  if (lastDate) {
    const diff = nowMs - new Date(lastDate).getTime();
    if (diff < 7 * 24 * 60 * 60 * 1000) return "active";
  }
  return "inactive";
}

export function filterUsersBySearch(users: UserLike[], searchTerm: string): UserLike[] {
  if (!(searchTerm || "").trim()) return users || [];
  const term = searchTerm.toLowerCase();
  return (users || []).filter(
    (u) =>
      (u.email || "").toLowerCase().includes(term) ||
      (u.full_name || "").toLowerCase().includes(term) ||
      (u.role || "").toLowerCase().includes(term),
  );
}

export function countAdmins(users: UserLike[]): number {
  return (users || []).filter((u) => u.role === "admin").length;
}

export function countNonAdmins(users: UserLike[]): number {
  return (users || []).filter((u) => u.role !== "admin").length;
}

/** Avatar color seed: display name with email fallback (not UUID). */
export function getUserAvatarColor(user: { full_name?: string | null; email?: string | null } | null | undefined): string {
  return getAvatarColor(user?.full_name || user?.email);
}

/** Dot colors for last-activity status on Users Management. */
export const ACTIVITY_DOT_COLORS: Record<"active" | "pending" | "inactive", string> = {
  active: "#10B981",
  pending: "#F59E0B",
  inactive: "var(--text-muted)",
};
