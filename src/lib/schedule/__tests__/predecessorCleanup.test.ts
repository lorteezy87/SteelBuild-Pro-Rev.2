import { describe, it, expect } from "vitest";
import { parseDependencies } from "@/services/scheduleCascade";
import { stripPredecessorLinks, describePredecessorCleanup } from "../predecessorCleanup";
import type { PredecessorCleanupPatch } from "../predecessorCleanup";

/**
 * Cover for audit §1.6 — deleting a task left every link that pointed at it
 * dangling. 26 of 137 links in production (19%) were orphaned this way.
 *
 * The failure is silent by construction: formatPredecessorLabels skips links it
 * cannot resolve and the cascade's applyLink skips unresolvable predecessors, so
 * the row keeps *looking* sequenced while nothing constrains it any more. These
 * tests pin the two halves that make it non-silent: the survivors are preserved
 * exactly, and the removed ids are reported so the caller can say so.
 */

const link = (id: string, type = "FS", lag_days = 1) => ({ id, type, lag_days });
const deps = (...links: ReturnType<typeof link>[]) => JSON.stringify(links);

describe("stripPredecessorLinks", () => {
  it("removes a link pointing at a deleted task", () => {
    const tasks = [{ id: "fab", dependencies: deps(link("det")) }];
    const [patch] = stripPredecessorLinks(tasks, ["det"]);

    expect(patch.id).toBe("fab");
    expect(patch.removed).toEqual(["det"]);
    // Last link gone → null, matching what serializeDependencies writes, so the
    // column never holds the string "[]".
    expect(patch.dependencies).toBeNull();
  });

  it("keeps the survivors, with their type and lag intact", () => {
    // A dropped lag or a downgraded SS→FS would silently reschedule the task.
    const tasks = [{ id: "erect", dependencies: deps(link("gone"), link("fab", "SS", 5)) }];
    const [patch] = stripPredecessorLinks(tasks, ["gone"]);

    expect(patch.removed).toEqual(["gone"]);
    expect(parseDependencies(patch.dependencies)).toEqual([
      { id: "fab", type: "SS", lag_days: 5 },
    ]);
  });

  it("reports every removed id when one delete orphans several links", () => {
    const tasks = [{ id: "erect", dependencies: deps(link("a"), link("b"), link("keep")) }];
    const [patch] = stripPredecessorLinks(tasks, ["a", "b"]);

    expect(patch.removed).toEqual(["a", "b"]);
    expect(parseDependencies(patch.dependencies).map((l) => l.id)).toEqual(["keep"]);
  });

  it("leaves untouched any task that loses nothing", () => {
    // The guard that keeps this from rewriting rows it has no business touching:
    // serializeDependencies normalises the legacy id-string shape, so comparing
    // serialized strings instead of link counts would rewrite every legacy row
    // it passed over.
    const tasks = [
      { id: "a", dependencies: deps(link("live")) },
      { id: "legacy", dependencies: JSON.stringify(["live"]) },
      { id: "none", dependencies: null },
      { id: "blank", dependencies: "" },
    ];
    expect(stripPredecessorLinks(tasks, ["deleted"])).toEqual([]);
  });

  it("never patches the task being deleted", () => {
    // Writing to a row mid-delete races the delete and buys nothing.
    const tasks = [
      { id: "doomed", dependencies: deps(link("alsoDoomed")) },
      { id: "alsoDoomed", dependencies: deps(link("live")) },
    ];
    expect(stripPredecessorLinks(tasks, ["doomed", "alsoDoomed"])).toEqual([]);
  });

  it("cleans up a legacy bare-string link, normalising only that row", () => {
    const tasks = [{ id: "fab", dependencies: JSON.stringify(["gone", "live"]) }];
    const [patch] = stripPredecessorLinks(tasks, ["gone"]);

    expect(patch.removed).toEqual(["gone"]);
    // parseDependencies defaults a legacy string to FS+1; the survivor is
    // written back in canonical form because this row was being rewritten anyway.
    expect(parseDependencies(patch.dependencies)).toEqual([
      { id: "live", type: "FS", lag_days: 1 },
    ]);
  });

  it("returns nothing for empty, null, or id-less input rather than throwing", () => {
    expect(stripPredecessorLinks([], ["x"])).toEqual([]);
    expect(stripPredecessorLinks(null, ["x"])).toEqual([]);
    expect(stripPredecessorLinks([{ id: "a", dependencies: deps(link("x")) }], [])).toEqual([]);
    expect(stripPredecessorLinks([{ id: "a", dependencies: deps(link("x")) }], null)).toEqual([]);
    expect(stripPredecessorLinks([{ dependencies: deps(link("x")) }], ["x"])).toEqual([]);
  });

  it("survives malformed JSON in the column", () => {
    // parseDependencies returns [] on a parse failure, so the row simply has no
    // links to strip — it must not throw and abort the whole delete.
    const tasks = [{ id: "broken", dependencies: "{not json" }];
    expect(() => stripPredecessorLinks(tasks, ["x"])).not.toThrow();
    expect(stripPredecessorLinks(tasks, ["x"])).toEqual([]);
  });

  it("scans the list it is given — callers must pass the whole project", () => {
    // Stated as an executable fact, the same way ganttBaselineScope pins the
    // baseline scope: handing this the phase-filtered rows would leave orphans
    // in every phase the user is not looking at.
    const project = [
      { id: "a", phase: "Fabrication", dependencies: deps(link("gone")) },
      { id: "b", phase: "Erection", dependencies: deps(link("gone")) },
    ];
    expect(stripPredecessorLinks(project, ["gone"])).toHaveLength(2);
    expect(stripPredecessorLinks(project.filter((t) => t.phase === "Fabrication"), ["gone"])).toHaveLength(1);
  });
});

describe("describePredecessorCleanup", () => {
  it("counts links and tasks separately, and singularises both", () => {
    // Explicitly typed: a bare `dependencies: null` widens to `any` and trips
    // the repo's noImplicitAny gate, which is stricter than `tsc -p tsconfig`.
    const one: PredecessorCleanupPatch[] = [{ id: "a", dependencies: null, removed: ["x"] }];
    expect(describePredecessorCleanup(one)).toBe("Cleared 1 predecessor link on 1 task");

    const many: PredecessorCleanupPatch[] = [
      { id: "a", dependencies: null, removed: ["x", "y"] },
      { id: "b", dependencies: null, removed: ["x"] },
    ];
    expect(describePredecessorCleanup(many)).toBe("Cleared 3 predecessor links on 2 tasks");
  });

  it("returns an empty string when nothing was cleaned, so the caller can stay quiet", () => {
    expect(describePredecessorCleanup([])).toBe("");
    expect(describePredecessorCleanup(null as never)).toBe("");
  });
});
