import { describe, expect, it, vi } from "vitest";
import {
  bulkCreateWithFallback,
  createSeedRecords,
  IMPORT_EXAMPLES,
  ROLE_OPTIONS,
} from "../onboardingMutationHelpers";

describe("bulkCreateWithFallback", () => {
  it("returns empty for empty records", async () => {
    expect(await bulkCreateWithFallback({ bulkCreate: vi.fn(), create: vi.fn() }, [])).toEqual([]);
  });

  it("uses bulkCreate when it succeeds", async () => {
    const entity = {
      bulkCreate: vi.fn(async (rows) => rows.map((r, i) => ({ ...r, id: i + 1 }))),
      create: vi.fn(),
    };
    const out = await bulkCreateWithFallback(entity, [{ a: 1 }]);
    expect(out).toEqual([{ a: 1, id: 1 }]);
    expect(entity.create).not.toHaveBeenCalled();
  });

  it("falls back to row creates and skips failures", async () => {
    const entity = {
      bulkCreate: vi.fn(async () => {
        throw new Error("bulk down");
      }),
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: "ok" })
        .mockRejectedValueOnce(new Error("dup")),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await bulkCreateWithFallback(entity, [{ a: 1 }, { a: 2 }]);
    expect(out).toEqual([{ id: "ok" }]);
    warn.mockRestore();
  });
});

describe("createSeedRecords", () => {
  it("wires drawing_set_id from created drawing sets", async () => {
    const drawingSets = {
      bulkCreate: vi.fn(async (rows) => rows.map((r) => ({ ...r, id: "set-1" }))),
      create: vi.fn(),
    };
    const drawings = {
      bulkCreate: vi.fn(async (rows) => rows),
      create: vi.fn(),
    };
    const entities = {
      DrawingSet: drawingSets,
      Drawing: drawings,
    };
    const created = await createSeedRecords(
      {
        drawingSets: [{ set_name: "IFC" }],
        drawings: [{ drawing_set_name: "IFC", sheet_number: "S1.01" }],
      },
      entities as any,
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
