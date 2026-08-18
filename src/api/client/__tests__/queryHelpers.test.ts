import { describe, expect, it, vi } from "vitest";
import { applyConditions, parseSortBy } from "../queryHelpers";
import { projectScopedSelect } from "../softDelete";

function createBuilder() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  for (const op of ["eq", "in", "is", "gte", "gt", "lte", "lt", "neq", "like", "ilike", "not"]) {
    builder[op] = vi.fn((...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    });
  }
  return { builder, calls };
}

describe("parseSortBy", () => {
  it("parses ascending and descending sort strings", () => {
    expect(parseSortBy("start_date")).toEqual({ column: "start_date", ascending: true });
    expect(parseSortBy("-submitted_date")).toEqual({ column: "submitted_date", ascending: false });
    expect(parseSortBy(null)).toBeNull();
  });
});

describe("applyConditions", () => {
  it("applies equality, IN, and NULL checks", () => {
    const { builder, calls } = createBuilder();
    applyConditions(builder, { status: "Open", project_id: ["a", "b"], assigned_to: null });
    expect(calls).toEqual([
      { op: "eq", args: ["status", "Open"] },
      { op: "in", args: ["project_id", ["a", "b"]] },
      { op: "is", args: ["assigned_to", null] },
    ]);
  });

  it("applies range operators from dotted keys", () => {
    const { builder, calls } = createBuilder();
    applyConditions(builder, { "date_required.lt": "2026-08-18T00:00:00.000Z", "stage.neq": "Released" });
    expect(calls).toEqual([
      { op: "lt", args: ["date_required", "2026-08-18T00:00:00.000Z"] },
      { op: "neq", args: ["stage", "Released"] },
    ]);
  });

  it("encodes NOT IN via status.nin", () => {
    const { builder, calls } = createBuilder();
    applyConditions(builder, { "status.nin": ["Answered", "Closed"] });
    expect(calls).toEqual([
      { op: "not", args: ["status", "in", '("Answered","Closed")'] },
    ]);
  });
});

describe("projectScopedSelect", () => {
  it("keeps the named project join on scoped tables", () => {
    expect(projectScopedSelect("rfis")).toBe("*, projects!rfis_project_id_fkey!inner(id)");
  });

  it("narrows columns while keeping the live-project join", () => {
    expect(projectScopedSelect("rfis", "id,date_required,status")).toBe(
      "id,date_required,status, projects!rfis_project_id_fkey!inner(id)",
    );
  });

  it("does not join projects for unscoped tables", () => {
    expect(projectScopedSelect("vendors", "id,name")).toBe("id,name");
  });
});
