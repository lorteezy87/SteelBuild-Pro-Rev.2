import { describe, expect, it, vi } from "vitest";
import { setActiveOrgId } from "@/lib/activeOrg";
import {
  bulkCreateWithFallback,
  createSeedRecords,
  IMPORT_EXAMPLES,
  ROLE_OPTIONS,
  type EntityClient,
  type SeedRecord,
} from "../onboardingMutationHelpers";

function passthroughEntity(): EntityClient {
  return {
    bulkCreate: vi.fn(async (rows: SeedRecord[]) => rows),
    create: vi.fn(async (record: SeedRecord) => record),
  };
}

describe("bulkCreateWithFallback", () => {
  it("reports an unconfirmed bulk write instead of claiming a successful empty import or replaying it", async () => {
    const entity = {
      bulkCreate: vi.fn(async (): Promise<SeedRecord[]> => { throw new TypeError("reply lost"); }),
      create: vi.fn(async (record: SeedRecord) => ({ id: "duplicate", ...record })),
    };
    const result = await bulkCreateWithFallback(entity, [{ title: "Load 1" }]);
    expect(result).toMatchObject({ created: [], skipped: 0, unresolved: 1 });
    expect(entity.create).not.toHaveBeenCalled();
  });
  it("returns empty for empty records", async () => {
    expect(await bulkCreateWithFallback(passthroughEntity(), [])).toEqual({ created: [], skipped: 0, unresolved: 0, retryable: 0 });
  });

  it("uses bulkCreate when it succeeds", async () => {
    const entity = {
      bulkCreate: vi.fn(async (rows: SeedRecord[]) =>
        rows.map((record: SeedRecord, index: number) => ({
          ...record,
          id: index + 1,
        })),
      ),
      create: vi.fn(async (record: SeedRecord) => record),
    };
    const out = await bulkCreateWithFallback(entity, [{ a: 1 }]);
    expect(out.created).toEqual([{ a: 1, id: 1 }]);
    expect(entity.create).not.toHaveBeenCalled();
  });

  it("falls back to row creates and skips failures", async () => {
    const entity = {
      bulkCreate: vi.fn(async (_rows: SeedRecord[]): Promise<SeedRecord[]> => {
        throw Object.assign(new Error("bulk constraint rejection"), { operation: "bulkCreate", code: "23505" });
      }),
      create: vi.fn(async (record: SeedRecord): Promise<SeedRecord> => record),
    };
    entity.create
      .mockResolvedValueOnce({ id: "ok" })
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await bulkCreateWithFallback(entity, [{ a: 1 }, { a: 2 }]);
    expect(out).toEqual({ created: [{ id: "ok" }], skipped: 1, unresolved: 0, retryable: 0 });
    warn.mockRestore();
  });
});

describe("createSeedRecords", () => {
  it("stops before the next seed entity when the workspace changes", async () => {
    setActiveOrgId("seed-org-a");
    const workPackages = {
      bulkCreate: vi.fn(async (rows: SeedRecord[]) => { setActiveOrgId("seed-org-b"); return rows; }),
      create: vi.fn(async (row: SeedRecord) => row),
    };
    const deliveries = passthroughEntity();
    await expect(createSeedRecords({ workPackages: [{ name: "First" }], deliveries: [{ description: "Next" }] }, {
      WorkPackage: workPackages, Delivery: deliveries,
    }, ["workPackages", "deliveries"])).rejects.toThrow(/workspace changed/i);
    expect(deliveries.bulkCreate).not.toHaveBeenCalled();
  });

  it("holds drawings until their seed set is confirmed so a later retry cannot recreate them under a new set id", async () => {
    const recovery = new Map();
    const sets = {
      bulkCreate: vi.fn(async (): Promise<SeedRecord[]> => { throw Object.assign(new Error("invalid set"), { operation: "bulkCreate", code: "23514" }); }),
      create: vi.fn(async (row: SeedRecord) => ({ ...row, id: "set-1" })),
    };
    sets.create.mockRejectedValueOnce(Object.assign(new Error("invalid set"), { code: "23514" }));
    const drawings = { bulkCreate: vi.fn(async (rows: SeedRecord[]) => rows), create: vi.fn(async (row: SeedRecord) => row) };
    const payloads = { drawingSets: [{ set_name: "IFC" }], drawings: [{ drawing_set_name: "IFC", sheet_number: "S1" }] };
    const entities = { DrawingSet: sets, Drawing: drawings };
    await createSeedRecords(payloads, entities, ["drawingSets", "drawings"], recovery);
    expect(drawings.bulkCreate).not.toHaveBeenCalled();
    await createSeedRecords(payloads, entities, ["drawingSets", "drawings"], recovery);
    expect(drawings.bulkCreate).toHaveBeenCalledExactlyOnceWith([{ drawing_set_name: "IFC", sheet_number: "S1", drawing_set_id: "set-1" }]);
  });

  it("reports missing clients and uncertain seed outcomes without claiming complete setup", async () => {
    const result = await createSeedRecords({
      workPackages: [{ name: "Sequence 1" }],
      deliveries: [{ description: "Load 1" }],
    }, {
      Delivery: {
        bulkCreate: async () => { throw new TypeError("reply lost"); },
        create: async (row) => row,
      },
    }, ["workPackages", "deliveries"]);
    expect(result).toMatchObject({
      createdByKey: { workPackages: [], deliveries: [] },
      skipped: 1,
      unresolved: 1,
    });
  });

  it("wires drawing_set_id from created drawing sets", async () => {
    const drawingSets = {
      bulkCreate: vi.fn(async (rows: SeedRecord[]) =>
        rows.map((record: SeedRecord) => ({ ...record, id: "set-1" })),
      ),
      create: vi.fn(async (record: SeedRecord) => record),
    };
    const drawings = {
      bulkCreate: vi.fn(async (rows: SeedRecord[]) => rows),
      create: vi.fn(async (record: SeedRecord) => record),
    };
    const entities: Record<string, EntityClient | undefined> = {
      DrawingSet: drawingSets,
      Drawing: drawings,
    };
    const created = await createSeedRecords(
      {
        drawingSets: [{ set_name: "IFC" }],
        drawings: [{ drawing_set_name: "IFC", sheet_number: "S1.01" }],
      },
      entities,
      ["drawingSets", "drawings"],
    );
    expect(created.createdByKey.drawingSets).toHaveLength(1);
    expect(drawings.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ drawing_set_id: "set-1", sheet_number: "S1.01" }),
    ]);
  });

  it("ships shared import constants", () => {
    expect(IMPORT_EXAMPLES.rfis).toContain("RFI #");
    expect(ROLE_OPTIONS).toContain("pm");
  });
});
