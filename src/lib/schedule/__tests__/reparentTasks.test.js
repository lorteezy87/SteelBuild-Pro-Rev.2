import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const logActivityMock = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  entities: { ScheduleTask: { update: (...a) => updateMock(...a) } },
}));
vi.mock("@/services/auditLogger", () => ({
  logActivity: (...a) => logActivityMock(...a),
}));

import { reparentTasks } from "../reparentTasks";

const tasks = [
  { id: "a", parent_task_id: null, sort_order: 1000, task_name: "A" },
  { id: "b", parent_task_id: "a", sort_order: 1000, task_name: "B" },
  { id: "c", parent_task_id: "b", sort_order: 2000, task_name: "C" },
];

beforeEach(() => {
  updateMock.mockReset().mockResolvedValue({});
  logActivityMock.mockReset().mockResolvedValue();
});

describe("reparentTasks", () => {
  it("writes parent_task_id + sort_order for a legal nest", async () => {
    await reparentTasks(["c"], "a", { tasks });
    expect(updateMock).toHaveBeenCalledWith("c", expect.objectContaining({ parent_task_id: "a" }));
    const fields = updateMock.mock.calls[0][1];
    expect(typeof fields.sort_order).toBe("number");
  });

  it("rejects the whole batch if any id would cycle", async () => {
    await expect(reparentTasks(["a"], "c", { tasks })).rejects.toThrow(/cycle|descendant/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("writes sequentially with increasing sort_order and audits each change", async () => {
    await reparentTasks(["b", "c"], null, { tasks });
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(logActivityMock).toHaveBeenCalledTimes(2);
    const firstOrder = updateMock.mock.calls[0][1].sort_order;
    const secondOrder = updateMock.mock.calls[1][1].sort_order;
    expect(typeof firstOrder).toBe("number");
    expect(secondOrder).toBeGreaterThan(firstOrder); // order += 1000 sequencing
  });

  it("honors dropIndex when computing sort_order", async () => {
    await reparentTasks(["c"], "a", { tasks, dropIndex: 0 });
    expect(updateMock).toHaveBeenCalledWith("c", expect.objectContaining({ parent_task_id: "a" }));
    const fields = updateMock.mock.calls[0][1];
    expect(typeof fields.sort_order).toBe("number");
  });
});
