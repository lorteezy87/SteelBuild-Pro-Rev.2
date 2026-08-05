import { describe, expect, it } from "vitest";
import {
  collectUniqueUserIds,
  mergeMembersWithProfiles,
  countAdminMembers,
  filterSelectedMembers,
  wouldLeaveProjectWithoutAdmin,
  pruneSelectedIds,
  allMembersSelected,
  nextSelectedIdsToggle,
  nextSelectedIdsAll,
  formatActivityEvent,
  commandBarSubtitle,
  bulkUpdateSuccessMessage,
  removeMemberDescription,
} from "../projectMembersHelpers";

describe("projectMembersHelpers", () => {
  it("collects ids and merges profiles", () => {
    expect(collectUniqueUserIds([{ user_id: "a" }, { user_id: "a" }, { user_id: "b" }])).toEqual(["a", "b"]);
    const merged = mergeMembersWithProfiles(
      [{ user_id: "a", role: "admin" }],
      { a: { id: "a", email: "a@x.com", full_name: "Ada" } },
    );
    expect(merged[0].email).toBe("a@x.com");
    expect(merged[0].full_name).toBe("Ada");
  });

  it("counts admins and filters selection", () => {
    expect(countAdminMembers([{ role: "admin" }, { role: "viewer" }, { role: "owner" }])).toBe(2);
    expect(filterSelectedMembers([{ id: "1" }, { id: "2" }], new Set(["2"]))).toEqual([{ id: "2" }]);
  });

  it("detects last-admin demotions", () => {
    const members = [
      { id: "1", role: "admin" },
      { id: "2", role: "viewer" },
    ];
    expect(wouldLeaveProjectWithoutAdmin(members, [{ id: "1" }], "viewer")).toBe(true);
    expect(wouldLeaveProjectWithoutAdmin(members, [{ id: "2" }], "viewer")).toBe(false);
    expect(wouldLeaveProjectWithoutAdmin(members, [{ id: "1" }], "admin")).toBe(false);
  });

  it("selection set helpers", () => {
    expect([...pruneSelectedIds(new Set(["1", "2"]), new Set(["2"]))]).toEqual(["2"]);
    expect(allMembersSelected([{ id: "1" }, { id: "2" }], new Set(["1", "2"]))).toBe(true);
    expect([...nextSelectedIdsToggle(new Set(["1"]), "2", true)].sort()).toEqual(["1", "2"]);
    expect([...nextSelectedIdsAll([{ id: "1" }, { id: "2" }], true)].sort()).toEqual(["1", "2"]);
    expect([...nextSelectedIdsAll([{ id: "1" }], false)]).toEqual([]);
  });

  it("formats activity and messages", () => {
    expect(formatActivityEvent({ event_type: "member_added", target_email: "a@x.com", new_role: "viewer" })).toContain("added");
    expect(formatActivityEvent({ event_type: "role_changed", target_email: "a@x.com", old_role: "viewer", new_role: "admin" })).toContain("changed");
    expect(formatActivityEvent({ event_type: "member_removed", target_email: "a@x.com" })).toContain("removed");
    expect(commandBarSubtitle({ name: "Job" }, 1)).toBe("Job · 1 admin");
    expect(commandBarSubtitle(null, 0)).toContain("Pick a project");
    expect(bulkUpdateSuccessMessage(1)).toBe("Updated 1 member");
    expect(bulkUpdateSuccessMessage(3)).toBe("Updated 3 members");
    expect(removeMemberDescription({ email: "a@x.com", role: "viewer" })).toContain("Remove a@x.com");
  });
});
