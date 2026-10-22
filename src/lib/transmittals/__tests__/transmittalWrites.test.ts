import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  create: vi.fn(async (row: Record<string, unknown>) => ({ id: "t1", ...row })),
  update: vi.fn(async () => ({})),
  itemCreate: vi.fn(async () => ({})),
  itemDelete: vi.fn(async () => ({})),
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DrawingTransmittal: { create: m.create, update: m.update },
    DrawingTransmittalItem: { create: m.itemCreate, delete: m.itemDelete },
  },
}));

import {
  createTransmittal,
  recordTransmittalAcknowledgement,
  resolveTransmittalTargets,
  softDeleteTransmittal,
  updateTransmittal,
} from "../transmittalWrites";

const header = { transmittal_number: "T-1", direction: "outgoing" as const };

beforeEach(() => vi.clearAllMocks());

describe("transmittalWrites", () => {
  it("refuses a target it cannot tie to a drawing before anything is written", () => {
    expect(() => resolveTransmittalTargets(["rev-a", "rev-b"], (r) => (r === "rev-a" ? "d1" : null))).toThrow(/rev-b/);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("writes the header, then one item per target carrying drawing_id", async () => {
    await createTransmittal("p1", header, [{ revisionId: "rev-a", drawingId: "d1" }]);
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ transmittal_number: "T-1", project_id: "p1" }));
    expect(m.itemCreate).toHaveBeenCalledWith({
      transmittal_id: "t1",
      drawing_revision_id: "rev-a",
      drawing_id: "d1",
      project_id: "p1",
    });
  });

  it("requires a transmittal number", async () => {
    await expect(createTransmittal("p1", { ...header, transmittal_number: "  " }, [])).rejects.toThrow(/number/);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("reconciles items on edit and never removes an item that has no revision", async () => {
    await updateTransmittal(
      "p1",
      {
        id: "t1",
        items: [
          { id: "keep", drawing_revision_id: "rev-a" },
          { id: "drop", drawing_revision_id: "rev-b" },
          { id: "unpickable", drawing_revision_id: null },
        ],
      },
      header,
      new Set(["rev-a", "rev-c"]),
      () => "d9",
    );
    expect(m.itemDelete).toHaveBeenCalledTimes(1);
    expect(m.itemDelete).toHaveBeenCalledWith("drop");
    expect(m.itemCreate).toHaveBeenCalledTimes(1);
    expect(m.itemCreate).toHaveBeenCalledWith(expect.objectContaining({ drawing_revision_id: "rev-c", drawing_id: "d9" }));
  });

  it("deletes softly", async () => {
    await softDeleteTransmittal("t1");
    expect(m.update).toHaveBeenCalledWith("t1", { is_deleted: true });
  });

  it("will not record an acknowledgement nobody can be named for", async () => {
    await expect(recordTransmittalAcknowledgement("t1", { by: " ", at: "2026-10-20T12:00:00Z" })).rejects.toThrow();
    await expect(recordTransmittalAcknowledgement("t1", { by: "R. Vega", at: "not a date" })).rejects.toThrow();
    expect(m.update).not.toHaveBeenCalled();
    await recordTransmittalAcknowledgement("t1", { by: " R. Vega ", at: "2026-10-20T12:00:00Z", notes: "" });
    expect(m.update).toHaveBeenCalledWith("t1", {
      acknowledged_at: "2026-10-20T12:00:00Z",
      acknowledged_by_name: "R. Vega",
      acknowledged_notes: null,
    });
  });
});
