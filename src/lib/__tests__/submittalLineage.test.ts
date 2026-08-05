import { describe, expect, it } from "vitest";
import {
  buildSubmittalLineageGroups,
  getSubmittalLineage,
  submittalLineageLabel,
  type LineageSubmittal,
} from "../submittalLineage";

// Phase 3 submittal splitting: a parent submittal can be spun off into child
// submittals linked via parent_submittal_id. These pin the pure grouping/lineage
// logic (ported from the standalone tracker's Register tree-walk) without React.

const sub = (id: string, extra: Partial<LineageSubmittal> = {}): LineageSubmittal => ({
  id,
  submittal_number: id.toUpperCase(),
  title: `Title ${id}`,
  parent_submittal_id: null,
  ...extra,
});

describe("submittalLineageLabel", () => {
  it("combines number + title", () => {
    expect(submittalLineageLabel(sub("a", { submittal_number: "05-1000", title: "Misc steel" })))
      .toBe("05-1000 — Misc steel");
  });
  it("falls back to number, then title, then a placeholder", () => {
    expect(submittalLineageLabel({ id: "x", submittal_number: "05-1000", title: "" })).toBe("05-1000");
    expect(submittalLineageLabel({ id: "x", submittal_number: "", title: "Just a title" })).toBe("Just a title");
    expect(submittalLineageLabel({ id: "x", submittal_number: "", title: "" })).toBe("(untitled submittal)");
  });
  it("treats a missing submittal as removed", () => {
    expect(submittalLineageLabel(null)).toBe("(removed)");
    expect(submittalLineageLabel(undefined)).toBe("(removed)");
  });
});

describe("buildSubmittalLineageGroups", () => {
  it("returns [] for empty / non-array input", () => {
    expect(buildSubmittalLineageGroups([])).toEqual([]);
    // Exercise the defensive non-array guard (cast around the typed signature).
    expect(buildSubmittalLineageGroups(null as unknown as LineageSubmittal[])).toEqual([]);
  });

  it("emits a flat list (all depth 0) when there is no parent linkage", () => {
    const rows = buildSubmittalLineageGroups([sub("a"), sub("b"), sub("c")]);
    expect(rows.map((r) => r.row.id)).toEqual(["a", "b", "c"]);
    expect(rows.every((r) => r.depth === 0)).toBe(true);
    expect(rows.every((r) => r.parentId === null && r.parentName === null)).toBe(true);
    expect(rows.every((r) => r.childCount === 0)).toBe(true);
  });

  it("nests children directly under their parent, in input order", () => {
    const rows = buildSubmittalLineageGroups([
      sub("parent"),
      sub("other"),
      sub("child1", { parent_submittal_id: "parent" }),
      sub("child2", { parent_submittal_id: "parent" }),
    ]);
    // parent, then its two children, then the unrelated top-level "other".
    expect(rows.map((r) => r.row.id)).toEqual(["parent", "child1", "child2", "other"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0]);
  });

  it("reports childCount on the parent and parentName on the children", () => {
    const rows = buildSubmittalLineageGroups([
      sub("p", { submittal_number: "P-1", title: "Misc" }),
      sub("c1", { parent_submittal_id: "p" }),
      sub("c2", { parent_submittal_id: "p" }),
    ]);
    const byId = new Map(rows.map((r) => [r.row.id, r]));
    expect(byId.get("p")!.childCount).toBe(2);
    expect(byId.get("c1")!.parentId).toBe("p");
    expect(byId.get("c1")!.parentName).toBe("P-1 — Misc");
    expect(byId.get("c2")!.parentName).toBe("P-1 — Misc");
  });

  it("supports grandchildren (arbitrary depth)", () => {
    const rows = buildSubmittalLineageGroups([
      sub("g0"),
      sub("g1", { parent_submittal_id: "g0" }),
      sub("g2", { parent_submittal_id: "g1" }),
    ]);
    expect(rows.map((r) => r.row.id)).toEqual(["g0", "g1", "g2"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2]);
  });

  it("surfaces an orphan (parent absent from the list) as top-level but keeps its parent id + (removed) label", () => {
    const rows = buildSubmittalLineageGroups([
      sub("orphan", { parent_submittal_id: "ghost" }),
      sub("normal"),
    ]);
    const orphan = rows.find((r) => r.row.id === "orphan")!;
    expect(orphan.depth).toBe(0);
    expect(orphan.parentId).toBe("ghost");
    expect(orphan.parentName).toBe("(removed)");
  });

  it("never emits a submittal twice and preserves length even under a data cycle", () => {
    // Pathological manual corruption: a <-> b point at each other. The DB CHECK
    // blocks self-ref but not a 2-cycle; the walk must still terminate + emit both.
    const rows = buildSubmittalLineageGroups([
      sub("a", { parent_submittal_id: "b" }),
      sub("b", { parent_submittal_id: "a" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.row.id))).toEqual(new Set(["a", "b"]));
  });

  it("ignores a self-referential parent id (treats the row as top-level)", () => {
    const rows = buildSubmittalLineageGroups([sub("self", { parent_submittal_id: "self" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].depth).toBe(0);
    // parentId is still reported (the raw column value) so the UI can flag it.
    expect(rows[0].parentId).toBe("self");
  });

  it("drops rows without an id", () => {
    const rows = buildSubmittalLineageGroups([sub("a"), { id: "", title: "no id" }, sub("b")]);
    expect(rows.map((r) => r.row.id)).toEqual(["a", "b"]);
  });
});

describe("getSubmittalLineage", () => {
  const pool: LineageSubmittal[] = [
    sub("parent", { submittal_number: "P-1", title: "Misc steel" }),
    sub("child1", { parent_submittal_id: "parent" }),
    sub("child2", { parent_submittal_id: "parent" }),
    sub("unrelated"),
  ];

  it("resolves parent + children for a parent submittal", () => {
    const { parent, children } = getSubmittalLineage(pool[0], pool);
    expect(parent).toBeNull(); // the parent itself has no parent
    expect(children.map((c) => c.id)).toEqual(["child1", "child2"]);
  });

  it("resolves the parent for a child submittal", () => {
    const { parent, children } = getSubmittalLineage(pool[1], pool);
    expect(parent?.id).toBe("parent");
    expect(children).toEqual([]);
  });

  it("returns null parent when the parent is absent from the pool", () => {
    const { parent } = getSubmittalLineage(sub("x", { parent_submittal_id: "ghost" }), pool);
    expect(parent).toBeNull();
  });

  it("is empty-safe for a null submittal", () => {
    expect(getSubmittalLineage(null, pool)).toEqual({ parent: null, children: [] });
  });
});
