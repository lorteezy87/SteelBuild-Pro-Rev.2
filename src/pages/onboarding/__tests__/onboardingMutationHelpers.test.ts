import { describe, expect, it, vi } from "vitest";
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
  it("returns empty for empty records", async () => {
    expect(await bulkCreateWithFallback(passthroughEntity(), [])).toEqual([]);
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
    expect(out).toEqual([{ a: 1, id: 1 }]);
    expect(entity.create).not.toHaveBeenCalled();
  });

  it("falls back to row creates and skips failures", async () => {
    const entity = {
      bulkCreate: vi.fn(async (_rows: SeedRecord[]): Promise<SeedRecord[]> => {
        throw new Error("bulk down");
      }),
      create: vi.fn(async (record: SeedRecord): Promise<SeedRecord> => record),
    };
    entity.create
      .mockResolvedValueOnce({ id: "ok" })
      .mockRejectedValueOnce(new Error("dup"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await bulkCreateWithFallback(entity, [{ a: 1 }, { a: 2 }]);
    expect(out).toEqual([{ id: "ok" }]);
    warn.mockRestore();
  });
});

describe("createSeedRecords", () => {
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
    expect(created.drawingSets).toHaveLength(1);
    expect(drawings.bulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ drawing_set_id: "set-1", sheet_number: "S1.01" }),
    ]);
  });

  it("ships shared import constants", () => {
    expect(IMPORT_EXAMPLES.rfis).toContain("RFI #");
    expect(ROLE_OPTIONS).toContain("pm");
  });
});
