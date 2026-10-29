// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useFieldOutbox } from "../useFieldOutbox";
import { loadQueue, makeProgressOp, makePhotoCreateOp, OP_PHOTO_CREATE, OP_SCHEDULE_PROGRESS } from "@/lib/field/offlineQueue";
import { setActiveOrgId } from "@/lib/activeOrg";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/field/replayClient", () => ({ createReplayClient: async () => ({}) }));
const owner = { userId: "user-a", orgId: "org-a" };
const { deletePhoto } = vi.hoisted(() => ({ deletePhoto: vi.fn() }));
vi.mock("@/lib/field/blobStore", () => ({ deletePendingPhoto: deletePhoto }));

describe("durable field capture acknowledgement", () => {
  beforeEach(() => { localStorage.clear(); setActiveOrgId(owner.orgId); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("does not acknowledge or count a capture when storage is full", () => {
    const { result } = renderHook(() => useFieldOutbox({}, owner));
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    expect(() => act(() => result.current.enqueue(makeProgressOp("task", 50, 1))))
      .toThrow(/offline/i);
    expect(result.current.pending).toBe(0);
    write.mockRestore();
    expect(loadQueue()).toEqual([]);
  });

  it("refuses to overwrite existing captures when storage cannot be read", () => {
    const { result } = renderHook(() => useFieldOutbox({}, owner));
    act(() => result.current.enqueue(makeProgressOp("first", 25, 1)));
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });
    expect(() => act(() => result.current.enqueue(makeProgressOp("second", 50, 2))))
      .toThrow(/offline/i);
    read.mockRestore();
    expect(loadQueue().map(op => op.payload.id)).toEqual(["first"]);
    expect(result.current.pending).toBe(1);
  });

  it("preserves malformed persisted data for recovery instead of replacing it", () => {
    localStorage.setItem("sbp:field:outbox:v1", "broken capture data");
    const { result } = renderHook(() => useFieldOutbox({}, owner));
    expect(() => act(() => result.current.enqueue(makeProgressOp("task", 50, 1))))
      .toThrow(/offline/i);
    expect(localStorage.getItem("sbp:field:outbox:v1")).toBe("broken capture data");
  });

  it("finishes newer progress captured while the older replay is in flight", async () => {
    let finishFirst!: () => void;
    const replay = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; })).mockResolvedValue(undefined);
    const { result } = renderHook(() => useFieldOutbox({ [OP_SCHEDULE_PROGRESS]: replay }, owner));
    act(() => result.current.enqueue(makeProgressOp("task", 25, 1)));
    let flushing!: Promise<void>;
    act(() => { flushing = result.current.flush(); });
    await waitFor(() => expect(replay).toHaveBeenCalledTimes(1));
    act(() => result.current.enqueue(makeProgressOp("task", 100, 2)));
    await act(async () => { finishFirst(); await flushing; });
    expect(replay.mock.calls.map(call => call[0].pct)).toEqual([25, 100]);
    expect(loadQueue()).toEqual([]);
  });

  it("retains a photo blob if removing its successful replay from storage fails", async () => {
    deletePhoto.mockClear();
    const { result } = renderHook(() => useFieldOutbox({ [OP_PHOTO_CREATE]: async () => {} }, owner));
    act(() => result.current.enqueue(makePhotoCreateOp("photo", { project_id: "project" }, 1)));
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    await act(async () => { await result.current.flush(); });
    expect(deletePhoto).not.toHaveBeenCalled();
    write.mockRestore();
    expect(loadQueue()).toHaveLength(1);
    await act(async () => { await result.current.flush(); });
    expect(deletePhoto).toHaveBeenCalledWith("photo");
    expect(loadQueue()).toEqual([]);
  });
});
