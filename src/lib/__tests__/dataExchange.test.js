import { describe, expect, it, vi } from "vitest";
import {
  buildJsonExport,
  bulkCreateWithFallback,
  collectExportFields,
  makeExportFilename,
  recordsToCsv,
} from "../dataExchange";

describe("dataExchange", () => {
  it("keeps preferred business fields first and omits internal fields", () => {
    const fields = collectExportFields(
      [
        {
          id: "row-1",
          project_id: "project-1",
          title: "Grid conflict",
          status: "Open",
          custom_field: "value",
          metadata: { import: true },
        },
      ],
      ["title", "status"],
    );

    expect(fields).toEqual(["title", "status", "custom_field"]);
  });

  it("writes CSV that can round-trip quoted commas and line breaks", () => {
    const csv = recordsToCsv(
      [
        {
          title: "Anchor bolt, grid B4",
          question: "Confirm projection\nbefore pour",
          status: "Open",
        },
      ],
      ["title", "question", "status"],
    );

    expect(csv).toContain('"Anchor bolt, grid B4"');
    expect(csv).toContain('"Confirm projection\nbefore pour"');
    expect(csv.split("\r\n")[0]).toBe("title,question,status");
  });

  it("builds a project-scoped JSON export manifest", () => {
    const payload = buildJsonExport({
      exportedAt: "2026-05-15T12:00:00.000Z",
      project: { id: "project-1", project_number: "SB-100", name: "Main Steel" },
      targetKey: "rfis",
      target: { label: "RFIs", entityKey: "RFI", fields: ["title", "status"] },
      records: [{ id: "rfi-1", title: "Grid conflict", status: "Open" }],
    });

    expect(payload.project).toMatchObject({ id: "project-1", project_number: "SB-100" });
    expect(payload.dataset).toMatchObject({ key: "rfis", entity_key: "RFI", record_count: 1 });
    expect(payload.records[0]).toEqual({ title: "Grid conflict", status: "Open" });
  });

  it("creates stable export filenames", () => {
    expect(makeExportFilename({
      exportedAt: "2026-05-15T12:00:00.000Z",
      project: { project_number: "SB 100" },
      target: { label: "Schedule Tasks" },
      extension: "csv",
    })).toBe("sb-100-schedule-tasks-2026-05-15.csv");
  });
});

describe("bulkCreateWithFallback", () => {
  const makeEntity = ({ bulkFails = false, failOn = [] } = {}) => ({
    bulkCreate: vi.fn(async (records) => {
      if (bulkFails) throw new Error("bulk insert failed (one row violates a unique index)");
      return records.map((r, i) => ({ id: `bulk-${i}`, ...r }));
    }),
    create: vi.fn(async (record) => {
      if (failOn.includes(record.key)) {
        throw new Error(`duplicate key value violates unique constraint (${record.key})`);
      }
      return { id: `created-${record.key}`, ...record };
    }),
  });

  it("returns the bulk-created rows on the happy path (no per-row creates)", async () => {
    const entity = makeEntity();
    const rows = await bulkCreateWithFallback(entity, [{ key: "a" }, { key: "b" }]);
    expect(entity.bulkCreate).toHaveBeenCalledTimes(1);
    expect(entity.create).not.toHaveBeenCalled();
    expect(rows).toHaveLength(2);
  });

  it("falls back to per-row creates and SKIPS duplicates without throwing or aborting the batch", async () => {
    const entity = makeEntity({ bulkFails: true, failOn: ["dup1", "dup2"] });
    const rows = await bulkCreateWithFallback(entity, [
      { key: "ok1" }, { key: "dup1" }, { key: "ok2" }, { key: "dup2" },
    ]);
    // Every row attempted (no abort on the first duplicate), valid rows kept,
    // duplicates skipped — and crucially, no unhandled rejection.
    expect(entity.create).toHaveBeenCalledTimes(4);
    expect(rows.map((r) => r.key)).toEqual(["ok1", "ok2"]);
  });

  it("returns [] for an empty list without touching the entity", async () => {
    const entity = makeEntity();
    expect(await bulkCreateWithFallback(entity, [])).toEqual([]);
    expect(entity.bulkCreate).not.toHaveBeenCalled();
  });
});
