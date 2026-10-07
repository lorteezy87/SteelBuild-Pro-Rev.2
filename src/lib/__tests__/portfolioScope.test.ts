import { describe, expect, it, vi } from "vitest";
import { projectsInWorkspace, readProjectRows } from "../portfolioScope";

describe("workspace portfolio reads", () => {
  it("includes only live projects in the selected workspace", () => {
    const projects = [
      { id: "a", org_id: "org-a" },
      { id: "b", org_id: "org-b" },
      { id: "held", org_id: "org-a", on_hold: true },
      { id: "deleted", org_id: "org-a", is_deleted: true },
      { id: "legacy" },
    ];
    expect(projectsInWorkspace(projects, "org-a").map((p) => p.id)).toEqual(["a"]);
    expect(projectsInWorkspace(projects, undefined)).toEqual([]);
  });

  it("does not turn an empty project set into a membership-wide fetch", async () => {
    const filterAll = vi.fn();
    expect(await readProjectRows({ filterAll }, [])).toEqual([]);
    expect(filterAll).not.toHaveBeenCalled();
  });

  it("pages bounded unique ID batches and rejects foreign project rows", async () => {
    const ids = Array.from({ length: 205 }, (_, index) => `p-${index}`);
    const filterAll = vi.fn(async (conditions: Record<string, unknown>) => [
      ...(conditions.project_id as string[]).map((project_id) => ({ project_id })),
      { project_id: "foreign" },
      { project_id: null },
    ]);
    const rows = await readProjectRows({ filterAll }, [...ids, ids[0], ""], "-start_date");
    expect(rows.map((row) => row.project_id)).toEqual(ids);
    expect(filterAll).toHaveBeenCalledTimes(3);
    expect(filterAll.mock.calls.map(([conditions]) => (conditions.project_id as string[]).length)).toEqual([100, 100, 5]);
    expect(filterAll).toHaveBeenNthCalledWith(1, { project_id: ids.slice(0, 100) }, "-start_date");
  });

  it("withholds totals when a batch reaches the entity pagination safety cap", async () => {
    const filterAll = vi.fn().mockResolvedValue(
      Array.from({ length: 100_000 }, () => ({ project_id: "project-a" })),
    );
    await expect(readProjectRows({ filterAll }, ["project-a"]))
      .rejects.toThrow("100,000-row safety limit");
  });

  it("rejects the entire rollup when a later batch fails", async () => {
    const failure = new Error("Second batch unavailable");
    const filterAll = vi.fn()
      .mockResolvedValueOnce([{ project_id: "p-0" }])
      .mockRejectedValueOnce(failure);
    await expect(readProjectRows(
      { filterAll },
      Array.from({ length: 101 }, (_, index) => `p-${index}`),
    )).rejects.toBe(failure);
  });
});
