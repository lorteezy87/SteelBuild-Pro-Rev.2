import { describe, expect, it, vi } from "vitest";
import { persistCostCode } from "../costCodeSave";

describe("persistCostCode", () => {
  it("awaits create and keeps the rejection visible to the caller", async () => {
    const error = new Error("write rejected");
    const create = { mutateAsync: vi.fn().mockRejectedValue(error) };
    const update = { mutateAsync: vi.fn() };

    await expect(persistCostCode({
      editingId: null,
      data: { budget_amount: 1250 },
      projectId: "p-1",
      createMutation: create,
      updateMutation: update,
    })).rejects.toBe(error);

    expect(create.mutateAsync).toHaveBeenCalledWith({
      budget_amount: 1250,
      project_id: "p-1",
    });
    expect(update.mutateAsync).not.toHaveBeenCalled();
  });

  it("awaits update with the record id", async () => {
    const create = { mutateAsync: vi.fn() };
    const update = { mutateAsync: vi.fn().mockResolvedValue({ id: "cc-1" }) };

    await persistCostCode({
      editingId: "cc-1",
      data: { notes: "revised" },
      projectId: "p-1",
      createMutation: create,
      updateMutation: update,
    });

    expect(update.mutateAsync).toHaveBeenCalledWith({ id: "cc-1", notes: "revised" });
    expect(create.mutateAsync).not.toHaveBeenCalled();
  });

  it("rejects when projectId is missing before any mutation", async () => {
    const create = { mutateAsync: vi.fn() };
    const update = { mutateAsync: vi.fn() };

    await expect(persistCostCode({
      editingId: null,
      data: { budget_amount: 1 },
      projectId: null,
      createMutation: create,
      updateMutation: update,
    })).rejects.toThrow(/Select a project first/);

    expect(create.mutateAsync).not.toHaveBeenCalled();
    expect(update.mutateAsync).not.toHaveBeenCalled();
  });
});
