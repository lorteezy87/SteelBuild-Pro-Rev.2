import { describe, expect, it } from "vitest";
import {
  buildStagedSkippedNote,
  countOwners,
  updateStagedRoleAt,
  removeStagedAt,
} from "../orgMembersPageHelpers";

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
