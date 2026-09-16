/**
 * storage — offline-first persistence for a board.
 *
 * The jobsite is the design target, so the local copy is the **working copy**,
 * not a cache of a server copy. Every action is written locally first and the
 * board is fully usable with no network at all. A remote, when one is
 * configured, is somewhere the local copy is later replayed to.
 *
 * ## Failures are reported, never swallowed
 *
 * Browser storage fails in ordinary ways — Safari private mode throws on first
 * access, an iPad near its limit throws `QuotaExceededError` mid-session. A
 * silent catch there is the worst possible behaviour: the user keeps working on
 * a board that has stopped being saved and finds out when they close the tab. So
 * every write returns a {@link StorageResult} naming what went wrong, and the UI
 * is expected to surface it.
 *
 * ## Why there is no Supabase table here
 *
 * There is no board table in the schema yet, and adding one means an RLS policy
 * set and a migration against the shared production project — an owner decision,
 * not something to slip in under a feature. {@link BoardSyncAdapter} is the seam
 * that decision plugs into; until then {@link localOnlyAdapter} reports
 * `no-remote` and the UI says the board lives on this device. It says that
 * plainly rather than showing a cloud icon that means nothing.
 */

import type { BoardAction } from "./document";
import { BOARD_SCHEMA_VERSION, type BoardDoc } from "./types";

const NS = "sbp:board:";
const docKey = (boardId: string) => `${NS}doc:${boardId}`;
const queueKey = (boardId: string) => `${NS}queue:${boardId}`;
const assetKey = (assetId: string) => `${NS}asset:${assetId}`;
const indexKey = (projectId: string) => `${NS}index:${projectId}`;

/**
 * Per-asset ceiling for an inlined image, in characters of base64.
 *
 * ~4 MB of data URL. Above that a photo belongs in Supabase storage via the
 * app's existing upload path, not in a synchronous key-value store that blocks
 * the main thread on read.
 */
export const MAX_ASSET_CHARS = 4 * 1024 * 1024;

export type StorageFailure = "unavailable" | "quota" | "serialize" | "too-large";

export type StorageResult = { ok: true } | { ok: false; reason: StorageFailure; message: string };

const OK: StorageResult = { ok: true };

/**
 * The failure message from a result, or null when it succeeded.
 *
 * Call sites use this rather than narrowing the union by hand. Under the
 * repo's base tsconfig (`strictNullChecks: false`) a truthiness check on the
 * `ok` discriminant does not narrow, so `if (!result.ok) use(result.message)`
 * fails to compile — and the workarounds people reach for tend to be a cast,
 * which throws away the very distinction the union exists to draw.
 */
export function storageErrorMessage(result: StorageResult): string | null {
  return result.ok === false ? result.message : null;
}

function fail(reason: StorageFailure, message: string): StorageResult {
  return { ok: false, reason, message };
}

/** The key-value backend. Swappable so tests need no jsdom and no globals. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    // Private mode / blocked storage throws on *access*, not just on write.
    return null;
  }
}

/** An in-memory store, used when the browser's is unavailable. */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function isQuotaError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED";
  }
  return error instanceof Error && /quota/i.test(error.message);
}

function write(store: KeyValueStore | null, key: string, value: string): StorageResult {
  if (!store) return fail("unavailable", "Browser storage is unavailable on this device.");
  try {
    store.setItem(key, value);
    return OK;
  } catch (error) {
    if (isQuotaError(error)) {
      return fail("quota", "This device is out of storage for boards. Free space or remove photos.");
    }
    return fail("unavailable", error instanceof Error ? error.message : "Storage write failed.");
  }
}

/** Persist the board. The caller decides how often; this does no debouncing. */
export function saveBoard(doc: BoardDoc, store: KeyValueStore | null = browserStore()): StorageResult {
  let payload: string;
  try {
    payload = JSON.stringify(doc);
  } catch (error) {
    return fail("serialize", error instanceof Error ? error.message : "Board could not be serialized.");
  }
  const result = write(store, docKey(doc.id), payload);
  if (!result.ok) return result;
  if (doc.project_id) registerBoard(doc.project_id, doc.id, doc.name, store);
  return OK;
}

/**
 * Read a board back.
 *
 * Returns null for anything that is not a board this build understands —
 * missing, unparseable, or written by a **newer** schema version. Loading a
 * future board with today's reducer would silently drop the fields it does not
 * know about and then save the truncated result back over the original.
 */
export function loadBoard(boardId: string, store: KeyValueStore | null = browserStore()): BoardDoc | null {
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(docKey(boardId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BoardDoc>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.schema_version !== "number") return null;
    if (parsed.schema_version > BOARD_SCHEMA_VERSION) return null;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return {
      ...(parsed as BoardDoc),
      overlays: Array.isArray(parsed.overlays) ? parsed.overlays : [],
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
    };
  } catch {
    return null;
  }
}

export interface BoardIndexEntry {
  board_id: string;
  name: string;
}

/** Boards known for a project on this device. */
export function listBoards(projectId: string, store: KeyValueStore | null = browserStore()): BoardIndexEntry[] {
  if (!store) return [];
  try {
    const raw = store.getItem(indexKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is BoardIndexEntry =>
        !!entry && typeof entry === "object" && typeof (entry as BoardIndexEntry).board_id === "string",
    );
  } catch {
    return [];
  }
}

function registerBoard(
  projectId: string,
  boardId: string,
  name: string,
  store: KeyValueStore | null,
): StorageResult {
  const existing = listBoards(projectId, store).filter((entry) => entry.board_id !== boardId);
  existing.push({ board_id: boardId, name });
  return write(store, indexKey(projectId), JSON.stringify(existing));
}

// ── Pending queue ──────────────────────────────────────────────────────────

/**
 * One unsynced change.
 *
 * The **action** is queued, not a snapshot of the board. A queue of snapshots
 * cannot be merged with anything — replaying it onto a board another device has
 * touched overwrites their work wholesale. A queue of actions can be replayed on
 * top, which is the only version of offline sync that survives two people on one
 * job.
 */
export interface PendingChange {
  id: string;
  board_id: string;
  /** The board `rev` this action was produced against. */
  base_rev: number;
  action: BoardAction;
  queued_at: string;
}

export function readQueue(boardId: string, store: KeyValueStore | null = browserStore()): PendingChange[] {
  if (!store) return [];
  try {
    const raw = store.getItem(queueKey(boardId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingChange[]) : [];
  } catch {
    return [];
  }
}

/** Cap on queued changes held locally before the oldest are dropped. */
export const MAX_QUEUE_LENGTH = 2000;

export function enqueue(
  change: PendingChange,
  store: KeyValueStore | null = browserStore(),
): StorageResult {
  const queue = readQueue(change.board_id, store);
  queue.push(change);
  // Dropping from the front loses the oldest changes, which are the ones most
  // likely already reflected in a saved snapshot. The board itself is saved in
  // full regardless, so this degrades sync fidelity, not the user's work.
  while (queue.length > MAX_QUEUE_LENGTH) queue.shift();
  return write(store, queueKey(change.board_id), JSON.stringify(queue));
}

/** Drop the named changes — what a successful push calls. */
export function acknowledge(
  boardId: string,
  ids: readonly string[],
  store: KeyValueStore | null = browserStore(),
): StorageResult {
  const done = new Set(ids);
  const remaining = readQueue(boardId, store).filter((change) => !done.has(change.id));
  return write(store, queueKey(boardId), JSON.stringify(remaining));
}

// ── Assets ────────────────────────────────────────────────────────────────

/** Store an image data URL. Rejects anything over {@link MAX_ASSET_CHARS}. */
export function putAsset(
  assetId: string,
  dataUrl: string,
  store: KeyValueStore | null = browserStore(),
): StorageResult {
  if (dataUrl.length > MAX_ASSET_CHARS) {
    return fail("too-large", "That image is too large to keep on the board. Resize it and try again.");
  }
  return write(store, assetKey(assetId), dataUrl);
}

export function getAsset(assetId: string, store: KeyValueStore | null = browserStore()): string | null {
  if (!store) return null;
  try {
    return store.getItem(assetKey(assetId));
  } catch {
    return null;
  }
}

export function removeAsset(assetId: string, store: KeyValueStore | null = browserStore()): void {
  if (!store) return;
  try {
    store.removeItem(assetKey(assetId));
  } catch {
    /* nothing to do — the asset is already unreachable */
  }
}

// ── Sync ──────────────────────────────────────────────────────────────────

export type SyncStatus = "synced" | "pending" | "no-remote" | "offline" | "error";

export interface SyncOutcome {
  status: SyncStatus;
  /** Ids of changes the remote accepted, to be acknowledged locally. */
  accepted: string[];
  message: string;
}

/**
 * The seam a real backend plugs into.
 *
 * An implementation receives the full board and the changes not yet pushed, and
 * reports what it accepted. Nothing else in the board knows whether a remote
 * exists.
 */
export interface BoardSyncAdapter {
  readonly id: string;
  push(doc: BoardDoc, pending: readonly PendingChange[]): Promise<SyncOutcome>;
}

/**
 * The adapter used while no board table exists.
 *
 * It accepts nothing and says so. That is the honest state: the work is safe on
 * this device and has been sent nowhere. Reporting `synced` here — the tempting
 * shortcut, since there is nothing to fail — would tell a user their board is
 * backed up when a lost iPad would take it with them.
 */
export const localOnlyAdapter: BoardSyncAdapter = {
  id: "local-only",
  push: async (_doc, pending) => ({
    status: "no-remote",
    accepted: [],
    message:
      pending.length > 0
        ? `${pending.length} change${pending.length === 1 ? "" : "s"} saved on this device. Cloud sync is not configured yet.`
        : "Saved on this device. Cloud sync is not configured yet.",
  }),
};

export interface SyncState {
  status: SyncStatus;
  pending: number;
  last_synced_at: string | null;
  message: string;
}

/**
 * Push pending changes and acknowledge whatever the remote took.
 *
 * `online` is passed in rather than read from `navigator` so the caller owns the
 * single definition of connectivity (and so this is testable). When offline the
 * push is not attempted at all: a failed request on a jobsite hotspot can hang
 * for thirty seconds and there is nothing to gain by waiting for it.
 */
export async function syncBoard(
  doc: BoardDoc,
  adapter: BoardSyncAdapter,
  options: { online: boolean; now: string; store?: KeyValueStore | null },
): Promise<SyncState> {
  const store = options.store === undefined ? browserStore() : options.store;
  const pending = readQueue(doc.id, store);
  if (!options.online) {
    return {
      status: "offline",
      pending: pending.length,
      last_synced_at: null,
      message:
        pending.length > 0
          ? `Offline — ${pending.length} change${pending.length === 1 ? "" : "s"} waiting to sync.`
          : "Offline — working from this device.",
    };
  }
  try {
    const outcome = await adapter.push(doc, pending);
    if (outcome.accepted.length > 0) acknowledge(doc.id, outcome.accepted, store);
    const remaining = readQueue(doc.id, store).length;
    return {
      status: outcome.status === "synced" && remaining > 0 ? "pending" : outcome.status,
      pending: remaining,
      last_synced_at: outcome.accepted.length > 0 ? options.now : null,
      message: outcome.message,
    };
  } catch (error) {
    return {
      status: "error",
      pending: pending.length,
      last_synced_at: null,
      message: error instanceof Error ? error.message : "Sync failed.",
    };
  }
}
