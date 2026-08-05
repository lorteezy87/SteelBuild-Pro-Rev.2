import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the data layer so we exercise the real reconciliation logic (group →
// upsert set container + per-drawing tasks, adopt legacy submittal tasks, delete
// orphans) without a database. vi.hoisted keeps the spies usable in the factory.
const m = vi.hoisted(() => ({
  filter: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    ScheduleTask: {
      filter: m.filter,
      create: m.create,
      update: m.update,
      delete: m.del,
    },
  },
}));

import { syncDrawingScheduleTasks } from "../syncDrawingScheduleTasks";

const setCreatePayloads = () => m.create.mock.calls.map((c) => c[0]).filter((p) => p.linked_entity_type === "DrawingSet");
const drawingCreatePayloads = () => m.create.mock.calls.map((c) => c[0]).filter((p) => p.linked_entity_type === "Drawing");

beforeEach(() => {
  m.filter.mockReset();
  m.create.mockReset();
  m.update.mockReset();
  m.del.mockReset();
  let n = 0;
  m.create.mockImplementation(async (payload) => ({ id: `new-${++n}`, ...payload }));
  m.update.mockImplementation(async (id, payload) => ({ id, ...payload }));
  m.del.mockResolvedValue(undefined);
});

describe("syncDrawingScheduleTasks", () => {
  it("no-ops without a projectId (no DB calls)", async () => {
    const r = await syncDrawingScheduleTasks({ drawings: [{ id: "d1" }] });
    expect(r).toEqual({ created: 0, updated: 0, deleted: 0 });
    expect(m.filter).not.toHaveBeenCalled();
  });

  it("creates one set container + one task per drawing on a fresh project", async () => {
    m.filter.mockResolvedValue([]);
    const drawings = [
      { id: "d1", sheet_number: "S1.1", title: "Cols", drawing_set_name: "Main Steel", stage: "IFA", due_date: "2026-06-20" },
      { id: "d2", sheet_number: "S1.2", title: "Beams", drawing_set_name: "Main Steel", stage: "IFA", due_date: "2026-06-22" },
    ];
    const r = await syncDrawingScheduleTasks({ projectId: "p1", projectName: "Proj", drawings });

    expect(r).toEqual({ created: 3, updated: 0, deleted: 0 }); // 1 set + 2 drawings
    // set container is created before its children, and children link to it
    const firstCreate = m.create.mock.calls[0][0];
    expect(firstCreate.linked_entity_type).toBe("DrawingSet");
    expect(firstCreate.task_name).toBe("Main Steel");
    expect(drawingCreatePayloads().every((p) => p.parent_task_id === "new-1")).toBe(true);
  });

  it("ignores superseded drawings", async () => {
    m.filter.mockResolvedValue([]);
    const drawings = [
      { id: "d1", drawing_set_name: "Set A", stage: "IFA" },
      { id: "d2", drawing_set_name: "Set A", stage: "IFA", is_superseded: true },
    ];
    const r = await syncDrawingScheduleTasks({ projectId: "p1", drawings });
    expect(r.created).toBe(2); // 1 set + 1 active drawing (superseded d2 excluded)
    expect(drawingCreatePayloads()).toHaveLength(1);
  });

  it("updates a task when its linked drawing changed (Released → Complete @ 100%)", async () => {
    const existingSet = { id: "t-set", linked_entity_type: "DrawingSet", linked_entity_id: "Set A" };
    const existingChild = {
      id: "t-d1", linked_entity_type: "Drawing", linked_entity_id: "d1",
      status: "Not Started", percent_complete: 0,
    };
    m.filter.mockResolvedValue([existingSet, existingChild]);
    const drawings = [{ id: "d1", drawing_set_name: "Set A", stage: "Released", sheet_number: "S1", title: "X" }];

    const r = await syncDrawingScheduleTasks({ projectId: "p1", drawings });

    expect(m.create).not.toHaveBeenCalled(); // both matched existing
    expect(r.created).toBe(0);
    const childUpdate = m.update.mock.calls.find((c) => c[1].linked_entity_id === "d1")[1];
    expect(childUpdate.status).toBe("Complete");
    expect(childUpdate.percent_complete).toBe(100);
  });

  it("deletes tasks whose drawing/set no longer exists", async () => {
    m.filter.mockResolvedValue([
      { id: "t-orphan", linked_entity_type: "Drawing", linked_entity_id: "gone" },
      { id: "t-set-orphan", linked_entity_type: "DrawingSet", linked_entity_id: "Gone Set" },
    ]);
    const r = await syncDrawingScheduleTasks({ projectId: "p1", drawings: [] });
    expect(r.deleted).toBe(2);
    expect(m.del).toHaveBeenCalledWith("t-orphan");
    expect(m.del).toHaveBeenCalledWith("t-set-orphan");
  });

  it("adopts a legacy submittal task by name instead of creating a duplicate set", async () => {
    const legacy = { id: "t-legacy", task_type: "Submittal", task_name: "Main Steel" }; // no linked_entity_type
    m.filter.mockResolvedValue([legacy]);
    const drawings = [{ id: "d1", drawing_set_name: "Main Steel", stage: "IFA", sheet_number: "S1", title: "X" }];

    await syncDrawingScheduleTasks({ projectId: "p1", drawings });

    expect(m.update).toHaveBeenCalledWith("t-legacy", expect.objectContaining({ linked_entity_type: "DrawingSet", task_name: "Main Steel" }));
    expect(setCreatePayloads()).toHaveLength(0); // adopted, not recreated
    expect(drawingCreatePayloads()).toHaveLength(1); // the child is still new
  });

  it("rolls up a partially-released set to In Progress @ 50%", async () => {
    m.filter.mockResolvedValue([]);
    const drawings = [
      { id: "d1", drawing_set_name: "S", stage: "Released" },
      { id: "d2", drawing_set_name: "S", stage: "IFA" },
    ];
    await syncDrawingScheduleTasks({ projectId: "p1", drawings });
    const set = setCreatePayloads()[0];
    expect(set.status).toBe("In Progress");
    expect(set.percent_complete).toBe(50);
  });

  it("marks a fully-released set Complete @ 100%", async () => {
    m.filter.mockResolvedValue([]);
    const drawings = [
      { id: "d1", drawing_set_name: "S", stage: "Released" },
      { id: "d2", drawing_set_name: "S", stage: "Released" },
    ];
    await syncDrawingScheduleTasks({ projectId: "p1", drawings });
    const set = setCreatePayloads()[0];
    expect(set.status).toBe("Complete");
    expect(set.percent_complete).toBe(100);
  });

  it("names an unnamed set 'Ungrouped Drawings' and spans the full date range", async () => {
    m.filter.mockResolvedValue([]);
    const drawings = [
      { id: "d1", stage: "IFA", submitted_date: "2026-06-01T09:00:00Z", due_date: "2026-06-10" },
      { id: "d2", stage: "IFA", submitted_date: "2026-06-05", due_date: "2026-06-20" },
    ];
    await syncDrawingScheduleTasks({ projectId: "p1", drawings });
    const set = setCreatePayloads()[0];
    expect(set.task_name).toBe("Ungrouped Drawings");
    expect(set.start_date).toBe("2026-06-01"); // earliest, T-suffix stripped
    expect(set.end_date).toBe("2026-06-20"); // latest
  });
});
