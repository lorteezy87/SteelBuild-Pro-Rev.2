import { describe, it, expect } from "vitest";
import {
  buildTeamSummary,
  daysUntilDate,
  roleTone,
  inviteExpiryTone,
} from "../teamControlCenter.derive";
import type { OrgMemberRow, OrgInvitation } from "@/lib/org/repository";

// Build an ISO date `offsetDays` from today (UTC midnight basis).
function isoOffset(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}
function isoDateOffset(offsetDays: number): string {
  return isoOffset(offsetDays).slice(0, 10);
}

// Minimal member stubs (only the fields buildTeamSummary actually reads).
function makeMembers(defs: Array<{ role: string; full_name?: string | null; email?: string | null; joinedDaysAgo?: number }>): OrgMemberRow[] {
  return defs.map((d, i) => ({
    id: `m${i}`,
    org_id: "org1",
    user_id: `u${i}`,
    role: d.role,
    full_name: d.full_name ?? null,
    email: d.email ?? `user${i}@example.com`,
    created_at: isoOffset(-(d.joinedDaysAgo ?? i)),
  }));
}

function makeInvites(defs: Array<{ role: string; email?: string; expiresInDays?: number; createdDaysAgo?: number }>): OrgInvitation[] {
  return defs.map((d, i) => ({
    id: `i${i}`,
    org_id: "org1",
    email: d.email ?? `inv${i}@example.com`,
    role: d.role,
    token: `tok${i}`,
    status: "pending",
    created_at: isoOffset(-(d.createdDaysAgo ?? 1)),
    expires_at: isoDateOffset(d.expiresInDays ?? 7),
  }));
}

// ── daysUntilDate ────────────────────────────────────────────────────────────

describe("daysUntilDate", () => {
  it("returns 0 for null/undefined", () => {
    expect(daysUntilDate(null)).toBe(0);
    expect(daysUntilDate(undefined)).toBe(0);
  });
  it("is positive in the future", () => {
    expect(daysUntilDate(isoDateOffset(5))).toBeGreaterThan(0);
  });
  it("is zero today", () => {
    expect(daysUntilDate(isoDateOffset(0))).toBe(0);
  });
  it("is negative in the past", () => {
    expect(daysUntilDate(isoDateOffset(-3))).toBeLessThan(0);
  });
});

// ── tone helpers ─────────────────────────────────────────────────────────────

describe("roleTone", () => {
  it("owner → info, admin → warn, member → good", () => {
    expect(roleTone("owner")).toBe("info");
    expect(roleTone("admin")).toBe("warn");
    expect(roleTone("member")).toBe("good");
  });
});

describe("inviteExpiryTone", () => {
  it("expired → danger, ≤3d → warn, otherwise neutral", () => {
    expect(inviteExpiryTone(-1)).toBe("danger");
    expect(inviteExpiryTone(0)).toBe("danger");
    expect(inviteExpiryTone(2)).toBe("warn");
    expect(inviteExpiryTone(7)).toBe("neutral");
  });
});

// ── buildTeamSummary ─────────────────────────────────────────────────────────

describe("buildTeamSummary", () => {
  const members = makeMembers([
    { role: "owner", full_name: "Alice", joinedDaysAgo: 30 },
    { role: "admin", full_name: "Bob", joinedDaysAgo: 20 },
    { role: "member", full_name: "Carol", joinedDaysAgo: 10 },
    { role: "member", email: "dave@example.com", joinedDaysAgo: 5 },
  ]);
  const invites = makeInvites([
    { role: "member", email: "eve@example.com", expiresInDays: 12 },
    { role: "admin", email: "frank@example.com", expiresInDays: 2 },
  ]);

  it("counts members, pending invites, and seat usage", () => {
    const s = buildTeamSummary(members, invites, 15);
    expect(s.totalMembers).toBe(4);
    expect(s.activeMembers).toBe(4);
    expect(s.pendingInvites).toBe(2);
    expect(s.seatsFilled).toBe(6);
    expect(s.seatsLimit).toBe(15);
  });

  it("groups by role, owner first", () => {
    const s = buildTeamSummary(members, invites, null);
    expect(s.byRole[0].role).toBe("owner");
    expect(s.byRole[0].count).toBe(1);
    const memberGroup = s.byRole.find((r) => r.role === "member");
    expect(memberGroup?.count).toBe(2);
  });

  it("sorts pending queue soonest-expiring first", () => {
    const s = buildTeamSummary(members, invites, null);
    expect(s.pendingQueue[0].email).toBe("frank@example.com"); // expires in 2d
    expect(s.pendingQueue[0].token).toBeTruthy();              // token is passed through
    expect(s.pendingQueue[1].email).toBe("eve@example.com");   // expires in 12d
  });

  it("recent activity is newest first and includes joins + invites", () => {
    const s = buildTeamSummary(members, invites, null);
    expect(s.recentActivity.length).toBeGreaterThan(0);
    expect(s.recentActivity.length).toBeLessThanOrEqual(6);
    // All entries have a label and a date detail
    for (const row of s.recentActivity) {
      expect(row.label).toBeTruthy();
      expect(row.detail).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("handles empty members and invites gracefully", () => {
    const s = buildTeamSummary([], [], null);
    expect(s.totalMembers).toBe(0);
    expect(s.pendingInvites).toBe(0);
    expect(s.byRole).toHaveLength(0);
    expect(s.pendingQueue).toHaveLength(0);
    expect(s.recentActivity).toHaveLength(0);
  });

  it("accepts null seatsLimit for unlimited plans", () => {
    const s = buildTeamSummary(members, invites, null);
    expect(s.seatsLimit).toBeNull();
  });
});
