/**
 * Tests for the lock-on-approval trigger that fires from useSubmittals.
 *
 * The trigger lives in `lockLinkedSetsIfApproved` and is the single
 * post-Sprint-1 path that locks drawing sets — submittals are workflow
 * source of truth, so when a submittal reaches a terminal-approved
 * status we must lock every set it links to.
 *
 * We mock `@/lib/drawingHub` so the test stays isolated from supabase.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/drawingHub", () => ({
  lockSet: vi.fn(async () => ({ id: "set-1", is_locked: true })),
}));

import { lockSet } from "@/lib/drawingHub";
import {
  lockLinkedSetsIfApproved,
  TERMINAL_APPROVED_STATUSES,
} from "../useSubmittals";

const mockLockSet = lockSet as unknown as ReturnType<typeof vi.fn>;

describe("TERMINAL_APPROVED_STATUSES", () => {
  it("includes the three canonical approved statuses", () => {
    expect(TERMINAL_APPROVED_STATUSES.has("Approved")).toBe(true);
    expect(TERMINAL_APPROVED_STATUSES.has("Approved as Noted")).toBe(true);
    expect(TERMINAL_APPROVED_STATUSES.has("Released for Fabrication")).toBe(
      true,
    );
  });

  it("does not include in-flight or rejected statuses", () => {
    for (const s of [
      "Submitted",
      "Under Review",
      "Draft",
      "Rejected",
      "Revise and Resubmit",
      "Void",
    ]) {
      expect(TERMINAL_APPROVED_STATUSES.has(s)).toBe(false);
    }
  });
});

describe("lockLinkedSetsIfApproved", () => {
  beforeEach(() => {
    mockLockSet.mockClear();
  });

  it("calls lockSet for each drawing_set_id when status is Approved", async () => {
    await lockLinkedSetsIfApproved({
      id: "sub-1",
      submittal_number: "S-001",
      status: "Approved",
      drawing_set_ids: ["set-a", "set-b", "set-c"],
    });
    expect(mockLockSet).toHaveBeenCalledTimes(3);
    expect(mockLockSet).toHaveBeenCalledWith(
      expect.objectContaining({ setId: "set-a" }),
    );
    expect(mockLockSet).toHaveBeenCalledWith(
      expect.objectContaining({ setId: "set-b" }),
    );
    expect(mockLockSet).toHaveBeenCalledWith(
      expect.objectContaining({ setId: "set-c" }),
    );
  });

  it("calls lockSet when status is 'Approved as Noted'", async () => {
    await lockLinkedSetsIfApproved({
      id: "sub-2",
      status: "Approved as Noted",
      drawing_set_ids: ["set-a"],
    });
    expect(mockLockSet).toHaveBeenCalledTimes(1);
  });

  it("calls lockSet when status is 'Released for Fabrication'", async () => {
    await lockLinkedSetsIfApproved({
      id: "sub-3",
      status: "Released for Fabrication",
      drawing_set_ids: ["set-a", "set-b"],
    });
    expect(mockLockSet).toHaveBeenCalledTimes(2);
  });

  it("passes a reason describing the submittal + status to lockSet", async () => {
    await lockLinkedSetsIfApproved({
      id: "sub-4",
      submittal_number: "SHOP-042",
      status: "Approved",
      drawing_set_ids: ["set-a"],
    });
    const arg = mockLockSet.mock.calls[0][0];
    expect(arg.reason).toContain("SHOP-042");
    expect(arg.reason).toContain("Approved");
  });

  it("does NOT call lockSet for non-terminal statuses", async () => {
    for (const status of [
      "Submitted",
      "Under Review",
      "Draft",
      "Rejected",
      "Revise and Resubmit",
    ]) {
      mockLockSet.mockClear();
      await lockLinkedSetsIfApproved({
        id: "sub-x",
        status,
        drawing_set_ids: ["set-a"],
      });
      expect(mockLockSet).not.toHaveBeenCalled();
    }
  });

  it("handles empty drawing_set_ids gracefully", async () => {
    await lockLinkedSetsIfApproved({
      id: "sub-5",
      status: "Approved",
      drawing_set_ids: [],
    });
    expect(mockLockSet).not.toHaveBeenCalled();
  });

  it("handles missing drawing_set_ids gracefully", async () => {
    await lockLinkedSetsIfApproved({
      id: "sub-6",
      status: "Approved",
    });
    expect(mockLockSet).not.toHaveBeenCalled();
  });

  it("filters out null/empty values inside drawing_set_ids", async () => {
    await lockLinkedSetsIfApproved({
      id: "sub-7",
      status: "Approved",
      drawing_set_ids: ["set-a", null as unknown as string, "", "set-b"],
    });
    expect(mockLockSet).toHaveBeenCalledTimes(2);
  });

  it("returns silently when submittal is null/undefined", async () => {
    await expect(lockLinkedSetsIfApproved(null)).resolves.toBeUndefined();
    await expect(lockLinkedSetsIfApproved(undefined)).resolves.toBeUndefined();
    expect(mockLockSet).not.toHaveBeenCalled();
  });

  it("does not throw when lockSet throws — surfaces a console warning instead", async () => {
    mockLockSet.mockImplementationOnce(async () => {
      throw new Error("simulated lock failure");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      lockLinkedSetsIfApproved({
        id: "sub-8",
        status: "Approved",
        drawing_set_ids: ["set-a", "set-b"],
      }),
    ).resolves.toBeUndefined();
    // Both calls run — failure on one set must not block the next.
    expect(mockLockSet).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
