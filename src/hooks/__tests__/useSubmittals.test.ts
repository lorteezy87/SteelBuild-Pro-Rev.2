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

const createRound = vi.fn(async (row: any) => ({ id: "round-1", ...row }));
const updateRound = vi.fn(async (id: string, patch: any) => ({ id, ...patch }));
// The latest round for the submittal (round model = submit→return cycle).
// Default [] = no prior round; tests inject an open/closed round per case.
const filterRound = vi.fn(async (..._a: any[]) => [] as any[]);
const updateSubmittal = vi.fn(async (id: string, patch: any) => ({ id, drawing_set_ids: ["set-a"], ...patch }));
const deleteRound = vi.fn(async (_id: string) => ({}));
vi.mock("@/api/supabaseClient", () => ({
  entities: {
    SubmittalRound: {
      create: (...a: any[]) => createRound(a[0]),
      update: (...a: any[]) => updateRound(a[0], a[1]),
      filter: (...a: any[]) => filterRound(...a),
      delete: (...a: any[]) => deleteRound(a[0]),
    },
    Submittal: { update: (...a: any[]) => updateSubmittal(a[0], a[1]) },
  },
}));
// The hook imports the raw client (for the fab-release pre-check RPC); mock it so
// the test doesn't load @/lib/env (which throws without VITE_SUPABASE_* set).
const rpcMock = vi.fn(async (..._a: any[]) => ({ data: [] as any[], error: null }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: any[]) => rpcMock(...a) } }));

import { lockSet } from "@/lib/drawingHub";
import { FabReleaseBlockedError } from "@/lib/fabRelease/releaseStatus";
import {
  lockLinkedSetsIfApproved,
  addSubmittalRound,
  planRoundWrite,
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

describe("planRoundWrite (round = one submit→return cycle)", () => {
  const open = { id: "r1", round_number: 1, submitted_date: "2026-06-01", returned_date: null };
  const closed = { id: "r1", round_number: 1, submitted_date: "2026-06-01", returned_date: "2026-06-05" };

  it("opens cycle 1 on the first send (no prior round)", () => {
    expect(planRoundWrite(null, "Submitted")).toMatchObject({ action: "insert", roundNumber: 1, setSubmitted: true, setReturned: false });
  });
  it("advances the OPEN cycle in place on a sent→sent move (no new row)", () => {
    expect(planRoundWrite(open, "Under Review")).toMatchObject({ action: "update", roundId: "r1", roundNumber: 1, setReturned: false });
  });
  it("closes the OPEN cycle on a verdict (update, stamps returned)", () => {
    expect(planRoundWrite(open, "Approved")).toMatchObject({ action: "update", roundId: "r1", roundNumber: 1, setReturned: true });
  });
  it("opens the NEXT cycle on a resubmit (send on a CLOSED round)", () => {
    expect(planRoundWrite(closed, "Submitted")).toMatchObject({ action: "insert", roundNumber: 2, setSubmitted: true });
  });
  it("opens-and-closes a cycle on a verdict with no open round (defensive)", () => {
    expect(planRoundWrite(closed, "Rejected")).toMatchObject({ action: "insert", roundNumber: 2, setSubmitted: true, setReturned: true });
  });
});

describe("addSubmittalRound (round = one submit→return cycle)", () => {
  beforeEach(() => {
    mockLockSet.mockClear();
    createRound.mockClear();
    updateRound.mockClear();
    filterRound.mockClear();
    updateSubmittal.mockClear();
  });

  it("opens cycle 1 on a first send and does NOT lock (non-terminal)", async () => {
    await addSubmittalRound({
      submittal: { id: "s2", project_id: "p1", drawing_set_ids: ["set-a"] },
      status: "Submitted",
      ball_in_court: "EOR",
      submitted_date: "2026-06-01",
    });
    expect(createRound).toHaveBeenCalledWith(expect.objectContaining({ round_number: 1, status: "Submitted", submitted_date: "2026-06-01" }));
    expect(updateSubmittal).toHaveBeenCalledWith("s2", expect.objectContaining({ status: "Submitted", total_rounds: 1, current_round_id: "round-1" }));
    expect(mockLockSet).not.toHaveBeenCalled();
  });

  it("advances the OPEN round in place on a sent→sent move (updates, no new row)", async () => {
    filterRound.mockResolvedValueOnce([{ id: "r1", round_number: 1, status: "Submitted", submitted_date: "2026-06-01", returned_date: null }]);
    await addSubmittalRound({
      submittal: { id: "s1", project_id: "p1", drawing_set_ids: ["set-a"] },
      status: "Under Review",
      ball_in_court: "EOR",
    });
    expect(updateRound).toHaveBeenCalledWith("r1", expect.objectContaining({ status: "Under Review" }));
    expect(createRound).not.toHaveBeenCalled();
    expect(updateSubmittal).toHaveBeenCalledWith("s1", expect.objectContaining({ total_rounds: 1, current_round_id: "r1" }));
  });

  it("closes the OPEN round on a verdict (updates it; locks on approval — no new row)", async () => {
    filterRound.mockResolvedValueOnce([{ id: "r1", round_number: 1, status: "Under Review", submitted_date: "2026-06-01", returned_date: null }]);
    await addSubmittalRound({
      submittal: { id: "s1", project_id: "p1", drawing_set_ids: ["set-a"] },
      status: "Approved",
      ball_in_court: "GC",
      returned_date: "2026-06-10",
    });
    expect(updateRound).toHaveBeenCalledWith("r1", expect.objectContaining({ status: "Approved", returned_date: "2026-06-10" }));
    expect(createRound).not.toHaveBeenCalled();
    expect(updateSubmittal).toHaveBeenCalledWith("s1", expect.objectContaining({ status: "Approved", total_rounds: 1, current_round_id: "r1" }));
    expect(mockLockSet).toHaveBeenCalled();
  });

  it("opens the NEXT cycle on a resubmit (send on a CLOSED round)", async () => {
    filterRound.mockResolvedValueOnce([{ id: "r1", round_number: 1, status: "Revise and Resubmit", submitted_date: "2026-06-01", returned_date: "2026-06-05" }]);
    await addSubmittalRound({
      submittal: { id: "s1", project_id: "p1", drawing_set_ids: ["set-a"] },
      status: "Submitted",
      submitted_date: "2026-06-07",
    });
    expect(createRound).toHaveBeenCalledWith(expect.objectContaining({ round_number: 2, status: "Submitted" }));
    expect(updateSubmittal).toHaveBeenCalledWith("s1", expect.objectContaining({ total_rounds: 2 }));
  });

  it("opens-and-closes cycle 1 on a verdict with no prior round, and locks on approval", async () => {
    await addSubmittalRound({
      submittal: { id: "sub-1", project_id: "p1", drawing_set_ids: ["set-a"] },
      status: "Approved",
      ball_in_court: "GC",
      returned_date: "2026-06-01",
    });
    expect(createRound).toHaveBeenCalledWith(expect.objectContaining({ round_number: 1, status: "Approved", returned_date: "2026-06-01" }));
    expect(updateSubmittal).toHaveBeenCalledWith("sub-1", expect.objectContaining({ status: "Approved", total_rounds: 1, current_round_id: "round-1" }));
    expect(mockLockSet).toHaveBeenCalled();
  });

  it("bumps the submittal revision round_number only when bumpRevision is set", async () => {
    await addSubmittalRound({
      submittal: { id: "s3", project_id: "p1", round_number: 2 },
      status: "Revise and Resubmit",
      bumpRevision: true,
    });
    expect(updateSubmittal).toHaveBeenCalledWith("s3", expect.objectContaining({ round_number: 3 }));
  });
});

describe("addSubmittalRound — fab-release gate (Option C)", () => {
  beforeEach(() => {
    mockLockSet.mockClear();
    createRound.mockClear();
    updateRound.mockClear();
    filterRound.mockClear();
    updateSubmittal.mockClear();
    deleteRound.mockClear();
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it("pre-blocks a 'Released for Fabrication' move when open RFIs exist (no override) — no round logged", async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ rfi_number: "RFI-001" }, { rfi_number: "RFI-002" }], error: null });
    await expect(
      addSubmittalRound({
        submittal: { id: "s1", project_id: "p1", drawing_set_ids: ["set-a"], total_rounds: 1 },
        status: "Released for Fabrication",
      }),
    ).rejects.toBeInstanceOf(FabReleaseBlockedError);
    expect(rpcMock).toHaveBeenCalledWith("submittal_blocking_rfis", { p_submittal_id: "s1" });
    expect(createRound).not.toHaveBeenCalled(); // round never logged → no orphan
    expect(updateSubmittal).not.toHaveBeenCalled();
  });

  it("releases when an override reason is given — skips the pre-check, stamps fab_release_override_reason (trimmed)", async () => {
    await addSubmittalRound({
      submittal: { id: "s2", project_id: "p1", drawing_set_ids: ["set-a"], total_rounds: 0 },
      status: "Released for Fabrication",
      fabReleaseOverrideReason: "  accept rework risk  ",
    });
    expect(rpcMock).not.toHaveBeenCalled(); // override → no pre-check
    expect(createRound).toHaveBeenCalled();
    expect(updateSubmittal).toHaveBeenCalledWith(
      "s2",
      expect.objectContaining({ fab_release_override_reason: "accept rework risk" }),
    );
  });

  it("releases cleanly when no RFIs block — round logged, override reason null", async () => {
    await addSubmittalRound({
      submittal: { id: "s3", project_id: "p1", drawing_set_ids: ["set-a"], total_rounds: 2 },
      status: "Released for Fabrication",
    });
    expect(rpcMock).toHaveBeenCalled();
    expect(createRound).toHaveBeenCalled();
    expect(updateSubmittal).toHaveBeenCalledWith(
      "s3",
      expect.objectContaining({ status: "Released for Fabrication", fab_release_override_reason: null }),
    );
  });

  it("backstop: a server FAB_RELEASE_BLOCKED on the update undoes the logged round", async () => {
    // Pre-check passes, but the trigger fires on the write (RFI opened in between).
    updateSubmittal.mockRejectedValueOnce({ message: "FAB_RELEASE_BLOCKED: 1 open RFI(s) ... (RFI-009)." });
    await expect(
      addSubmittalRound({
        submittal: { id: "s4", project_id: "p1", drawing_set_ids: ["set-a"], total_rounds: 0 },
        status: "Released for Fabrication",
      }),
    ).rejects.toBeInstanceOf(FabReleaseBlockedError);
    expect(createRound).toHaveBeenCalled(); // round was logged…
    expect(deleteRound).toHaveBeenCalledWith("round-1"); // …then undone
  });

  it("does NOT pre-check non-release moves (e.g. Approved)", async () => {
    await addSubmittalRound({
      submittal: { id: "s5", project_id: "p1", drawing_set_ids: ["set-a"], total_rounds: 0 },
      status: "Approved",
      ball_in_court: "EOR",
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(createRound).toHaveBeenCalled();
  });
});
