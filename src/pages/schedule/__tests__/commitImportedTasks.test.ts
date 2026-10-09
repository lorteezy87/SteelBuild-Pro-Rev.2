import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMppTask } from "../types";

const create = vi.fn();
const update = vi.fn();
const filterAll = vi.fn();
const invalidateEntity = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    ScheduleTask: {
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
      filterAll: (...args: unknown[]) => filterAll(...args),
    },
  },
}));

vi.mock("@/services/cacheRegistry", () => ({
  invalidateEntity: (...args: unknown[]) => invalidateEntity(...args),
}));

import { commitImportedScheduleTasks } from "../commitImportedTasks";

const qc = {} as any;
const source = { kind: "csv" as const, fileName: "GC Master Schedule.csv" };

function task(partial: Partial<ParsedMppTask> & Pick<ParsedMppTask, "uid" | "name">): ParsedMppTask {
  return {
    start: "2026-03-01",
    finish: "2026-03-05",
    pct: 0,
    preds: [],
    isSummary: false,
    outlineLevel: 1,
    outlineNumber: "",
    milestone: false,
    durationDays: 4,
    resources: [],
    notes: "",
    sourceUid: partial.uid,
    ...partial,
  };
}

describe("commitImportedScheduleTasks", () => {
  beforeEach(() => {
    create.mockReset();
    update.mockReset();
    filterAll.mockReset();
    invalidateEntity.mockReset();
    filterAll.mockResolvedValue([]);
    create.mockImplementation(async (payload: { task_name: string }) => ({
      id: `db-${payload.task_name}`,
    }));
    update.mockResolvedValue({});
  });

  it("creates tasks then writes predecessor links using the new db ids", async () => {
    const tasks: ParsedMppTask[] = [
      task({
        uid: "1",
        name: "Fabrication",
        isSummary: true,
        outlineLevel: 1,
        outlineNumber: "1",
        phaseHint: "Fabrication",
      }),
      task({
        uid: "2",
        name: "Weld beams",
        outlineLevel: 2,
        outlineNumber: "1.1",
        phaseHint: "Fabrication",
        preds: [{ predUid: "1", linkType: "1", lagDuration: "4800" }],
        resources: ["Shop crew"],
      }),
    ];

    const result = await commitImportedScheduleTasks({
      tasks,
      projectId: "proj-1",
      qc,
      source,
    });

    expect(result.created).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toMatchObject({
      task_name: "Fabrication",
      phase: "Fabrication",
      is_summary: true,
      parent_task_id: null,
      project_id: "proj-1",
    });
    expect(create.mock.calls[1][0]).toMatchObject({
      task_name: "Weld beams",
      parent_task_id: "db-Fabrication",
      resource_names: "Shop crew",
    });
    expect(update).toHaveBeenCalledWith("db-Weld beams", expect.objectContaining({
      dependencies: JSON.stringify([{ id: "db-Fabrication", type: "FS", lag_days: 1 }]),
      metadata: expect.objectContaining({ schedule_import: expect.objectContaining({ links_finalized: true }) }),
    }));
    expect(invalidateEntity).toHaveBeenCalledWith(qc, "schedule_task", "proj-1");
  });

  it("fills missing WBS codes when generateMissingWbs is on", async () => {
    await commitImportedScheduleTasks({
      tasks: [task({ uid: "1", name: "Weld", phaseHint: "Detailing", outlineNumber: "" })],
      projectId: "proj-1",
      qc,
      source,
      generateMissingWbs: true,
    });
    expect(create.mock.calls[0][0].wbs_code).toMatch(/^2\./);
  });

  it("keeps a start-only task's finish and duration unknown", async () => {
    await commitImportedScheduleTasks({
      tasks: [task({
        uid: "1",
        name: "Detail connections",
        start: "2026-03-01",
        finish: null,
        durationDays: null,
        pct: 40,
      })],
      projectId: "proj-1",
      qc,
      source,
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      task_name: "Detail connections",
      start_date: "2026-03-01",
      end_date: null,
      duration: null,
      status: "In Progress",
      percent_complete: 40,
    });
  });

  it("preserves an explicitly imported duration without inventing a finish", async () => {
    await commitImportedScheduleTasks({
      tasks: [task({
        uid: "1",
        name: "Erect bay one",
        start: "2026-03-01",
        finish: null,
        durationDays: 5,
      })],
      projectId: "proj-1",
      qc,
      source,
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      start_date: "2026-03-01",
      end_date: null,
      duration: 5,
      status: "Not Started",
      percent_complete: 0,
    });
  });

  it("rejects inverted date windows before writing", async () => {
    await expect(commitImportedScheduleTasks({
      tasks: [task({ uid: "1", name: "Bad", start: "2026-03-10", finish: "2026-03-01" })],
      projectId: "proj-1",
      qc,
      source,
    })).rejects.toThrow(/finish date/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("skips an exact re-import without changing a field-edited task", async () => {
    const imported = task({ uid: "A1000", name: "Erect sequence A", outlineNumber: "1.1", phaseHint: "Erection" });
    await commitImportedScheduleTasks({ tasks: [imported], projectId: "proj-1", qc, source });
    const firstPayload = create.mock.calls[0][0];
    filterAll.mockResolvedValue([{ ...firstPayload, id: "db-Erect sequence A", status: "In Progress", percent_complete: 50 }]);
    create.mockClear();
    update.mockClear();

    const result = await commitImportedScheduleTasks({ tasks: [imported], projectId: "proj-1", qc, source });

    expect(result).toMatchObject({ created: 0, skipped: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("blocks a changed source row before creating any new task", async () => {
    const original = task({ uid: "A1000", name: "Erect sequence A", outlineNumber: "1.1", phaseHint: "Erection" });
    await commitImportedScheduleTasks({ tasks: [original], projectId: "proj-1", qc, source });
    filterAll.mockResolvedValue([{ ...create.mock.calls[0][0], id: "db-Erect sequence A" }]);
    create.mockClear();

    await expect(commitImportedScheduleTasks({
      tasks: [task({ ...original, start: "2026-04-01", finish: "2026-04-05" }), task({ uid: "A2000", name: "New bay" })],
      projectId: "proj-1", qc, source,
    })).rejects.toThrow(/changed.*review/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("resumes a partial import and finalizes predecessor links only once", async () => {
    const rows = [
      task({ uid: "A1000", name: "Fabricate columns", outlineNumber: "1.1", phaseHint: "Fabrication" }),
      task({ uid: "A2000", name: "Erect columns", outlineNumber: "2.1", phaseHint: "Erection", preds: [{ predUid: "A1000", linkType: "1", lagDuration: "0" }] }),
    ];
    create.mockImplementationOnce(async (payload: { task_name: string }) => ({ id: `db-${payload.task_name}` }));
    create.mockRejectedValueOnce(new Error("network interrupted"));
    await expect(commitImportedScheduleTasks({ tasks: rows, projectId: "proj-1", qc, source })).rejects.toThrow(/network interrupted/);
    const firstPayload = create.mock.calls[0][0];
    filterAll.mockResolvedValue([{ ...firstPayload, id: "db-Fabricate columns" }]);
    create.mockClear();
    create.mockImplementation(async (payload: { task_name: string }) => ({ id: `db-${payload.task_name}` }));

    const resumed = await commitImportedScheduleTasks({ tasks: rows, projectId: "proj-1", qc, source });

    expect(resumed).toMatchObject({ created: 1, skipped: 1 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("db-Erect columns", expect.objectContaining({
      dependencies: JSON.stringify([{ id: "db-Fabricate columns", type: "FS", lag_days: 0 }]),
      metadata: expect.objectContaining({ schedule_import: expect.objectContaining({ links_finalized: true }) }),
    }));
  });

  it("reports a failed predecessor write and retries only the unfinished link", async () => {
    const rows = [
      task({ uid: "A1000", name: "Fabricate columns", outlineNumber: "1.1" }),
      task({ uid: "A2000", name: "Erect columns", outlineNumber: "2.1", preds: [{ predUid: "A1000", linkType: "1", lagDuration: "0" }] }),
    ];
    update.mockRejectedValueOnce(new Error("link write failed"));
    await expect(commitImportedScheduleTasks({ tasks: rows, projectId: "proj-1", qc, source })).rejects.toThrow(/predecessor link update.*failed/i);
    const persisted = create.mock.calls.map(([payload]: [Record<string, unknown>]) => ({
      ...payload, id: `db-${payload.task_name}`,
    }));
    filterAll.mockResolvedValue(persisted);
    create.mockClear();
    update.mockClear();
    update.mockResolvedValue({});

    const retry = await commitImportedScheduleTasks({ tasks: rows, projectId: "proj-1", qc, source });
    expect(retry).toMatchObject({ created: 0, skipped: 2 });
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][1].metadata.schedule_import.links_finalized).toBe(true);
  });

  it("rejects a legacy WBS collision rather than duplicating a previously imported schedule", async () => {
    filterAll.mockResolvedValue([{ id: "legacy-1", project_id: "proj-1", task_name: "Fabricate columns", wbs_code: "1.1" }]);

    await expect(commitImportedScheduleTasks({
      tasks: [task({ uid: "A1000", name: "Fabricate columns", outlineNumber: "1.1" })],
      projectId: "proj-1", qc, source,
    })).rejects.toThrow(/WBS.*review/i);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("detects duplicate provenance left by concurrent clients and blocks a further import", async () => {
    const imported = task({ uid: "A1000", name: "Set steel", outlineNumber: "1.1" });
    await commitImportedScheduleTasks({ tasks: [imported], projectId: "proj-1", qc, source });
    const payload = create.mock.calls[0][0];
    filterAll.mockResolvedValue([
      { ...payload, id: "concurrent-1" },
      { ...payload, id: "concurrent-2" },
    ]);
    create.mockClear();

    await expect(commitImportedScheduleTasks({ tasks: [imported], projectId: "proj-1", qc, source }))
      .rejects.toThrow(/multiple existing tasks.*Activity ID/i);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("fails closed when the complete project read fails", async () => {
    filterAll.mockRejectedValue(new Error("project read failed"));
    await expect(commitImportedScheduleTasks({
      tasks: [task({ uid: "A1000", name: "Fabricate columns" })], projectId: "proj-1", qc, source,
    })).rejects.toThrow(/project read failed/);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a read containing another project's task before any writes", async () => {
    filterAll.mockResolvedValue([{ id: "other-task", project_id: "proj-other", task_name: "Set steel" }]);
    await expect(commitImportedScheduleTasks({
      tasks: [task({ uid: "A1000", name: "Set steel" })], projectId: "proj-1", qc, source,
    })).rejects.toThrow(/outside the selected project/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps an unknown phase unassigned and does not invent a fabrication WBS", async () => {
    await commitImportedScheduleTasks({
      tasks: [task({ uid: "A1000", name: "Area 5 steel", phaseHint: null, outlineNumber: "" })],
      projectId: "proj-1", qc, source, generateMissingWbs: true,
    });
    expect(create.mock.calls[0][0]).toMatchObject({ phase: null, wbs_code: null });
  });

  it("preserves the canonical Erection phase for field steel work", async () => {
    await commitImportedScheduleTasks({
      tasks: [task({ uid: "A1000", name: "Set bay one", phaseHint: "Erection" })],
      projectId: "proj-1", qc, source,
    });
    expect(create.mock.calls[0][0].phase).toBe("Erection");
  });

  it("rejects duplicate source UIDs before any writes", async () => {
    await expect(commitImportedScheduleTasks({
      tasks: [task({ uid: "A1000", name: "Bay one" }), task({ uid: "A1000", name: "Bay two" })],
      projectId: "proj-1", qc, source,
    })).rejects.toThrow(/duplicate.*UID/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects unresolved CSV predecessor references before writing a misleading schedule", async () => {
    await expect(commitImportedScheduleTasks({
      tasks: [task({ uid: "A1000", name: "Erect bay", unresolvedPredecessors: ["MISSING"] })],
      projectId: "proj-1", qc, source,
    })).rejects.toThrow(/MISSING.*predecessor|predecessor.*MISSING/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("treats the same UID in a different named source as a distinct task", async () => {
    const previous = task({ uid: "A1000", name: "GC shop sequence", outlineNumber: "1.1" });
    await commitImportedScheduleTasks({ tasks: [previous], projectId: "proj-1", qc, source });
    const previousPayload = create.mock.calls[0][0];
    filterAll.mockResolvedValue([{ ...previousPayload, id: "gc-task" }]);
    create.mockClear();

    const result = await commitImportedScheduleTasks({
      tasks: [task({ uid: "A1000", name: "Internal erection lookahead", outlineNumber: "3.1" })],
      projectId: "proj-1", qc, source: { kind: "csv", fileName: "Erection lookahead.csv" },
    });

    expect(result).toMatchObject({ created: 1, skipped: 0 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].metadata.schedule_import.source_key).not.toBe(
      previousPayload.metadata.schedule_import.source_key,
    );
  });

  it("requires a CSV Activity ID instead of treating row order or WBS as a durable identity", async () => {
    await expect(commitImportedScheduleTasks({
      tasks: [task({ uid: "1.1", sourceUid: null, name: "Bolt up bay", outlineNumber: "1.1" })],
      projectId: "proj-1", qc, source,
    })).rejects.toThrow(/Activity ID.*required/i);
    expect(create).not.toHaveBeenCalled();
  });
});
