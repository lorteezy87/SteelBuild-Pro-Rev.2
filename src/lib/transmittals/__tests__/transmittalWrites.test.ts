import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  create: vi.fn(async (row: Record<string, unknown>) => ({ id: "t1", ...row })),
  update: vi.fn(async () => ({})),
  itemCreate: vi.fn(async () => ({})),
  itemDelete: vi.fn(async () => ({})),
  rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => ({
    data: { id: (args.p_transmittal_id as string | undefined) ?? "t-new", transmittal_number: "T-007", status: fn },
    error: null as { message: string } | null,
  })),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: m.rpc } }));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DrawingTransmittal: { create: m.create, update: m.update },
    DrawingTransmittalItem: { create: m.itemCreate, delete: m.itemDelete },
  },
}));

import {
  acknowledgeTransmittal,
  acknowledgementInstant,
  createAndSendTransmittal,
  createTransmittal,
  voidTransmittal,
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

  describe("lifecycle RPCs", () => {
    const issue = {
      subject: "Stair ST-1",
      sentTo: "R. Vega",
      drawingIds: ["d2", "d2", "d3"],
      sentDate: "2026-10-22",
    };

    it("creates a sequence-numbered draft, then sends it on the picked calendar date", async () => {
      const sent = await createAndSendTransmittal("p1", issue);
      expect(m.rpc).toHaveBeenNthCalledWith(1, "create_transmittal", {
        p_project_id: "p1",
        p_payload: expect.objectContaining({
          direction: "outgoing",
          subject: "Stair ST-1",
          sent_to: "R. Vega",
          // De-duplicated: one item per drawing.
          item_refs: ["shop:d2", "shop:d3"],
        }),
      });
      expect(m.rpc).toHaveBeenNthCalledWith(2, "send_transmittal", { p_transmittal_id: "t-new", p_sent_date: "2026-10-22" });
      expect(sent.status).toBe("send_transmittal");
      // No client-side number and no direct table write.
      expect(JSON.stringify(m.rpc.mock.calls[0])).not.toContain("transmittal_number");
      expect(m.create).not.toHaveBeenCalled();
    });

    it("refuses what send_transmittal would refuse before creating anything", async () => {
      await expect(createAndSendTransmittal("p1", { ...issue, sentTo: " " })).rejects.toThrow(/goes to/);
      await expect(createAndSendTransmittal("p1", { ...issue, drawingIds: [] })).rejects.toThrow(/at least one/);
      await expect(createAndSendTransmittal("p1", { ...issue, subject: "" })).rejects.toThrow(/subject/);
      await expect(createAndSendTransmittal("p1", { ...issue, sentDate: "22/10/2026" })).rejects.toThrow(/date/);
      expect(m.rpc).not.toHaveBeenCalled();
    });

    it("voids the draft when the send fails, so no invisible unsent record is left", async () => {
      // One call each, so later tests keep the default behaviour: the create
      // succeeds, the send fails, and the void falls back to the default.
      m.rpc
        .mockImplementationOnce(async () => ({ data: { id: "t-new", transmittal_number: "T-007", status: "draft" }, error: null }))
        .mockImplementationOnce(async () => ({ data: null as never, error: { message: "Add at least one drawing before sending" } }));
      await expect(createAndSendTransmittal("p1", issue)).rejects.toThrow(/Not sent: Add at least one drawing.*T-007 was voided/);
      expect(m.rpc).toHaveBeenLastCalledWith("void_transmittal", {
        p_transmittal_id: "t-new",
        p_reason: "Send failed: Add at least one drawing before sending",
      });
    });

    it("acknowledges with a name, on the picked day in every zone", async () => {
      await expect(acknowledgeTransmittal("t1", { by: " ", date: "2026-10-22" })).rejects.toThrow(/who acknowledged/);
      expect(m.rpc).not.toHaveBeenCalled();
      await acknowledgeTransmittal("t1", { by: " R. Vega ", date: "2026-10-22", notes: "" });
      expect(m.rpc).toHaveBeenCalledWith("acknowledge_transmittal", {
        p_transmittal_id: "t1",
        p_by_name: "R. Vega",
        p_notes: null,
        p_at: "2026-10-22T12:00:00Z",
      });
      // UTC noon reads back as the same calendar day; local noon in UTC+14 did not.
      expect(acknowledgementInstant("2026-10-22").slice(0, 10)).toBe("2026-10-22");
      expect(() => acknowledgementInstant("not a date")).toThrow();
    });

    it("voids only with a reason", async () => {
      await expect(voidTransmittal("t1", "  ")).rejects.toThrow(/reason/);
      expect(m.rpc).not.toHaveBeenCalled();
      await voidTransmittal("t1", " Wrong crew ");
      expect(m.rpc).toHaveBeenCalledWith("void_transmittal", { p_transmittal_id: "t1", p_reason: "Wrong crew" });
    });
  });
});
