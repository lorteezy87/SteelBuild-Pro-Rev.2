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
    liveElementIds: [] as string[],
    selectPages: 0,
  };
  const from = vi.fn((table: string) => {
    const ops: Op[] = [];
    const result = (): { data: unknown; error: unknown } => {
      state.calls.push({ table, ops });
      const isInsert = ops.some(([op]) => op === "insert");
      if (isInsert && table === "model_registry") {
        return state.insertError ? { data: null, error: state.insertError } : { data: { id: "new-model" }, error: null };
      }
      // Simulate the paged soft-delete against a live roster: a select returns
      // one page of ids, and the matching `.in("id", ids)` update removes them,
      // so the self-consuming loop terminates exactly as it does in Postgres.
      if (table === "model_elements") {
        const isSelect = ops.some(([op]) => op === "select");
        const isUpdate = ops.some(([op]) => op === "update");
        if (isSelect) {
          const limitOp = ops.find(([op]) => op === "limit");
          const limit = (limitOp?.[1] as number) ?? 1000;
          state.selectPages += 1;
          return { data: state.liveElementIds.slice(0, limit).map((id) => ({ id })), error: null };
        }
        if (isUpdate) {
          const inOp = ops.find(([op]) => op === "in");
          const ids = (inOp?.[2] as string[]) || [];
          if (ids.length) {
            const gone = new Set(ids);
            state.liveElementIds = state.liveElementIds.filter((id) => !gone.has(id));
          }
          return { data: null, error: null };
        }
      }
      return { data: null, error: null };
    };
    const b: Record<string, unknown> = {};
    for (const op of ["insert", "update", "select", "eq", "neq", "or", "is", "not", "order", "limit", "in"]) {
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
    mocks.state.liveElementIds = [];
    mocks.state.selectPages = 0;
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

    // The retire step now PAGES: a select for one page of ids, scoped the same
    // way the old single UPDATE was.
    expect(retire.table).toBe("model_elements");
    expect(opNames(retire)[0]).toBe("select");
    expect(hasOp(retire, "eq", "source", "ifc")).toBe(true);
    expect(hasOp(retire, "eq", "is_deleted", false)).toBe(true);
    expect(hasOp(retire, "or", "model_id.is.null,model_id.neq.new-model")).toBe(true);
    // Empty roster to retire → one probing select, no update.
    expect(mocks.state.calls).toHaveLength(3);
    expect(mocks.state.link).toHaveBeenCalledWith("p1");
  });

  it("retires a large previous roster one bounded page per statement", async () => {
    // The bug: this was ONE update over the whole project. model_elements
    // carries 11 indexes and `authenticated` runs statement_timeout=8s, so on a
    // real roster (~28k rows) it died with "canceling statement due to
    // statement timeout" — after the new roster was already live.
    mocks.state.liveElementIds = Array.from({ length: 2300 }, (_, i) => `old-${i}`);

    await importIfcRoster({ projectId: "p1", fileName: "job.ifc", rows: [] });

    const elementCalls = mocks.state.calls.filter((c) => c.table === "model_elements");
    const updates = elementCalls.filter((c) => opNames(c)[0] === "update");
    // 2300 rows → pages of 1000, 1000, 300, then a final empty probe.
    expect(updates).toHaveLength(3);
    expect((updates[0].ops.find(([op]) => op === "in")?.[2] as string[])).toHaveLength(1000);
    expect((updates[2].ops.find(([op]) => op === "in")?.[2] as string[])).toHaveLength(300);
    // Every page is bounded — no statement is allowed to touch the whole roster.
    for (const u of updates) {
      const ids = u.ops.find(([op]) => op === "in")?.[2] as string[];
      expect(ids.length).toBeLessThanOrEqual(1000);
    }
    // And it actually finished the job.
    expect(mocks.state.liveElementIds).toHaveLength(0);
  });

  it("rolls back to the previous model when the RETIRE step fails", async () => {
    // Regression: the retire step used to sit outside the try/catch, so a
    // failure there left the new roster live AND the old one un-retired — two
    // rosters at once — while telling the operator to retry, which stacked a
    // third. One project reached 3 live rosters / 45,543 rows vs a true 13,992.
    let failed = false;
    const realFrom = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => {
      const b = realFrom(table) as Record<string, any>;
      if (table === "model_registry" && !failed) {
        const origUpdate = b.update;
        b.update = (...args: unknown[]) => {
          const patch = args[0] as Record<string, unknown>;
          if (patch?.status === "superseded") {
            failed = true;
            const thrower: Record<string, any> = {};
            for (const op of ["eq", "neq", "or", "in", "select", "limit"]) thrower[op] = () => thrower;
            thrower.then = (_res: unknown, rej: (e: unknown) => unknown) =>
              Promise.resolve().then(() => rej({ code: "57014", message: "canceling statement due to statement timeout" }));
            return thrower;
          }
          return origUpdate(...args);
        };
      }
      return b;
    });

    await expect(importIfcRoster({ projectId: "p1", fileName: "job.ifc", rows }))
      .rejects.toMatchObject({ code: "57014" });

    // The new model must be archived, not left active alongside the old one.
    const archived = mocks.state.calls.find(
      (c) => c.table === "model_registry" && (c.ops[0][1] as Record<string, unknown>)?.status === "archived",
    );
    expect(archived).toBeTruthy();
    expect(hasOp(archived!, "eq", "id", "new-model")).toBe(true);
    // …and anything it retired must be put back active.
    const unretire = mocks.state.calls.find(
      (c) => c.table === "model_registry" && (c.ops[0][1] as Record<string, unknown>)?.superseded_by === null,
    );
    expect(unretire).toBeTruthy();
    expect(hasOp(unretire!, "eq", "superseded_by", "new-model")).toBe(true);
    expect(mocks.state.link).not.toHaveBeenCalled();
  });

  it("discards the half-written model and keeps the old one active when a chunk fails", async () => {
    mocks.state.bulkCreate
      .mockImplementationOnce(async (chunk: unknown[]) => chunk)
      .mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));

    await expect(importIfcRoster({ projectId: "p1", fileName: "job.ifc", rows }))
      .rejects.toThrow(/duplicate key/);

    // Rollback now PAGES the discard, so the element call is a select probe.
    const tables = mocks.state.calls.map((c) => `${c.table}:${opNames(c)[0]}`);
    expect(tables).toEqual(["model_registry:insert", "model_elements:select", "model_registry:update", "model_registry:update", "model_elements:select"]);
    const dropElements = mocks.state.calls[1];
    const dropRegistry = mocks.state.calls[2];
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
    expect(opNames(mocks.state.calls[2])[0]).toBe("select");
  });
});
