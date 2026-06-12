// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFieldOutbox } from "../useFieldOutbox";
import { makeProgressOp, loadQueue, OP_SCHEDULE_PROGRESS } from "@/lib/field/offlineQueue";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), message: vi.fn(), error: vi.fn() },
}));

describe("useFieldOutbox", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("enqueues, persists to storage, and reports the pending count", () => {
    const { result } = renderHook(() => useFieldOutbox({}));
    expect(result.current.pending).toBe(0);

    act(() => {
      result.current.enqueue(makeProgressOp("t1", 50, 1));
    });

    expect(result.current.pending).toBe(1);
    expect(loadQueue()).toHaveLength(1);
  });

  it("coalesces repeated progress for the same task", () => {
    const { result } = renderHook(() => useFieldOutbox({}));
    act(() => {
      result.current.enqueue(makeProgressOp("t1", 25, 1));
      result.current.enqueue(makeProgressOp("t1", 75, 2));
    });
    expect(result.current.pending).toBe(1);
    expect(loadQueue()[0].payload.pct).toBe(75);
  });

  it("drains the backlog when the browser comes back online", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useFieldOutbox({ [OP_SCHEDULE_PROGRESS]: handler }),
    );

    act(() => {
      result.current.enqueue(makeProgressOp("t1", 75, 1));
    });
    expect(result.current.pending).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(handler).toHaveBeenCalledWith({ id: "t1", pct: 75 }, expect.anything());
    expect(loadQueue()).toHaveLength(0);
  });

  it("keeps the op queued when replay fails (still no signal)", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const { result } = renderHook(() =>
      useFieldOutbox({ [OP_SCHEDULE_PROGRESS]: handler }),
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
