import { describe, it, expect } from "vitest";
import { projectRoleToOrgRole, prepareOnboardingInvites, clampOrgRole } from "@/lib/org/onboardingInvites";

describe("clampOrgRole", () => {
  it("lets an owner grant any role", () => {
    expect(clampOrgRole("owner", { isOwner: true })).toBe("owner");
    expect(clampOrgRole("admin", { isOwner: true })).toBe("admin");
    expect(clampOrgRole("member", { isOwner: true })).toBe("member");
  });
  it("downgrades a non-owner's 'owner' grant to 'admin' (no privilege escalation)", () => {
    expect(clampOrgRole("owner", { isOwner: false })).toBe("admin");
  });
  it("leaves a non-owner's admin/member grants untouched", () => {
    expect(clampOrgRole("admin", { isOwner: false })).toBe("admin");
    expect(clampOrgRole("member", { isOwner: false })).toBe("member");
  });
});

describe("projectRoleToOrgRole", () => {
  it("carries owner and admin over", () => {
    expect(projectRoleToOrgRole("owner")).toBe("owner");
    expect(projectRoleToOrgRole("admin")).toBe("admin");
  });
  it("maps project-only roles and anything unknown to member", () => {
    expect(projectRoleToOrgRole("pm")).toBe("member");
    expect(projectRoleToOrgRole("field")).toBe("member");
    expect(projectRoleToOrgRole("viewer")).toBe("member");
    expect(projectRoleToOrgRole("superuser")).toBe("member");
    expect(projectRoleToOrgRole(null)).toBe("member");
    expect(projectRoleToOrgRole(undefined)).toBe("member");
  });
});

describe("prepareOnboardingInvites", () => {
  it("maps roles, trims/lowercases emails, and ignores blank rows silently", () => {
    const { invites, skipped } = prepareOnboardingInvites([
      { email: "  PM@Acme.com ", role: "pm", discipline: "Detailing" },
      { email: "", role: "viewer", discipline: "" }, // blank seed row — ignored
      { email: "boss@acme.com", role: "owner" },
    ]);
    expect(invites).toEqual([
      { email: "pm@acme.com", role: "member" },
      { email: "boss@acme.com", role: "owner" },
    ]);
    expect(skipped).toEqual({ invalid: 0, alreadyMember: 0, alreadyInvited: 0, duplicate: 0 });
  });

  it("counts a non-empty malformed email as invalid (but not a blank one)", () => {
    const { invites, skipped } = prepareOnboardingInvites([
      { email: "not-an-email", role: "pm" },
      { email: "  ", role: "field" }, // whitespace-only → blank, ignored
      { email: "ok@acme.com", role: "field" },
    ]);
    expect(invites).toEqual([{ email: "ok@acme.com", role: "member" }]);
    expect(skipped.invalid).toBe(1);
  });

  it("de-duplicates the same email within the roster (case-insensitively)", () => {
    const { invites, skipped } = prepareOnboardingInvites([
      { email: "dup@acme.com", role: "pm" },
      { email: "DUP@acme.com", role: "admin" }, // dup of the first
    ]);
    expect(invites).toEqual([{ email: "dup@acme.com", role: "member" }]);
    expect(skipped.duplicate).toBe(1);
  });

  it("excludes emails that are already members or already invited (case-insensitive)", () => {
    const { invites, skipped } = prepareOnboardingInvites(
      [
        { email: "member@acme.com", role: "pm" },
        { email: "pending@acme.com", role: "field" },
        { email: "fresh@acme.com", role: "admin" },
      ],
      { existingEmails: ["Member@acme.com"], pendingEmails: ["PENDING@acme.com"] },
    );
    expect(invites).toEqual([{ email: "fresh@acme.com", role: "admin" }]);
    expect(skipped.alreadyMember).toBe(1);
    expect(skipped.alreadyInvited).toBe(1);
  });

  it("handles null/empty roster and options without throwing", () => {
    expect(prepareOnboardingInvites(null).invites).toEqual([]);
    expect(prepareOnboardingInvites(undefined).invites).toEqual([]);
    expect(prepareOnboardingInvites([]).invites).toEqual([]);
  });
});
