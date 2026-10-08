import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: db }));

import { evaluateDrawingSetGate, fetchSelectedSetScope } from "../sheetSetEvidence";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

class Query {
  private rows: Row[];

  constructor(rows: Row[]) { this.rows = rows; }
  select(_columns: string) { return this; }
  eq(column: string, value: unknown) { this.rows = this.rows.filter((row) => row[column] === value); return this; }
  is(column: string, value: unknown) { this.rows = this.rows.filter((row) => row[column] === value); return this; }
  in(column: string, values: string[]) { this.rows = this.rows.filter((row) => values.includes(String(row[column]))); return this; }
  order(column: string) { this.rows = this.rows.slice().sort((a, b) => String(a[column]).localeCompare(String(b[column]))); return this; }
  async range(start: number, end: number): Promise<{ data: Row[]; error: null }> {
    return { data: this.rows.slice(start, end + 1), error: null };
  }
}

function piece(id: string, workPackageId: string | null, overrides: Row = {}): Row {
  return {
    id,
    project_id: "project-1",
    parent_piece_id: null,
    work_package_id: workPackageId,
    is_container: false,
    is_deleted: false,
    deleted_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  tables = {
    drawing_sets: [{ id: "set-1", project_id: "project-1", is_deleted: false, deleted_at: null }],
    drawings: [{ id: "sheet-1", project_id: "project-1", drawing_set_id: "set-1", is_deleted: false, deleted_at: null }],
    piece_drawing_sets: [],
    piece_drawings: [],
    pieces: [],
    work_packages: [],
  };
  db.from.mockReset().mockImplementation((table: string) => new Query(tables[table] ?? []));
  db.rpc.mockReset();
});

describe("selected drawing-set evidence", () => {
  it("uses the project-scoped server evaluator and validates its response", async () => {
    db.rpc.mockResolvedValue({ data: {
      drawing_set_id: "set-1", rule_version: "drawing-shop-v2", ok: false,
      blockers: [{ kind: "active_holds", title: "1 sheet on hold" }],
      blocking_rfi_numbers: ["RFI-11"], evaluated_at: "2026-10-07T00:00:00Z",
      submittal_id: "sub-11", submittal_number: "SD-11", governing_stage: "OFS",
    }, error: null });

    const gate = await evaluateDrawingSetGate("project-1", "set-1");
    expect(db.rpc).toHaveBeenCalledWith("evaluate_fab_release_set", {
      p_project_id: "project-1", p_drawing_set_id: "set-1",
    });
    expect(gate).toEqual({
      ok: false,
      blockers: [{ kind: "active_holds", title: "1 sheet on hold" }],
      blockingRfiNumbers: ["RFI-11"], evaluatedAt: "2026-10-07T00:00:00Z",
      submittalId: "sub-11", submittalNumber: "SD-11", governingStage: "OFS",
    });

    db.rpc.mockResolvedValue({ data: {
      drawing_set_id: "other-set", rule_version: "drawing-shop-v2", ok: true, blockers: [], blocking_rfi_numbers: [],
      submittal_id: null, submittal_number: null, governing_stage: "Not Started",
    }, error: null });
    await expect(evaluateDrawingSetGate("project-1", "set-1")).rejects.toThrow("incomplete evidence");

    db.rpc.mockResolvedValue({ data: {
      drawing_set_id: "set-1", rule_version: "drawing-shop-v2", ok: true, blockers: [], blocking_rfi_numbers: [],
      submittal_id: "sub-11", submittal_number: "SD-11",
    }, error: null });
    await expect(evaluateDrawingSetGate("project-1", "set-1")).rejects.toThrow("incomplete evidence");
  });

  it("rejects a clear-looking response from an older or unknown server rule", async () => {
    const clearResponse = {
      drawing_set_id: "set-1", ok: true,
      blockers: [] as Array<{ kind: string; title: string }>,
      blocking_rfi_numbers: [] as string[],
      submittal_id: "sub-approved", submittal_number: "SD-1", governing_stage: "IFC",
    };
    db.rpc.mockResolvedValue({ data: clearResponse, error: null });
    await expect(evaluateDrawingSetGate("project-1", "set-1")).rejects.toThrow("unsupported rule version");

    db.rpc.mockResolvedValue({ data: { ...clearResponse, rule_version: "drawing-shop-v1" }, error: null });
    await expect(evaluateDrawingSetGate("project-1", "set-1")).rejects.toThrow("unsupported rule version");
  });

  it("deduplicates direct and sheet links, excludes split parents, and keeps the project boundary", async () => {
    tables.piece_drawing_sets = [
      { id: "link-1", project_id: "project-1", drawing_set_id: "set-1", piece_id: "parent" },
      { id: "link-2", project_id: "project-1", drawing_set_id: "set-1", piece_id: "lot-a" },
      { id: "link-3", project_id: "project-1", drawing_set_id: "set-1", piece_id: "unassigned" },
      { id: "link-4", project_id: "other-project", drawing_set_id: "set-1", piece_id: "foreign" },
    ];
    tables.piece_drawings = [
      { id: "sheet-link-1", project_id: "project-1", drawing_id: "sheet-1", piece_id: "lot-a" },
      { id: "sheet-link-2", project_id: "project-1", drawing_id: "sheet-1", piece_id: "lot-b" },
      { id: "sheet-link-3", project_id: "project-1", drawing_id: "other-sheet", piece_id: "wrong-sheet" },
    ];
    tables.pieces = [
      piece("parent", "wp-1", { is_container: true }),
      piece("child", "wp-1", { parent_piece_id: "parent" }),
      piece("lot-a", "wp-1"),
      piece("lot-b", "wp-2"),
      piece("unassigned", null),
      piece("foreign", "wp-foreign", { project_id: "other-project" }),
    ];
    tables.work_packages = [
      { id: "wp-1", project_id: "project-1", wp_number: "WP-001", name: "Main", is_deleted: false, deleted_at: null },
      { id: "wp-2", project_id: "project-1", wp_number: "WP-002", name: "Mezzanine", is_deleted: false, deleted_at: null },
      { id: "wp-foreign", project_id: "other-project", wp_number: "WP-X", name: "Foreign", is_deleted: false, deleted_at: null },
    ];

    const scope = await fetchSelectedSetScope("project-1", "set-1");
    expect(scope.linkedLeafLotCount).toBe(3);
    expect(scope.unassignedLeafLotCount).toBe(1);
    expect(scope.splitParentSetLinks).toBe(1);
    expect(scope.workPackages.map((wp) => [wp.wp_number, wp.leafLotCount])).toEqual([
      ["WP-001", 1], ["WP-002", 1],
    ]);
    expect(scope.unresolvedWorkPackageCount).toBe(0);
    expect(db.from).not.toHaveBeenCalledWith("rfis");
  });

  it("rejects a missing or foreign drawing set instead of reporting zero scope", async () => {
    tables.drawing_sets = [];
    await expect(fetchSelectedSetScope("project-1", "set-1"))
      .rejects.toThrow("Drawing set not found in this project");
  });

  it("rejects an unresolved linked piece rather than presenting a false zero", async () => {
    tables.piece_drawing_sets = [
      { id: "link-1", project_id: "project-1", drawing_set_id: "set-1", piece_id: "missing-piece" },
    ];
    await expect(fetchSelectedSetScope("project-1", "set-1"))
      .rejects.toThrow("Linked piece scope is incomplete");
  });
});
