import { describe, expect, it } from "vitest";
import {
  ALL_ROLES,
  ASSIGNABLE_ROLES,
  DEFAULT_ROLE,
  countProjectAdmins,
  deriveProjectMembers,
  formatActivityEvent,
  formatRole,
  getRoleOptions,
  isCurrentUser,
  isProjectAdminRole,
  isValidEmail,
  normalizeMemberEmail,
  pruneSelectedMemberIds,
  shapeAddProjectMemberPayload,
  shapeRoleUpdatePayload,
  wouldLeaveProjectWithoutAdmin,
  type MemberActivityRow,
  type ProjectMember,
  type UserProfileRow,
  type UserProjectRow,
} from "@/lib/projectMembers";

const member = (
  id: string,
  role: ProjectMember["role"],
  userId = `user-${id}`,
): ProjectMember => ({
  id,
  role,
  user_id: userId,
  project_id: "project-1",
  created_at: null,
  email: `${id}@example.com`,
  full_name: id,
});

describe("project member roles", () => {
  it("keeps the DB role set and default stable", () => {
    expect(ALL_ROLES).toEqual(["owner", "admin", "pm", "field", "viewer"]);
    expect(ASSIGNABLE_ROLES).toEqual(["admin", "pm", "field", "viewer"]);
    expect(DEFAULT_ROLE).toBe("pm");
  });

  it("treats owner and admin as equivalent administrators", () => {
    expect(isProjectAdminRole("owner")).toBe(true);
    expect(isProjectAdminRole("admin")).toBe(true);
    expect(isProjectAdminRole("pm")).toBe(false);
  });

  it("keeps owner visible but unavailable as a new assignment", () => {
    expect(getRoleOptions("owner").map(({ value }) => value)).toEqual([
      "owner",
      "admin",
      "pm",
      "field",
      "viewer",
    ]);
    expect(getRoleOptions("pm").map(({ value }) => value)).toEqual([
      "admin",
      "pm",
      "field",
      "viewer",
    ]);
  });

  it("formats known, missing, and forward-compatible role values", () => {
    expect(formatRole("pm")).toBe("PM");
    expect(formatRole(null)).toBe("—");
    expect(formatRole("custom_role")).toBe("custom_role");
  });
});

describe("project member view models", () => {
  it("hydrates explicit project memberships from profiles without inventing access", () => {
    const rows: UserProjectRow[] = [
      {
        id: "membership-1",
        user_id: "user-1",
        project_id: "project-1",
        role: "field",
        created_at: null,
      },
      {
        id: "membership-2",
        user_id: "user-2",
        project_id: "project-1",
        role: "viewer",
        created_at: null,
      },
    ];
    const profile: UserProfileRow = {
      id: "user-1",
      email: "field@example.com",
      full_name: "Field User",
      avatar_url: null,
      created_at: null,
      metadata: null,
      role: "member",
      updated_at: null,
    };

    expect(deriveProjectMembers(rows, { "user-1": profile })).toEqual([
      { ...rows[0], email: "field@example.com", full_name: "Field User" },
      { ...rows[1], email: null, full_name: null },
    ]);
  });

  it("counts owners and admins together and protects the final administrator", () => {
    const members = [member("owner", "owner"), member("admin", "admin"), member("pm", "pm")];
    expect(countProjectAdmins(members)).toBe(2);
    expect(wouldLeaveProjectWithoutAdmin(members, [members[0]], "viewer")).toBe(false);
    expect(
      wouldLeaveProjectWithoutAdmin(members, [members[0], members[1]], "field"),
    ).toBe(true);
    expect(wouldLeaveProjectWithoutAdmin(members, [members[0]], "admin")).toBe(false);
  });

  it("prunes selections to the current explicitly loaded roster", () => {
    expect(
      [...pruneSelectedMemberIds(new Set(["owner", "gone"]), [member("owner", "owner")])],
    ).toEqual(["owner"]);
  });
});

describe("project member mutation payloads", () => {
  it("normalizes email and shapes only project-scoped insert fields", () => {
    expect(normalizeMemberEmail("  USER@Example.COM ")).toBe("user@example.com");
    expect(shapeAddProjectMemberPayload("user-1", "project-1")).toEqual({
      user_id: "user-1",
      project_id: "project-1",
      role: "pm",
    });
  });

  it("shapes role updates without global or organization role fields", () => {
    expect(shapeRoleUpdatePayload("field")).toEqual({ role: "field" });
  });

  it("keeps self checks and basic email validation fail closed", () => {
    expect(isCurrentUser("user-1", "user-1")).toBe(true);
    expect(isCurrentUser("user-1", null)).toBe(false);
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail(123)).toBe(false);
  });
});

describe("member activity view models", () => {
  const activity = (
    overrides: Partial<MemberActivityRow>,
  ): MemberActivityRow => ({
    id: "activity-1",
    project_id: "project-1",
    actor_email: "admin@example.com",
    actor_user_id: "admin-1",
    target_email: "member@example.com",
    target_user_id: "member-1",
    event_type: "member_added",
    old_role: null,
    new_role: "pm",
    metadata: {},
    created_at: "2026-09-12T00:00:00Z",
    ...overrides,
  });

  it("formats add, role-change, remove, and unknown events", () => {
    expect(formatActivityEvent(activity({}))).toBe("member@example.com added as PM");
    expect(
      formatActivityEvent(
        activity({ event_type: "role_changed", old_role: "field", new_role: "admin" }),
      ),
    ).toBe("member@example.com changed from Field to Admin");
    expect(formatActivityEvent(activity({ event_type: "member_removed" }))).toBe(
      "member@example.com removed from the project",
    );
    expect(formatActivityEvent(activity({ event_type: "other" }))).toBe(
      "member@example.com updated",
    );
  });
});
