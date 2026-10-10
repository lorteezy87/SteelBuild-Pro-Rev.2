// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFieldOutbox } from "../useFieldOutbox";
import { makeProgressOp, loadQueue, saveQueue, OP_SCHEDULE_PROGRESS } from "@/lib/field/offlineQueue";
import { setActiveOrgId } from "@/lib/activeOrg";

const owner = { userId: "user-a", orgId: "org-a" };

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), message: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/field/replayClient", () => ({ createReplayClient: async () => ({}) }));

describe("useFieldOutbox", () => {
  beforeEach(() => {
    localStorage.clear();
    setActiveOrgId("org-a");
  });

  it("enqueues, persists to storage, and reports the pending count", () => {
    const { result } = renderHook(() => useFieldOutbox({}, owner));
    expect(result.current.pending).toBe(0);

    act(() => {
      result.current.enqueue(makeProgressOp("t1", 50, 1));
    });

    expect(result.current.pending).toBe(1);
    expect(loadQueue()).toHaveLength(1);
    expect(loadQueue()[0].owner).toEqual(owner);
  });

  it("coalesces repeated progress for the same task", () => {
    const { result } = renderHook(() => useFieldOutbox({}, owner));
    act(() => {
      result.current.enqueue(makeProgressOp("t1", 25, 1));
      result.current.enqueue(makeProgressOp("t1", 75, 2));
    });
    expect(result.current.pending).toBe(1);
    expect(loadQueue()[0].payload.pct).toBe(75);
  });

  it("refuses an enqueue callback retained by a previous identity", () => {
    const { result, rerender } = renderHook(({ identity }) => useFieldOutbox({}, identity), {
      initialProps: { identity: owner },
    });
    const previousEnqueue = result.current.enqueue;
    const nextOwner = { userId: "user-b", orgId: "org-a" };
    rerender({ identity: nextOwner });
    act(() => previousEnqueue(makeProgressOp("t1", 25, 1)));
    expect(loadQueue()).toEqual([]);
    expect(result.current.pending).toBe(0);
    act(() => result.current.enqueue(makeProgressOp("t1", 50, 2)));
    expect(loadQueue()[0].owner).toEqual(nextOwner);
  });

  it("does not coalesce over another owner's or legacy capture of the same task", () => {
    const { result } = renderHook(() => useFieldOutbox({}, owner));
    const legacy = makeProgressOp("t1", 25, 1);
    const otherOwner = { ...makeProgressOp("t1", 30, 2), owner: { userId: "user-b", orgId: "org-a" } };
    saveQueue([legacy, otherOwner]);
    act(() => result.current.enqueue(makeProgressOp("t1", 50, 3)));
    expect(loadQueue().slice(0, 2)).toEqual([legacy, otherOwner]);
    expect(loadQueue()[2].owner).toEqual(owner);
    expect(result.current.pending).toBe(1);
  });

  it("drains the backlog when the browser comes back online", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFieldOutbox({ [OP_SCHEDULE_PROGRESS]: handler }, owner),
    );

    act(() => {
      result.current.enqueue(makeProgressOp("t1", 75, 1));
    });
    expect(result.current.pending).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.pending).toBe(0));
    // startCaptureDay is null on a standalone op: it is filled in only when
    // this op supersedes an earlier one that had already started the task
    // (see progressCoalesceStartDay.test.ts). Null here means "nothing was
    // superseded", not "work started today".
    expect(handler).toHaveBeenCalledWith(
      { id: "t1", pct: 75, captureDay: null, startCaptureDay: null },
      expect.objectContaining({
        type: OP_SCHEDULE_PROGRESS,
        payload: { id: "t1", pct: 75, captureDay: null, startCaptureDay: null },
      }),
      expect.any(Function),
      expect.any(Object),
    );
    expect(loadQueue()).toHaveLength(0);
  });

  it("keeps the op queued when replay fails (still no signal)", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const { result } = renderHook(() =>
      useFieldOutbox({ [OP_SCHEDULE_PROGRESS]: handler }, owner),
    );

    act(() => {
      result.current.enqueue(makeProgressOp("t1", 50, 1));
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(1);
    expect(loadQueue()).toHaveLength(1); // nothing lost
  });
});
