import { describe, expect, it } from "vitest";
import { createBoardDoc } from "../document";
import {
  MAX_ASSET_CHARS,
  MAX_QUEUE_LENGTH,
  acknowledge,
  enqueue,
  getAsset,
  listBoards,
  loadBoard,
  localOnlyAdapter,
  memoryStore,
  putAsset,
  readQueue,
  removeAsset,
  saveBoard,
  syncBoard,
  type BoardSyncAdapter,
  type KeyValueStore,
  type PendingChange,
} from "../storage";
import { BOARD_SCHEMA_VERSION, type BoardDoc } from "../types";

const T0 = "2026-03-02T08:00:00.000Z";

function doc(): BoardDoc {
  return createBoardDoc("board_1", "proj_1", "Bay 3", T0);
}

function change(id: string): PendingChange {
  return {
    id,
    board_id: "board_1",
    base_rev: 0,
    action: { type: "rename_board", name: `n-${id}` },
    queued_at: T0,
  };
}

/** A store that throws the browser's quota error on write. */
function quotaStore(): KeyValueStore {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError: the quota has been exceeded");
    },
    removeItem: () => {},
  };
}

describe("saveBoard / loadBoard", () => {
  it("round-trips a board", () => {
    const store = memoryStore();
    expect(saveBoard(doc(), store)).toEqual({ ok: true });
    expect(loadBoard("board_1", store)?.name).toBe("Bay 3");
  });

  it("registers the board against its project", () => {
    const store = memoryStore();
    saveBoard(doc(), store);
    expect(listBoards("proj_1", store)).toEqual([{ board_id: "board_1", name: "Bay 3" }]);
  });

  it("does not duplicate the index entry on re-save", () => {
    const store = memoryStore();
    saveBoard(doc(), store);
    saveBoard({ ...doc(), name: "Bay 3 rev B" }, store);
    expect(listBoards("proj_1", store)).toEqual([{ board_id: "board_1", name: "Bay 3 rev B" }]);
  });

  it("reports a quota failure instead of silently dropping the save", () => {
    const result = saveBoard(doc(), quotaStore());
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("quota");
    expect(result.ok === false && result.message).toMatch(/storage/i);
  });

  it("reports unavailable storage rather than pretending it saved", () => {
    const result = saveBoard(doc(), null);
    expect(result.ok === false && result.reason).toBe("unavailable");
  });

  it("returns null for a missing or unparseable board", () => {
    const store = memoryStore();
    expect(loadBoard("nope", store)).toBeNull();
    store.setItem("sbp:board:doc:broken", "{not json");
    expect(loadBoard("broken", store)).toBeNull();
  });

  it("refuses a board written by a newer schema, rather than truncating it", () => {
    const store = memoryStore();
    store.setItem(
      "sbp:board:doc:future",
      JSON.stringify({ ...doc(), id: "future", schema_version: BOARD_SCHEMA_VERSION + 1 }),
    );
    expect(loadBoard("future", store)).toBeNull();
  });

  it("tolerates a board saved before overlays and bookmarks existed", () => {
    const store = memoryStore();
    const legacy = { ...doc(), id: "legacy" } as Partial<BoardDoc>;
    delete legacy.overlays;
    delete legacy.bookmarks;
    store.setItem("sbp:board:doc:legacy", JSON.stringify(legacy));
    const loaded = loadBoard("legacy", store);
    expect(loaded?.overlays).toEqual([]);
    expect(loaded?.bookmarks).toEqual([]);
  });
});

describe("the pending queue", () => {
  it("queues actions, not snapshots, so they can be replayed on top of other work", () => {
    const store = memoryStore();
    enqueue(change("c1"), store);
    enqueue(change("c2"), store);
    const queue = readQueue("board_1", store);
    expect(queue.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(queue[0].action.type).toBe("rename_board");
    expect(queue[0].base_rev).toBe(0);
  });

  it("acknowledges only what the remote took", () => {
    const store = memoryStore();
    enqueue(change("c1"), store);
    enqueue(change("c2"), store);
    acknowledge("board_1", ["c1"], store);
    expect(readQueue("board_1", store).map((c) => c.id)).toEqual(["c2"]);
  });

  it("drops the oldest once the cap is reached", () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_QUEUE_LENGTH + 5; i += 1) enqueue(change(`c${i}`), store);
    const queue = readQueue("board_1", store);
    expect(queue).toHaveLength(MAX_QUEUE_LENGTH);
    expect(queue[0].id).toBe("c5");
  });

  it("reads as empty when storage is unavailable", () => {
    expect(readQueue("board_1", null)).toEqual([]);
  });
});

describe("assets", () => {
  it("stores and reads an image", () => {
    const store = memoryStore();
    expect(putAsset("asset_1", "data:image/png;base64,AAAA", store)).toEqual({ ok: true });
    expect(getAsset("asset_1", store)).toBe("data:image/png;base64,AAAA");
    removeAsset("asset_1", store);
    expect(getAsset("asset_1", store)).toBeNull();
  });

  it("refuses an oversized image with a message a user can act on", () => {
    const result = putAsset("big", "x".repeat(MAX_ASSET_CHARS + 1), memoryStore());
    expect(result.ok === false && result.reason).toBe("too-large");
    expect(result.ok === false && result.message).toMatch(/resize/i);
  });
});

describe("syncBoard", () => {
  it("does not attempt a push while offline, and reports the backlog", async () => {
    const store = memoryStore();
    enqueue(change("c1"), store);
    let pushed = false;
    const adapter: BoardSyncAdapter = {
      id: "spy",
      push: async () => {
        pushed = true;
        return { status: "synced", accepted: ["c1"], message: "" };
      },
    };
    const state = await syncBoard(doc(), adapter, { online: false, now: T0, store });
    expect(pushed).toBe(false);
    expect(state.status).toBe("offline");
    expect(state.pending).toBe(1);
    expect(state.message).toMatch(/1 change waiting/);
  });

  it("acknowledges what the remote accepted and reports the remainder as pending", async () => {
    const store = memoryStore();
    enqueue(change("c1"), store);
    enqueue(change("c2"), store);
    const adapter: BoardSyncAdapter = {
      id: "partial",
      push: async () => ({ status: "synced", accepted: ["c1"], message: "ok" }),
    };
    const state = await syncBoard(doc(), adapter, { online: true, now: T0, store });
    expect(state.pending).toBe(1);
    expect(state.status).toBe("pending");
    expect(state.last_synced_at).toBe(T0);
  });

  it("reports synced when the queue drains", async () => {
    const store = memoryStore();
    enqueue(change("c1"), store);
    const adapter: BoardSyncAdapter = {
      id: "full",
      push: async () => ({ status: "synced", accepted: ["c1"], message: "ok" }),
    };
    const state = await syncBoard(doc(), adapter, { online: true, now: T0, store });
    expect(state.status).toBe("synced");
    expect(state.pending).toBe(0);
  });

  it("surfaces an adapter failure rather than claiming success", async () => {
    const store = memoryStore();
    enqueue(change("c1"), store);
    const adapter: BoardSyncAdapter = {
      id: "broken",
      push: async () => {
        throw new Error("network down");
      },
    };
    const state = await syncBoard(doc(), adapter, { online: true, now: T0, store });
    expect(state.status).toBe("error");
    expect(state.message).toBe("network down");
    // Nothing was acknowledged, so the work is still queued.
    expect(readQueue("board_1", store)).toHaveLength(1);
  });
});

describe("localOnlyAdapter", () => {
  it("says the board has been sent nowhere, instead of showing a false green tick", async () => {
    const store = memoryStore();
    enqueue(change("c1"), store);
    const state = await syncBoard(doc(), localOnlyAdapter, { online: true, now: T0, store });
    expect(state.status).toBe("no-remote");
    expect(state.pending).toBe(1);
    expect(state.message).toMatch(/not configured/i);
  });
});
