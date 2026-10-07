import { describe, expect, it, vi } from "vitest";
import { setActiveOrgId } from "../activeOrg";
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
  it("keeps a remaining subset unconfirmed after a short bulk response and register deduplication", async () => {
    const recovery = new Map();
    const entity = {
      bulkCreate: vi.fn(async () => [{ id: "saved-a", key: "a" }]),
      create: vi.fn(async (record) => ({ id: "duplicate", ...record })),
    };
    const initial = await bulkCreateWithFallback(entity, [{ key: "a" }, { key: "b" }], "test", recovery);
    expect(initial).toMatchObject({ created: [{ id: "saved-a", key: "a" }], unresolved: 1 });
    const remaining = await bulkCreateWithFallback(entity, [{ key: "b" }], "test", recovery);
    expect(remaining).toMatchObject({ created: [], unresolved: 1 });
    expect(entity.bulkCreate).toHaveBeenCalledTimes(1);
    expect(entity.create).not.toHaveBeenCalled();
  });

  it("stops row fallback after the workspace changes during a write", async () => {
    setActiveOrgId("import-org-a");
    const entity = {
      bulkCreate: vi.fn(async () => { throw Object.assign(new Error("constraint"), { operation: "bulkCreate", code: "23514" }); }),
      create: vi.fn(async (record) => { setActiveOrgId("import-org-b"); return { id: "saved-a", ...record }; }),
    };
    await expect(bulkCreateWithFallback(entity, [{ key: "a" }, { key: "b" }])).rejects.toThrow(/workspace changed/i);
    expect(entity.create).toHaveBeenCalledTimes(1);
  });

  it("blocks edited or reuploaded payloads in a project until prior unknown writes are reconciled", async () => {
    const recovery = new Map();
    const entity = {
      bulkCreate: vi.fn(async () => { throw new TypeError("reply lost"); }),
      create: vi.fn(async (record) => ({ id: "duplicate", ...record })),
    };
    await bulkCreateWithFallback(entity, [{ project_id: "p1", key: "a" }], "test", recovery);
    await expect(bulkCreateWithFallback(entity, [{ project_id: "p1", key: "edited-a" }], "test", recovery)).rejects.toThrow(/unconfirmed.*reconcile/i);
    expect(entity.bulkCreate).toHaveBeenCalledTimes(1);
    expect(entity.create).not.toHaveBeenCalled();
  });

  it("retains a committed prefix and retries an ambiguous numbered row with its original identity", async () => {
    const operation = "00000000-0000-4000-8000-000000000001";
    const persisted = [{ id: "saved-a", key: "a" }];
    const cause = Object.assign(new Error("reply lost"), { outcomeUnknown: true, clientOperationId: operation });
    const entity = {
      bulkCreate: vi.fn(async () => { throw Object.assign(new Error("partial batch"), { created: [...persisted], failedIndex: 1, cause }); }),
      create: vi.fn(async (record, options) => {
        if (record.key === "b" && options?.clientOperationId === operation) return { id: "saved-b", key: "b" };
        const row = { id: `new-${persisted.length}`, ...record };
        persisted.push(row);
        return row;
      }),
    };
    const result = await bulkCreateWithFallback(entity, [{ key: "a" }, { key: "b" }, { key: "c" }]);
    expect(result.created.map((row) => row.id)).toEqual(["saved-a", "saved-b", "new-1"]);
    expect(persisted.filter((row) => row.key === "a")).toHaveLength(1);
    expect(entity.create).toHaveBeenCalledWith({ key: "b" }, { clientOperationId: operation });
  });

  it("holds an ambiguous bulk outcome without creating any row again", async () => {
    const entity = {
      bulkCreate: vi.fn(async () => { throw new TypeError("Failed to fetch"); }),
      create: vi.fn(async (record) => ({ id: "duplicate", ...record })),
    };
    const result = await bulkCreateWithFallback(entity, [{ key: "a" }, { key: "b" }]);
    expect(entity.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: [], skipped: 0, unresolved: 2 });
  });

  it("retains known successes and unknown outcomes when the same reviewed rows are submitted again", async () => {
    const recovery = new Map();
    const entity = {
      bulkCreate: vi.fn(async () => { throw Object.assign(new Error("constraint"), { operation: "bulkCreate", code: "23514" }); }),
      create: vi.fn(async (record) => {
        if (record.key === "b") throw new TypeError("reply lost");
        return { id: "saved-a", ...record };
      }),
    };
    await bulkCreateWithFallback(entity, [{ key: "a" }, { key: "b" }], "test", recovery);
    const result = await bulkCreateWithFallback(entity, [{ key: "a" }, { key: "b" }], "test", recovery);
    expect(entity.bulkCreate).toHaveBeenCalledTimes(1);
    expect(entity.create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: [{ id: "saved-a", key: "a" }], skipped: 0, unresolved: 1 });
  });

  const makeEntity = ({ bulkFails = false, failOn = [] } = {}) => ({
    bulkCreate: vi.fn(async (records) => {
      if (bulkFails) throw Object.assign(new Error("bulk insert failed (one row violates a unique index)"), { operation: "bulkCreate", code: "23505" });
      return records.map((r, i) => ({ id: `bulk-${i}`, ...r }));
    }),
    create: vi.fn(async (record) => {
      if (failOn.includes(record.key)) {
        throw Object.assign(new Error(`duplicate key value violates unique constraint (${record.key})`), { code: "23505" });
      }
      return { id: `created-${record.key}`, ...record };
    }),
  });

  it("returns the bulk-created rows on the happy path (no per-row creates)", async () => {
    const entity = makeEntity();
    const { created, skipped } = await bulkCreateWithFallback(entity, [{ key: "a" }, { key: "b" }]);
    expect(entity.bulkCreate).toHaveBeenCalledTimes(1);
    expect(entity.create).not.toHaveBeenCalled();
    expect(created).toHaveLength(2);
    expect(skipped).toBe(0);
  });

  it("falls back to per-row creates and SKIPS duplicates without throwing or aborting the batch", async () => {
    const entity = makeEntity({ bulkFails: true, failOn: ["dup1", "dup2"] });
    const { created, skipped } = await bulkCreateWithFallback(entity, [
      { key: "ok1" }, { key: "dup1" }, { key: "ok2" }, { key: "dup2" },
    ]);
    // Every row attempted (no abort on the first duplicate), valid rows kept,
    // duplicates skipped — and crucially, no unhandled rejection.
    expect(entity.create).toHaveBeenCalledTimes(4);
    expect(created.map((r) => r.key)).toEqual(["ok1", "ok2"]);
    expect(skipped).toBe(2);
  });

  it("returns empty created/skipped for an empty list without touching the entity", async () => {
    const entity = makeEntity();
    expect(await bulkCreateWithFallback(entity, [])).toEqual({ created: [], skipped: 0, unresolved: 0, retryable: 0 });
    expect(entity.bulkCreate).not.toHaveBeenCalled();
  });
});
