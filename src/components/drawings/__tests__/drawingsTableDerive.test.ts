/**
 * Unit tests for drawingsTableDerive.ts — pure sort/row helpers only.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  nextSortState,
  sortDrawingGroups,
  buildFlatDrawingRows,
  estimateFlatRowHeight,
  sortArrow,
  compactHideStyle,
  findBrandNewGroupKeys,
  loadExpandedSets,
  saveExpandedSets,
  EXPAND_LS_KEY,
  TABLE_COLUMNS,
} from "../drawingsTableDerive";

function makeGroup(key: any, sheets: any[] = []) {
  return { key, name: key, sheets, setOnly: false, isUngrouped: false, aggregates: { total: sheets.length } };
}

describe("nextSortState", () => {
  it("starts asc on new field", () => {
    expect(nextSortState(null, "title")).toEqual({ field: "title", dir: "asc" });
    expect(nextSortState({ field: "stage", dir: "desc" }, "title")).toEqual({ field: "title", dir: "asc" });
  });

  it("toggles asc → desc → off", () => {
    expect(nextSortState({ field: "title", dir: "asc" }, "title")).toEqual({ field: "title", dir: "desc" });
    expect(nextSortState({ field: "title", dir: "desc" }, "title")).toBeNull();
  });
});

describe("sortDrawingGroups", () => {
  it("returns groups unchanged when sort is null", () => {
    const groups = [makeGroup("A", [{ title: "Z" }, { title: "A" }])];
    expect(sortDrawingGroups(groups, null)).toBe(groups);
  });

  it("sorts sheets within each group by title", () => {
    const groups = [makeGroup("Set A", [{ title: "Zebra" }, { title: "Alpha" }])];
    const sorted = sortDrawingGroups(groups, { field: "title", dir: "asc" });
    expect(sorted[0].sheets.map((s) => s.title)).toEqual(["Alpha", "Zebra"]);
  });

  it("reverses order on desc", () => {
    const groups = [makeGroup("Set A", [{ title: "Alpha" }, { title: "Zebra" }])];
    const sorted = sortDrawingGroups(groups, { field: "title", dir: "desc" });
    expect(sorted[0].sheets.map((s) => s.title)).toEqual(["Zebra", "Alpha"]);
  });
});

describe("buildFlatDrawingRows", () => {
  it("emits collapsed group rows only", () => {
    const groups = [makeGroup("A", [{ id: "s1" }])];
    const rows = buildFlatDrawingRows(groups, new Set());
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("group");
    expect((rows[0] as any).isExpanded).toBe(false);
  });

  it("includes sheet rows when expanded", () => {
    const groups = [makeGroup("A", [{ id: "s1" }, { id: "s2" }])];
    const rows = buildFlatDrawingRows(groups, new Set(["A"]));
    expect(rows.filter((r) => r.type === "sheet")).toHaveLength(2);
  });

  it("includes setOnlyInfo row for set-only groups", () => {
    const groups = [{ ...makeGroup("B", []), setOnly: true }];
    const rows = buildFlatDrawingRows(groups, new Set(["B"]));
    expect(rows.some((r) => r.type === "setOnlyInfo")).toBe(true);
  });
});

describe("estimateFlatRowHeight", () => {
  it("returns height by row type", () => {
    expect(estimateFlatRowHeight({ type: "group" } as any)).toBe(62);
    expect(estimateFlatRowHeight({ type: "setOnlyInfo" } as any)).toBe(120);
    expect(estimateFlatRowHeight({ type: "sheet" } as any)).toBe(48);
  });
});

describe("sortArrow", () => {
  it("returns arrow only for active field", () => {
    expect(sortArrow(null, "title")).toBe("");
    expect(sortArrow({ field: "title", dir: "asc" }, "title")).toBe(" ▲");
    expect(sortArrow({ field: "title", dir: "desc" }, "title")).toBe(" ▼");
    expect(sortArrow({ field: "title", dir: "asc" }, "stage")).toBe("");
  });
});

describe("compactHideStyle", () => {
  it("hides columns when compact", () => {
    expect(compactHideStyle(true)).toEqual({ display: "none" });
    expect(compactHideStyle(false)).toBeUndefined();
  });
});

describe("findBrandNewGroupKeys", () => {
  it("returns groups whose keys were not seen before", () => {
    const seen = new Set(["A"]);
    const groups = [makeGroup("A"), makeGroup("B"), makeGroup("C")];
    const brandNew = findBrandNewGroupKeys(groups, seen);
    expect(brandNew.map((g) => g.key)).toEqual(["B", "C"]);
  });
});

describe("expand persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadExpandedSets returns null when empty", () => {
    expect(loadExpandedSets()).toBeNull();
  });

  it("saveExpandedSets and loadExpandedSets round-trip", () => {
    saveExpandedSets(new Set(["a", "b"]));
    expect(localStorage.getItem(EXPAND_LS_KEY)).toBeTruthy();
    expect([...(loadExpandedSets() ?? [])]).toEqual(["a", "b"]);
  });
});

describe("TABLE_COLUMNS", () => {
  it("defines sortable and static columns", () => {
    expect(TABLE_COLUMNS.some((c) => c.field === "title")).toBe(true);
    expect(TABLE_COLUMNS.some((c) => c.key === "approval" && c.field === null)).toBe(true);
  });
});
