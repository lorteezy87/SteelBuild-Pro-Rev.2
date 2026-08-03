import { describe, expect, it, vi } from "vitest";
import {
  createPlannerSnapshotKey,
  runPlannerOfflineTransaction,
  sanitizePlannerSnapshotRows,
} from "../plannerSnapshots";

describe("Planner snapshots", () => {
  it("partitions a snapshot key by authenticated user and organization", () => {
    expect(createPlannerSnapshotKey({ userId: "user-a", organizationId: "org-steel" }, "actions:project-7"))
      .toBe("sbp:planner:snapshot:v1:user-a:org-steel:actions:project-7");
  });

  it("does not retain auth-like fields in snapshot rows", () => {
    expect(sanitizePlannerSnapshotRows([
      {
        id: "action-7",
        project_id: "project-7",
        title: "Confirm embeds",
        access_token: "must-not-persist",
        refresh_token: "must-not-persist",
        nested: { token: "must-not-persist" },
      },
    ])).toEqual([
      { id: "action-7", project_id: "project-7", title: "Confirm embeds" },
    ]);
  });
});

describe("Planner IndexedDB transaction lifecycle", () => {
  it("does not resolve a write until its transaction completes", async () => {
    const events: string[] = [];
    const transaction = {
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      error: null,
      abort: () => events.push("abort"),
      objectStore: () => ({ put: () => ({}) }),
    } as unknown as IDBTransaction;
    const database = { close: () => events.push("close") } as unknown as IDBDatabase;
    let settled = false;

    const pending = runPlannerOfflineTransaction(database, transaction, () => ({}) as IDBRequest<void>);
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    transaction.oncomplete?.(new Event("complete"));
    await expect(pending).resolves.toBeUndefined();
    expect(events).toEqual(["close"]);
  });

  it("rejects and closes when the transaction aborts", async () => {
    const transaction = {
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      error: new DOMException("quota exceeded", "QuotaExceededError"),
      abort: () => undefined,
      objectStore: () => ({ put: () => ({}) }),
    } as unknown as IDBTransaction;
    const close = vi.fn();
    const database = { close } as unknown as IDBDatabase;

    const pending = runPlannerOfflineTransaction(database, transaction, () => ({}) as IDBRequest<void>);
    transaction.onabort?.(new Event("abort"));
    await expect(pending).rejects.toThrow("quota exceeded");
    expect(close).toHaveBeenCalledOnce();
  });
});
