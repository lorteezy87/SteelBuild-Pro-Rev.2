import { describe, expect, it } from "vitest";
import {
  filterLiveFieldRecords,
  resolveFieldHubTabKey,
  resolveProjectName,
  buildFieldHubVisibleTabs,
  FIELD_HUB_TAB_DEFS,
  nextFieldTabParams,
  nextOpenRecordParams,
  nextNewRecordParams,
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

describe("FIELD_HUB_TAB_DEFS", () => {
  it("includes today and safety", () => {
    expect(FIELD_HUB_TAB_DEFS.map((t) => t.key)).toContain("today");
    expect(FIELD_HUB_TAB_DEFS.map((t) => t.key)).toContain("safety");
  });
});

describe("nextFieldTabParams / nextOpenRecordParams / nextNewRecordParams", () => {
  it("switches tab and clears id", () => {
    const next = nextFieldTabParams("field_tab=safety&id=abc&foo=1", "punchlist");
    expect(next.get("field_tab")).toBe("punchlist");
    expect(next.get("id")).toBeNull();
    expect(next.get("foo")).toBe("1");
  });

  it("hub tab deletes field_tab and id", () => {
    const next = nextFieldTabParams({ field_tab: "safety", id: "x" }, "hub");
    expect(next.get("field_tab")).toBeNull();
    expect(next.get("id")).toBeNull();
  });

  it("open record sets tab + id", () => {
    const next = nextOpenRecordParams(new URLSearchParams("foo=1"), "inspections", "row-9");
    expect(next.get("field_tab")).toBe("inspections");
    expect(next.get("id")).toBe("row-9");
    expect(next.get("foo")).toBe("1");
  });

  it("new record sets tab + new=1", () => {
    const next = nextNewRecordParams("field_tab=hub", "dailylogs");
    expect(next.get("field_tab")).toBe("dailylogs");
    expect(next.get("new")).toBe("1");
  });
});
