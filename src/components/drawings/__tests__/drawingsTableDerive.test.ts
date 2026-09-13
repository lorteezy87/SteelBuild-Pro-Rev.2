/**
 * Unit tests for drawingsTableDerive.ts — pure sort/row helpers only.
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Drawing } from "@/hooks/useDrawings";
import {
  buildDrawingTableViewModel,
  deriveGroupSelectionState,
  deriveSelectionState,
  getGroupSelectionToggleIds,
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
  type DrawingGroup,
  type FlatDrawingRow,
} from "../drawingsTableDerive";

function makeGroup(key: string, sheets: Array<Partial<Drawing>> = []): DrawingGroup {
  return {
    key,
    setId: null,
    setNumber: "",
    name: key,
    parent: null,
    sheets: sheets as Drawing[],
    setOnly: false,
    isUngrouped: false,
    aggregates: {
      total: sheets.length,
      stageCounts: {},
      releasedCount: 0,
      percentReleased: 0,
      earliestSubmitted: null,
      earliestDue: null,
      overdueCount: 0,
      maxLate: 0,
      aggregateStatus: null,
      disciplines: [],
      hasPriority: false,
      maxRev: 0,
      aiProcessed: 0,
      aiNeedsReview: 0,
      aiExtracting: 0,
      aiFailed: 0,
      stageSummary: null,
      driveUrl: null,
      revisionHistory: null,
      eventCount: null,
    },
  };
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
    expect((rows[0] as Extract<FlatDrawingRow, { type: "group" }>).isExpanded).toBe(false);
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
    expect(estimateFlatRowHeight({ type: "group" } as FlatDrawingRow)).toBe(48);
    expect(estimateFlatRowHeight({ type: "setOnlyInfo" } as FlatDrawingRow)).toBe(120);
    expect(estimateFlatRowHeight({ type: "sheet" } as FlatDrawingRow)).toBe(44);
  });
});

describe("table view-model selection", () => {
  const group = makeGroup("A", [{ id: "s1" }, { id: "s2" }]);

  it("derives visible and group checkbox state from only rendered sheets", () => {
    expect(deriveSelectionState(group.sheets, new Set(["s1", "outside"]))).toEqual({
      selectedCount: 1,
      allSelected: false,
      indeterminate: true,
    });
    expect(deriveGroupSelectionState(group, new Set(["s1", "s2"]))).toEqual({
      selectedCount: 2,
      allSelected: true,
      indeterminate: false,
    });
  });

  it("returns only ids whose controlled selection state must toggle", () => {
    expect(getGroupSelectionToggleIds(group, new Set(["s1"]))).toEqual(["s2"]);
    expect(getGroupSelectionToggleIds(group, new Set(["s1", "s2"]))).toEqual(["s1", "s2"]);
  });

  it("builds sorted flat rows without mutating the grouped source", () => {
    const source = makeGroup("A", [
      { id: "s1", title: "Zulu" },
      { id: "s2", title: "Alpha" },
    ]);
    const model = buildDrawingTableViewModel(
      [source],
      { field: "title", dir: "asc" },
      new Set(["A"]),
    );
    expect(model.rows.filter((row) => row.type === "sheet").map((row) => row.drawing.id))
      .toEqual(["s2", "s1"]);
    expect(source.sheets.map((drawing) => drawing.id)).toEqual(["s1", "s2"]);
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
