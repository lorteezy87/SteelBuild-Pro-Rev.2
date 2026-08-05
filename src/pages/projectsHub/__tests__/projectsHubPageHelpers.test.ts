import { describe, expect, it } from "vitest";
import { PROJECTS_HUB_TAB_DEFS } from "../projectsHubPageHelpers";

describe("PROJECTS_HUB_TAB_DEFS", () => {
  it("includes projects and members", () => {
    expect(PROJECTS_HUB_TAB_DEFS.map((t) => t.key)).toContain("projects");
    expect(PROJECTS_HUB_TAB_DEFS.map((t) => t.key)).toContain("members");
  });
});
