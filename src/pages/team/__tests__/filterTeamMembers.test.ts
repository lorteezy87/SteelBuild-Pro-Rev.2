import { describe, expect, it } from "vitest";
import { filterTeamMembers } from "../teamControlCenter.derive";

describe("filterTeamMembers", () => {
  const members = [
    { full_name: "Alice", email: "a@x.com", role: "admin" },
    { full_name: "Bob", email: "b@x.com", role: "member" },
  ];
  it("searches name email role", () => {
    expect(filterTeamMembers(members, "alice")).toHaveLength(1);
    expect(filterTeamMembers(members, "MEMBER")).toHaveLength(1);
    expect(filterTeamMembers(members, "")).toHaveLength(2);
  });
});
