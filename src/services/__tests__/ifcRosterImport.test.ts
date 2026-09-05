import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * importIfcRoster must write the NEW model + roster before it retires the old
 * one, and must discard a half-written model on failure — a project must never
 * be left with only `superseded` registry rows after a bad save.
 */
type Op = [string, ...unknown[]];
interface Call { table: string; ops: Op[] }

const mocks = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    bulkCreate: vi.fn(),
    link: vi.fn(),
    insertError: null as unknown,
  };
  const from = vi.fn((table: string) => {
    const ops: Op[] = [];
    const result = (): { data: unknown; error: unknown } => {
      state.calls.push({ table, ops });
      const isInsert = ops.some(([op]) => op === "insert");
      if (isInsert && table === "model_registry") {
        return state.insertError ? { data: null, error: state.insertError } : { data: { id: "new-model" }, error: null };
      }
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {};
    for (const op of ["insert", "update", "select", "eq", "neq", "or", "is", "not", "order", "limit"]) {
      b[op] = (...args: unknown[]) => { ops.push([op, ...args]); return b; };
    }
    b.single = async () => result();
    b.maybeSingle = async () => result();
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject);
    return b;
  });
  return { state, from };
});

vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/api/supabaseClient", () => ({
  entities: { ModelElement: { bulkCreate: (...a: unknown[]) => mocks.state.bulkCreate(...a) } },
}));
vi.mock("@/lib/pieceControl/modelElementLink", () => ({
  linkModelElementsToPieces: (...a: unknown[]) => mocks.state.link(...a),
}));

import { importIfcRoster } from "../ifcRosterImport";

const rows = Array.from({ length: 700 }, (_, i) => ({
  element_guid: `G${i}`, piece_mark: `B${i % 50}`, assembly_mark: `B${i % 50}`, part_mark: `p${i}`,
  sequence_number: "1", name: `BEAM ${i}`, ifc_type: "beam", quantity: 1,
}));

const opNames = (c: Call) => c.ops.map(([op]) => op);
const hasOp = (c: Call, op: string, ...args: unknown[]) =>
  c.ops.some(([name, ...a]) => name === op && args.every((x, i) => JSON.stringify(a[i]) === JSON.stringify(x)));

describe("importIfcRoster", () => {
  beforeEach(() => {
    mocks.state.calls.length = 0;
    mocks.state.insertError = null;
    mocks.state.bulkCreate.mockReset().mockImplementation(async (chunk: unknown[]) => chunk);
    mocks.state.link.mockReset().mockResolvedValue({ linked: 3, ambiguous: 0, unmatched: 1 });
    mocks.from.mockClear();
  });

  it("inserts the new model and roster BEFORE superseding the previous model", async () => {
    const progress: Array<[number, number]> = [];
    const out = await importIfcRoster({
      projectId: "p1", fileName: "job.ifc", schema: "IFC4", fileUrl: "org/uploads/x.ifc.gz", rows,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(out).toEqual({ modelId: "new-model", created: 700, linkSummary: { linked: 3, ambiguous: 0, unmatched: 1 } });
    expect(progress).toEqual([[0, 700], [500, 700], [700, 700]]);

    // Order of DB writes: registry insert → (bulkCreate ×2) → supersede → soft-delete old roster.
    const [insert, supersede, retire] = mocks.state.calls;
    expect(insert.table).toBe("model_registry");
    expect(opNames(insert)[0]).toBe("insert");
    const inserted = insert.ops[0][1] as Record<string, unknown>;
    expect(inserted).toMatchObject({ project_id: "p1", file_type: "IFC", status: "active", file_url: "org/uploads/x.ifc.gz" });
    expect(inserted.metadata).toEqual({ parts: 700, imported_from: "ifc_roster" });

    expect(mocks.state.bulkCreate).toHaveBeenCalledTimes(2);
    expect(mocks.state.bulkCreate.mock.calls[0][0]).toHaveLength(500);
    expect(mocks.state.bulkCreate.mock.calls[0][0][0]).toMatchObject({
      project_id: "p1", model_id: "new-model", source: "ifc", element_guid: "G0", piece_mark: "B0",
    });

    expect(supersede.table).toBe("model_registry");
    expect(supersede.ops[0][0]).toBe("update");
    expect((supersede.ops[0][1] as Record<string, unknown>).status).toBe("superseded");
    expect((supersede.ops[0][1] as Record<string, unknown>).superseded_by).toBe("new-model");
    expect(hasOp(supersede, "eq", "status", "active")).toBe(true);
    expect(hasOp(supersede, "neq", "id", "new-model")).toBe(true);

    expect(retire.table).toBe("model_elements");
    expect((retire.ops[0][1] as Record<string, unknown>).is_deleted).toBe(true);
    expect(hasOp(retire, "eq", "source", "ifc")).toBe(true);
    expect(hasOp(retire, "or", "model_id.is.null,model_id.neq.new-model")).toBe(true);
    expect(mocks.state.calls).toHaveLength(3);
    expect(mocks.state.link).toHaveBeenCalledWith("p1");
  });

  it("discards the half-written model and keeps the old one active when a chunk fails", async () => {
    mocks.state.bulkCreate
      .mockImplementationOnce(async (chunk: unknown[]) => chunk)
      .mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));

    await expect(importIfcRoster({ projectId: "p1", fileName: "job.ifc", rows }))
      .rejects.toThrow(/duplicate key/);

    const tables = mocks.state.calls.map((c) => `${c.table}:${opNames(c)[0]}`);
    expect(tables).toEqual(["model_registry:insert", "model_elements:update", "model_registry:update"]);
    const [, dropElements, dropRegistry] = mocks.state.calls;
    expect(hasOp(dropElements, "eq", "model_id", "new-model")).toBe(true);
    expect((dropRegistry.ops[0][1] as Record<string, unknown>).status).toBe("archived");
    expect(hasOp(dropRegistry, "eq", "id", "new-model")).toBe(true);
    // Nothing was superseded, and the link step never ran.
    expect(mocks.state.calls.some((c) => (c.ops[0][1] as Record<string, unknown> | undefined)?.status === "superseded")).toBe(false);
    expect(mocks.state.link).not.toHaveBeenCalled();
  });

  it("surfaces a registry insert failure without touching the roster", async () => {
    mocks.state.insertError = { code: "42501", message: "permission denied for table model_registry" };
    await expect(importIfcRoster({ projectId: "p1", fileName: "job.ifc", rows }))
      .rejects.toMatchObject({ code: "42501" });
    expect(mocks.state.bulkCreate).not.toHaveBeenCalled();
    expect(mocks.state.calls).toHaveLength(1);
  });

  it("still replaces the model when the IFC yields no marks (file_url only)", async () => {
    const out = await importIfcRoster({ projectId: "p1", fileName: "job.ifc", fileUrl: "x.gz", rows: [] });
    expect(out.created).toBe(0);
    expect(mocks.state.bulkCreate).not.toHaveBeenCalled();
    expect(mocks.state.calls.map((c) => c.table)).toEqual(["model_registry", "model_registry", "model_elements"]);
  });
});
