import { describe, expect, it } from "vitest";
import {buildStagedSkippedNote,
  countOwners,
  updateStagedRoleAt,
  removeStagedAt, summarizeInviteSendResults, keepFailedStagedRows} from "../orgMembersPageHelpers";

describe("orgMembersPageHelpers", () => {
  it("builds skip note and counts owners", () => {
    expect(buildStagedSkippedNote(null)).toBe("");
    expect(
      buildStagedSkippedNote({ alreadyMember: 2, alreadyInvited: 1, invalid: 1, duplicate: 1 }),
    ).toBe("Skipped 2 already on the team, 1 already invited, 1 invalid, 1 duplicate.");
    expect(countOwners([{ role: "owner" }, { role: "admin" }, { role: "owner" }])).toBe(2);
  });

  it("updates and removes staged rows", () => {
    const rows = [{ role: "member" }, { role: "admin" }];
    expect(updateStagedRoleAt(rows, 1, "owner")[1].role).toBe("owner");
    expect(removeStagedAt(rows, 0)).toEqual([{ role: "admin" }]);
  });
});

describe("summarizeInviteSendResults", () => {
  it("counts ok/fail and builds toasts", () => {
    const s = summarizeInviteSendResults([
      { email: "a@x.com", ok: true },
      { email: "b@x.com", ok: false },
    ]);
    expect(s.okCount).toBe(1);
    expect(s.failCount).toBe(1);
    expect(s.successToast).toContain("Created 1 invite");
    expect(s.failedEmails.has("b@x.com")).toBe(true);
    expect(keepFailedStagedRows([{ email: "a@x.com" }, { email: "b@x.com" }], s.failedEmails)).toEqual([
      { email: "b@x.com" },
    ]);
  });

  it("errors when all fail", () => {
    const s = summarizeInviteSendResults([{ email: "a@x.com", ok: false }]);
    expect(s.successToast).toBeNull();
    expect(s.errorToast).toMatch(/Couldn't create invites/);
  });
});

import {
  normalizeInviteEmail,
  isValidInviteEmail,
  seatsRemaining,
} from "../orgMembersPageHelpers";

describe("org invite email and seats", () => {
  it("normalizes and validates email", () => {
    expect(normalizeInviteEmail("  Ada@X.com ")).toBe("ada@x.com");
    expect(isValidInviteEmail("ada@x.com")).toBe(true);
    expect(isValidInviteEmail("nope")).toBe(false);
  });

  it("seatsRemaining", () => {
    expect(seatsRemaining(2, 5, false)).toBe(3);
    expect(seatsRemaining(2, 5, true)).toBe(Infinity);
  });
});
