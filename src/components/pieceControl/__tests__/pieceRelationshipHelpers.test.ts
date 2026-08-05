import { describe, expect, it } from "vitest";
import {
  buildContainerIds,
  selectLeafPieces,
  buildDrawingLinkCountByPiece,
  resolveLiveWorkPackageId,
  filterPackageScopedLeaves,
  filterSelectablePieces,
  sumSelectedPieceTons,
  filterActiveDrawingSets,
  filterDrawingSetsByNeedle,
  summarizeAutoAssignSkips,
  READINESS_BLOCKER_COPY,
  READINESS_MATERIAL_COPY,
} from "../pieceRelationshipHelpers";

describe("leaf / container selection", () => {
  const pieces = [
    { id: "parent", is_container: true, parent_piece_id: null, piece_mark: "C1" },
    { id: "child", is_container: false, parent_piece_id: "parent", piece_mark: "B1", work_package_id: "wp1", weight_each_lbs: 1000, quantity: 2 },
    { id: "leaf", is_container: false, parent_piece_id: null, piece_mark: "A1", work_package_id: null, weight_total_lbs: 500 },
  ] as any[];

  it("builds container ids from parent links", () => {
    expect([...buildContainerIds(pieces)].sort()).toEqual(["parent"]);
  });

  it("selects non-container non-parent leaves", () => {
    const ids = selectLeafPieces(pieces, buildContainerIds(pieces)).map((p) => p.id);
    // child is leaf of container but is not container and is not in containerIds (containerIds has parent only)
    // original: !is_container && !containerIds.has(piece.id)
    // containerIds = parent_piece_ids = {"parent"} so child and leaf both qualify; parent filtered as is_container
    expect(ids.sort()).toEqual(["child", "leaf"]);
  });
});

describe("drawing link counts", () => {
  it("counts links per piece", () => {
    const m = buildDrawingLinkCountByPiece([
      { piece_id: "a" },
      { piece_id: "a" },
      { piece_id: "b" },
    ]);
    expect(m.get("a")).toBe(2);
    expect(m.get("b")).toBe(1);
  });
});

describe("live WP + filters", () => {
  const wpMap = new Map([["wp1", "WP-1 Main"]]);
  it("resolves live only when map has id", () => {
    expect(resolveLiveWorkPackageId({ work_package_id: "wp1" }, wpMap)).toBe("wp1");
    expect(resolveLiveWorkPackageId({ work_package_id: "missing" }, wpMap)).toBeNull();
  });

  it("package scope keeps unassigned + focused package", () => {
    const leaves = [
      { id: "1", work_package_id: null },
      { id: "2", work_package_id: "wp1" },
      { id: "3", work_package_id: "wp2" },
    ] as any[];
    // wp2 not in map so live is null → kept
    const out = filterPackageScopedLeaves(leaves, "wp1", wpMap);
    expect(out.map((p) => p.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("selectable filters unassigned + mark + needs drawing", () => {
    const pieces = [
      { id: "a", piece_mark: "BM-1", work_package_id: null },
      { id: "b", piece_mark: "CL-1", work_package_id: "wp1" },
    ] as any[];
    const linkCounts = new Map([["a", 1]]);
    const unassigned = filterSelectablePieces({
      packageScopedLeaves: pieces,
      workPackageMap: wpMap,
      drawingLinkCountByPiece: linkCounts,
      markFilter: "",
      needsDrawingOnly: false,
      scopeFilter: "unassigned",
    });
    expect(unassigned.map((p) => p.id)).toEqual(["a"]);

    const needsDraw = filterSelectablePieces({
      packageScopedLeaves: pieces,
      workPackageMap: wpMap,
      drawingLinkCountByPiece: linkCounts,
      markFilter: "bm",
      needsDrawingOnly: true,
      scopeFilter: "all",
    });
    expect(needsDraw).toEqual([]);
  });
});

describe("sumSelectedPieceTons", () => {
  it("prefers each*qty then total", () => {
    const pieces = [
      { id: "1", weight_each_lbs: 1000, quantity: 2 },
      { id: "2", weight_total_lbs: 500 },
    ];
    const r = sumSelectedPieceTons(pieces, new Set(["1", "2"]));
    expect(r.known).toBe(2);
    expect(r.tons).toBeCloseTo((2000 + 500) / 2000);
    expect(r.selected).toBe(2);
  });
});

describe("drawing sets", () => {
  it("filters active and by needle", () => {
    const sets = [
      { id: "1", set_name: "Steel Set", is_deleted: false },
      { id: "2", set_name: "Arch", is_deleted: true },
      { id: "3", set_name: "Misc", deleted_at: "2026-01-01" },
    ];
    const active = filterActiveDrawingSets(sets);
    expect(active.map((s) => s.id)).toEqual(["1"]);
    expect(filterDrawingSetsByNeedle(active, "steel")).toHaveLength(1);
    expect(filterDrawingSetsByNeedle(active, "zzz")).toHaveLength(0);
  });
});

describe("summarizeAutoAssignSkips", () => {
  it("counts reasons", () => {
    expect(summarizeAutoAssignSkips(null)).toBeNull();
    expect(
      summarizeAutoAssignSkips([
        { reason: "no match" },
        { reason: "no match" },
        { reason: "ambiguous" },
      ]),
    ).toEqual({ "no match": 2, ambiguous: 1 });
  });
});

describe("readiness copy maps", () => {
  it("overrides known blocker and material strings", () => {
    expect(
      READINESS_BLOCKER_COPY[
        "No canonical pieces assigned to this work package."
      ],
    ).toMatch(/active pieces/i);
    expect(
      READINESS_MATERIAL_COPY["not yet evaluated in this release."],
    ).toMatch(/not available/i);
  });
});

