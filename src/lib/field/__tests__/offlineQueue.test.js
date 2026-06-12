import { describe, it, expect, vi } from "vitest";
import {
  loadQueue,
  saveQueue,
  enqueueOp,
  makeProgressOp,
  flushQueue,
  isLikelyOfflineError,
  OP_SCHEDULE_PROGRESS,
} from "../offlineQueue";

// In-memory storage adapter for deterministic persistence tests.
function memStorage(initial = null) {
  let value = initial;
  return {
    read: () => value,
    write: (v) => {
      value = v;
    },
    _raw: () => value,
  };
}

describe("makeProgressOp", () => {
  it("builds an idempotent op keyed by task", () => {
    const op = makeProgressOp("task-1", 50, 1000);
    expect(op).toMatchObject({
      type: OP_SCHEDULE_PROGRESS,
      coalesceKey: "schedule-progress:task-1",
      payload: { id: "task-1", pct: 50 },
      createdAt: 1000,
    });
  });
});

describe("enqueueOp coalescing", () => {
  it("replaces an earlier op for the same task (last value wins)", () => {
    let q = [];
    q = enqueueOp(q, makeProgressOp("a", 25, 1));
    q = enqueueOp(q, makeProgressOp("b", 10, 2));
    q = enqueueOp(q, makeProgressOp("a", 75, 3)); // supersedes a@25

    expect(q).toHaveLength(2);
    const a = q.find((o) => o.payload.id === "a");
    expect(a.payload.pct).toBe(75);
  });

  it("preserves FIFO order of distinct tasks", () => {
    let q = [];
    q = enqueueOp(q, makeProgressOp("a", 1, 1));
    q = enqueueOp(q, makeProgressOp("b", 2, 2));
    q = enqueueOp(q, makeProgressOp("c", 3, 3));
    expect(q.map((o) => o.payload.id)).toEqual(["a", "b", "c"]);
  });

  it("is pure (does not mutate the input array)", () => {
    const original = [];
    const next = enqueueOp(original, makeProgressOp("a", 1, 1));
    expect(original).toHaveLength(0);
    expect(next).toHaveLength(1);
  });
});

describe("loadQueue / saveQueue", () => {
  it("round-trips through storage", () => {
    const storage = memStorage();
    const q = enqueueOp([], makeProgressOp("a", 40, 1));
    saveQueue(q, storage);
    expect(loadQueue(storage)).toEqual(q);
  });

  it("returns [] for empty or corrupt storage", () => {
    expect(loadQueue(memStorage(null))).toEqual([]);
    expect(loadQueue(memStorage("not json"))).toEqual([]);
    expect(loadQueue(memStorage('{"not":"an array"}'))).toEqual([]);
  });
});

describe("flushQueue", () => {
  it("replays every op in order on success and drains the queue", async () => {
    const seen = [];
    const handlers = {
      [OP_SCHEDULE_PROGRESS]: async (payload) => {
        seen.push(payload.id);
      },
    };
    const q = [
      makeProgressOp("a", 10, 1),
      makeProgressOp("b", 20, 2),
      makeProgressOp("c", 30, 3),
    ];
    const result = await flushQueue(q, handlers);
    expect(seen).toEqual(["a", "b", "c"]);
    expect(result.synced).toBe(3);
    expect(result.remaining).toHaveLength(0);
    expect(result.failed).toBeNull();
  });

  it("stops at the first failure and keeps that op + the remainder", async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce(undefined) // a ok
      .mockRejectedValueOnce(new Error("Failed to fetch")); // b fails
    const handlers = { [OP_SCHEDULE_PROGRESS]: handler };
    const q = [
      makeProgressOp("a", 10, 1),
      makeProgressOp("b", 20, 2),
      makeProgressOp("c", 30, 3),
    ];
    const result = await flushQueue(q, handlers);
    expect(result.synced).toBe(1);
    expect(result.failed.payload.id).toBe("b");
    expect(result.remaining.map((o) => o.payload.id)).toEqual(["b", "c"]); // nothing lost
    expect(handler).toHaveBeenCalledTimes(2); // didn't attempt c
  });

  it("discards unknown op types instead of wedging the queue", async () => {
    const handlers = { [OP_SCHEDULE_PROGRESS]: async () => {} };
    const q = [
      { id: "x", type: "retired-op", payload: {} },
      makeProgressOp("a", 10, 2),
    ];
    const result = await flushQueue(q, handlers);
    expect(result.remaining).toHaveLength(0);
    expect(result.synced).toBe(1);
  });

  it("never throws on empty/garbage input", async () => {
    await expect(flushQueue(null, {})).resolves.toMatchObject({ synced: 0 });
    await expect(flushQueue(undefined, {})).resolves.toMatchObject({ remaining: [] });
  });
});

describe("isLikelyOfflineError", () => {
  it("treats fetch/network failures as offline", () => {
    expect(isLikelyOfflineError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isLikelyOfflineError({ message: "NetworkError when attempting to fetch resource" })).toBe(true);
    expect(isLikelyOfflineError({ message: "Load failed" })).toBe(true);
  });

  it("does NOT treat a server/RLS rejection as offline", () => {
    expect(isLikelyOfflineError({ name: "PostgrestError", message: "new row violates row-level security policy" })).toBe(false);
    expect(isLikelyOfflineError({ message: "permission denied" })).toBe(false);
  });

  it("is false for no error", () => {
    expect(isLikelyOfflineError(null)).toBe(false);
  });
});
