// Regression coverage for the enqueue-during-flush data-loss bug.
//
// `useFieldOutbox.flush()` snapshots the queue, awaits the network, then writes
// back. It used to write `result.remaining` directly, which destroyed anything
// the user enqueued while the flush was in flight — a punch item captured on
// marginal signal mid-sync simply vanished, with no error and a pending count
// that reset to 0. `reconcileAfterFlush` re-reads storage and subtracts only
// the ids the flush actually consumed.

import { describe, it, expect } from "vitest";
import {
  consumedOpIds,
  reconcileAfterFlush,
  enqueueOp,
  flushQueue,
  makeProgressOp,
  makePunchCreateOp,
} from "../offlineQueue";

describe("consumedOpIds", () => {
  it("names the ops drained off the front of the queue", () => {
    const before = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect([...consumedOpIds(before, [{ id: "c" }])]).toEqual(["a", "b"]);
  });

  it("is empty when nothing was consumed", () => {
    const before = [{ id: "a" }];
    expect(consumedOpIds(before, before).size).toBe(0);
  });

  it("tolerates non-arrays and id-less ops", () => {
    expect(consumedOpIds(null, null).size).toBe(0);
    expect(consumedOpIds([{}, { id: "b" }], []).size).toBe(1);
  });
});

describe("reconcileAfterFlush", () => {
  it("keeps an op enqueued DURING the flush", () => {
    const snapshot = [{ id: "a" }, { id: "b" }];
    // Fully drained.
    const remaining = [];
    // Meanwhile the user captured one more; storage now holds it too.
    const persisted = [{ id: "a" }, { id: "b" }, { id: "late" }];

    const merged = reconcileAfterFlush(persisted, snapshot, remaining);

    expect(merged).toEqual([{ id: "late" }]);
  });

  it("keeps a mid-flush op when the flush stopped partway", () => {
    const snapshot = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const remaining = [{ id: "b" }, { id: "c" }]; // "a" synced, then failed
    const persisted = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "late" }];

    const merged = reconcileAfterFlush(persisted, snapshot, remaining);

    expect(merged.map((o) => o.id)).toEqual(["b", "c", "late"]);
  });

  it("does not resurrect a consumed op", () => {
    const snapshot = [{ id: "a" }];
    const merged = reconcileAfterFlush([{ id: "a" }], snapshot, []);
    expect(merged).toEqual([]);
  });

  it("preserves a coalesced re-enqueue of an already-synced task", () => {
    // Progress ops carry `now` in their id, so a re-enqueue during the flush
    // is a DIFFERENT id and must survive.
    const first = makeProgressOp("task-1", 40, 1000);
    const second = makeProgressOp("task-1", 75, 2000);
    expect(second.id).not.toBe(first.id);

    const snapshot = [first];
    const persisted = enqueueOp([first], second); // coalesce drops `first`

    const merged = reconcileAfterFlush(persisted, snapshot, []);

    expect(merged).toEqual([second]);
  });

  it("returns [] for a corrupt persisted queue", () => {
    expect(reconcileAfterFlush(null, [{ id: "a" }], [])).toEqual([]);
  });
});

describe("flush + reconcile end to end", () => {
  it("does not lose a punch create captured mid-sync", async () => {
    const progress = makeProgressOp("task-9", 50, 1000);
    const snapshot = [progress];

    // Storage as it looks by the time the flush resolves.
    let persisted = [...snapshot];
    const latePunch = makePunchCreateOp({ title: "loose bolt, grid C-4" }, "op-late", 1500);

    const handlers = {
      [progress.type]: async () => {
        // The user submits while the network call is in flight.
        persisted = enqueueOp(persisted, latePunch);
      },
    };

    const result = await flushQueue(snapshot, handlers);
    expect(result.synced).toBe(1);

    // The old behaviour (saveQueue(result.remaining)) would write [] here.
    expect(result.remaining).toEqual([]);

    const merged = reconcileAfterFlush(persisted, snapshot, result.remaining);
    expect(merged).toEqual([latePunch]);
  });
});
