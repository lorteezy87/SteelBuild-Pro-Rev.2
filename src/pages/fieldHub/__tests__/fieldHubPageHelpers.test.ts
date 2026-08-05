import { describe, expect, it } from "vitest";
import {
  filterLiveFieldRecords,
  resolveFieldHubTabKey,
  resolveProjectName,
  buildFieldHubVisibleTabs,
} from "../fieldHubPageHelpers";

describe("fieldHubPageHelpers", () => {
  it("live filter and tabs", () => {
    expect(filterLiveFieldRecords([{ id: 1 }, { id: 2, is_deleted: true }])).toHaveLength(1);
    expect(resolveFieldHubTabKey("safety", ["hub", "safety", "punchlist"])).toBe("safety");
    expect(resolveFieldHubTabKey("nope", ["hub", "safety"])).toBe("hub");
    expect(resolveProjectName([{ id: "p1", name: "Alpha" }], "p1")).toBe("Alpha");
    expect(resolveProjectName([], "p1")).toBe("All Projects");
    expect(buildFieldHubVisibleTabs([{ key: "lems", label: "LEMs" } as any])[0].key).toBe("hub");
  });
});

import { FIELD_HUB_TAB_DEFS } from "../fieldHubPageHelpers";

describe("FIELD_HUB_TAB_DEFS", () => {
  it("includes today and safety", () => {
    expect(FIELD_HUB_TAB_DEFS.map((t) => t.key)).toContain("today");
    expect(FIELD_HUB_TAB_DEFS.map((t) => t.key)).toContain("safety");
  });
});
