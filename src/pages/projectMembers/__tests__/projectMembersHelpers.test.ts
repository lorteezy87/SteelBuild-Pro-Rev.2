import { describe, expect, it } from "vitest";
import {
  collectUniqueUserIds,
  indexProfilesById,
  mergeMembersWithProfiles,
  countAdminMembers,
  filterSelectedMembers,
} from "../projectMembersHelpers";

describe("projectMembersHelpers", () => {
  it("collects unique user ids", () => {
    expect(
      collectUniqueUserIds([
        { user_id: "a" },
        { user_id: "a" },
        { user_id: null },
        { user_id: "b" },
      ]),
    ).toEqual(["a", "b"]);
  });

  it("merges profiles and counts admins", () => {
    const members = mergeMembersWithProfiles(
      [
        { id: "1", user_id: "u1", role: "admin" },
        { id: "2", user_id: "u2", role: "viewer" },
      ],
      indexProfilesById([
        { id: "u1", email: "a@x.com", full_name: "A" },
        { id: "u2", email: "b@x.com", full_name: "B" },
      ]),
    );
    expect(members[0].email).toBe("a@x.com");
    expect(countAdminMembers(members)).toBe(1);
    expect(filterSelectedMembers(members as any, new Set(["2"])).map((m) => m.id)).toEqual(["2"]);
  });
});
