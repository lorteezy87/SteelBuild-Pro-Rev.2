import { describe, expect, it } from "vitest";
import { isLiveProject, sortProjects } from "../projectContextHelpers";

describe("project context pure", () => {
  it("filters live and sorts by name", () => {
    expect(isLiveProject({ is_deleted: true })).toBe(false);
    expect(isLiveProject({ is_deleted: false })).toBe(true);
    expect(sortProjects([{ name: "B" }, { name: "A" }]).map((p) => p.name)).toEqual(["A", "B"]);
  });
});
