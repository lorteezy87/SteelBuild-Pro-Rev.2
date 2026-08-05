import { beforeEach, describe, expect, it, vi } from "vitest";

const filterMock = vi.fn();
const createMock = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    ActionItem: {
      filter: (...args) => filterMock(...args),
      create: (...args) => createMock(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import {
  computeStatusTrigger,
  buildTriggerKey,
  runSubmittalStatusTriggers,
} from "../submittalSmartTriggers";

const SUBMITTAL = {
  id: "sub-1",
  project_id: "proj-1",
  project_name: "Job 24001",
  submittal_number: "SUB-004",
  title: "Anchor Bolts",
  spec_section: "05 12 00",
  drawing_set_ids: ["set-1", "set-2"],
  total_rounds: 3,
};

beforeEach(() => {
  filterMock.mockReset().mockResolvedValue([]);
  createMock.mockReset().mockImplementation(async (data) => ({ id: "ai-1", ...data }));
});

describe("computeStatusTrigger", () => {
  it("queues a high-priority resubmit task on Rejected and R&R", () => {
    expect(computeStatusTrigger("Submitted", "Rejected")).toMatchObject({
      kind: "resubmit", priority: "High",
    });
    expect(computeStatusTrigger("Under Review", "Revise and Resubmit")).toMatchObject({
      kind: "resubmit",
    });
  });

  it("queues a notes-incorporation task on Approved as Noted", () => {
    expect(computeStatusTrigger("Submitted", "Approved as Noted")).toMatchObject({
      kind: "incorporate-notes", priority: "Medium",
    });
  });

  it("does nothing for non-triggering statuses or no-op transitions", () => {
    expect(computeStatusTrigger("Draft", "Submitted")).toBeNull();
    expect(computeStatusTrigger("Submitted", "Approved")).toBeNull();
    expect(computeStatusTrigger("Rejected", "Rejected")).toBeNull();
    expect(computeStatusTrigger("Submitted", null)).toBeNull();
  });
});

describe("buildTriggerKey", () => {
  it("is stable per (submittal, kind, round)", () => {
    const trigger = computeStatusTrigger("Submitted", "Rejected");
    expect(buildTriggerKey(SUBMITTAL, trigger)).toBe("submittal:sub-1:resubmit:r3");
    expect(buildTriggerKey({ ...SUBMITTAL, total_rounds: null }, trigger)).toBe(
      "submittal:sub-1:resubmit:r0",
    );
  });
});

describe("runSubmittalStatusTriggers", () => {
  it("creates an open detailing task on a move into R&R", async () => {
    const created = await runSubmittalStatusTriggers({
      submittal: SUBMITTAL,
      prevStatus: "Submitted",
      nextStatus: "Revise and Resubmit",
    });
    expect(created).not.toBeNull();
    expect(createMock).toHaveBeenCalledTimes(1);
    const payload = createMock.mock.calls[0][0];
    expect(payload.project_id).toBe("proj-1");
    expect(payload.status).toBe("Open");
    expect(payload.priority).toBe("High");
    expect(payload.title).toContain("SUB-004");
    expect(payload.assigned_to).toBe("Detailer");
    expect(payload.metadata.trigger_key).toBe("submittal:sub-1:resubmit:r3");
    expect(payload.metadata.source).toBe("submittal-status-trigger");
    expect(payload.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("dedupes when an open task already carries the trigger key", async () => {
    filterMock.mockResolvedValue([
      { id: "ai-existing", metadata: { trigger_key: "submittal:sub-1:resubmit:r3" } },
    ]);
    const created = await runSubmittalStatusTriggers({
      submittal: SUBMITTAL,
      prevStatus: "Submitted",
      nextStatus: "Rejected",
    });
    expect(created).toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns null without touching the API on non-triggering moves", async () => {
    const created = await runSubmittalStatusTriggers({
      submittal: SUBMITTAL,
      prevStatus: "Draft",
      nextStatus: "Submitted",
    });
    expect(created).toBeNull();
    expect(filterMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("never throws when the API fails — the status write must win", async () => {
    filterMock.mockRejectedValue(new Error("RLS denied"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      runSubmittalStatusTriggers({
        submittal: SUBMITTAL,
        prevStatus: "Submitted",
        nextStatus: "Rejected",
      }),
    ).resolves.toBeNull();
    warn.mockRestore();
  });
});
