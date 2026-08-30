import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMppTask } from "../types";

const create = vi.fn();
const update = vi.fn();
const invalidateEntity = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    ScheduleTask: {
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

vi.mock("@/services/cacheRegistry", () => ({
  invalidateEntity: (...args: unknown[]) => invalidateEntity(...args),
}));

import { commitImportedScheduleTasks } from "../commitImportedTasks";

const qc = {} as any;

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
    ...partial,
  };
}

describe("commitImportedScheduleTasks", () => {
  beforeEach(() => {
    create.mockReset();
    update.mockReset();
    invalidateEntity.mockReset();
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
    expect(update).toHaveBeenCalledWith("db-Weld beams", {
      dependencies: JSON.stringify([{ id: "db-Fabrication", type: "FS", lag_days: 1 }]),
    });
    expect(invalidateEntity).toHaveBeenCalledWith(qc, "schedule_task", "proj-1");
  });

  it("fills missing WBS codes when generateMissingWbs is on", async () => {
    await commitImportedScheduleTasks({
      tasks: [task({ uid: "1", name: "Weld", phaseHint: "Detailing", outlineNumber: "" })],
      projectId: "proj-1",
      qc,
      generateMissingWbs: true,
    });
    expect(create.mock.calls[0][0].wbs_code).toMatch(/^2\./);
  });

  it("rejects inverted date windows before writing", async () => {
    await expect(commitImportedScheduleTasks({
      tasks: [task({ uid: "1", name: "Bad", start: "2026-03-10", finish: "2026-03-01" })],
      projectId: "proj-1",
      qc,
    })).rejects.toThrow(/finish date/i);
    expect(create).not.toHaveBeenCalled();
  });
});
