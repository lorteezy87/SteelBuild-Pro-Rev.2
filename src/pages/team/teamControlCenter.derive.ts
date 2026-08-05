/**
 * Pure derivations for the canonical Team Control Center.
 * No React, no network. All inputs come from listOrgMembers() +
 * listInvitations() + seatCapacity() — already loaded by OrgMembers.jsx.
 */

import type { OrgMemberRow, OrgInvitation } from "@/lib/org/repository";

// ── Types ────────────────────────────────────────────────────────────────────

/** Tone type for KPI cells and decision-panel rows. */
export type TeamTone = "neutral" | "good" | "warn" | "danger" | "info";

export interface RoleGroup {
  role: string;
  label: string;
  count: number;
}

export interface PendingInviteRow {
  id: string;
  /** Shareable accept token — needed by the parent's copyLink(token) handler. */
  token: string;
  email: string;
  role: string;
  expiresAt: string;
  /** Days until expiry; negative = already expired (status pending but stale). */
  daysUntilExpiry: number;
}

export interface RecentActivityRow {
  id: string;
  label: string;          // "{name} joined" / "{email} invited as {role}"
  detail: string;         // ISO date string (created_at)
  tone: TeamTone;
}

export interface TeamSummary {
  // KPI counts
  totalMembers: number;
  activeMembers: number;       // members who joined (= totalMembers, invites are separate)
  pendingInvites: number;
  seatsFilled: number;         // members + pending against the plan limit
  seatsLimit: number | null;   // null = unlimited
  /** Role breakdown for the "By Role" decision panel. */
  byRole: RoleGroup[];
  /** Up to 5 pending invites, soonest-expiring first. */
  pendingQueue: PendingInviteRow[];
  /** Up to 6 most-recent events (joins + invites), newest first. */
  recentActivity: RecentActivityRow[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

/** Whole days from today until a date string; negative = past. */
export function daysUntilDate(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const target = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

/** Role precedence for sorting: owner > admin > member. */
function rolePriority(role: string): number {
  if (role === "owner") return 0;
  if (role === "admin") return 1;
  return 2;
}

// ── Main derivation ──────────────────────────────────────────────────────────

/**
 * Derive all KPIs, queues, and panel rows from the raw lists.
 * Called inside useMemo in TeamControlCenter so it never runs on every render.
 */
export function buildTeamSummary(
  members: OrgMemberRow[],
  invites: OrgInvitation[],
  seatsLimit: number | null,
): TeamSummary {
  const totalMembers = members.length;
  // "Active" for workspace purposes = accepted (all OrgMemberRow entries are accepted)
  const activeMembers = totalMembers;
  const pendingInvites = invites.length;
  const seatsFilled = totalMembers + pendingInvites;

  // ── By-role breakdown ─────────────────────────────────────────────────────
  const roleCounts = new Map<string, number>();
  for (const m of members) {
    const r = m.role || "member";
    roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
  }
  const byRole: RoleGroup[] = Array.from(roleCounts.entries())
    .map(([role, count]) => ({ role, label: roleLabel(role), count }))
    .sort((a, b) => rolePriority(a.role) - rolePriority(b.role));

  // ── Pending invite queue — soonest-expiring first ─────────────────────────
  const pendingQueue: PendingInviteRow[] = invites
    .map((inv) => ({
      id: inv.id,
      token: inv.token,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expires_at,
      daysUntilExpiry: daysUntilDate(inv.expires_at),
    }))
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
    .slice(0, 5);

  // ── Recent activity — newest first (members join + invites sent) ──────────
  type ActivityRaw = { date: string; label: string; detail: string; tone: TeamTone };
  const activity: ActivityRaw[] = [];

  for (const m of members) {
    const name = m.full_name || m.email || m.user_id.slice(0, 8);
    activity.push({
      date: m.created_at,
      label: `${name} joined as ${roleLabel(m.role)}`,
      detail: m.created_at.slice(0, 10),
      tone: m.role === "owner" ? "info" : "good",
    });
  }

  for (const inv of invites) {
    activity.push({
      date: inv.created_at,
      label: `${inv.email} invited as ${roleLabel(inv.role)}`,
      detail: inv.created_at.slice(0, 10),
      tone: "warn",
    });
  }

  const recentActivity: RecentActivityRow[] = activity
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 6)
    .map((a, idx) => ({ id: String(idx), ...a }));

  return {
    totalMembers,
    activeMembers,
    pendingInvites,
    seatsFilled,
    seatsLimit,
    byRole,
    pendingQueue,
    recentActivity,
  };
}

// ── Tone helpers for pills ───────────────────────────────────────────────────

export function roleTone(role: string): "neutral" | "warn" | "info" | "good" {
  if (role === "owner") return "info";
  if (role === "admin") return "warn";
  return "good";
}

export function inviteExpiryTone(daysUntilExpiry: number): TeamTone {
  if (daysUntilExpiry <= 0) return "danger";
  if (daysUntilExpiry <= 3) return "warn";
  return "neutral";
}
