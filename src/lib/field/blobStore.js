/**
 * blobStore.js — IndexedDB store for field photo blobs captured offline.
 *
 * Photos can't ride the localStorage outbox: they're binary, and base64 would
 * blow the ~5MB cap after a couple of shots. So each pending photo's compressed
 * blob lives here keyed by its client_op_id, while the matching create op lives
 * in the localStorage outbox (see offlineQueue.js). On reconnect the op is
 * replayed: read the blob -> upload -> Photo.create (dedup'd) -> delete the blob
 * (see photoSync.js). Orphaned blobs (op already drained) are reclaimed by
 * reconcilePendingPhotos on mount.
 *
 * Hand-rolled (no new dependency). Every call degrades gracefully — a missing /
 * broken IndexedDB (private mode, SSR, old browser) yields null / no-op so the
 * online photo path is never blocked. Only putPendingPhoto rethrows, because if
 * we can't persist the blob we must NOT tell the foreman it was saved offline.
 */

const DB_NAME = "sbp-field";
const DB_VERSION = 1;
const STORE = "pending-photos";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Run a single store op inside its own transaction. The store call is issued
// synchronously (no await gap) so the transaction can't auto-commit early.
function runOp(mode, makeRequest) {
  return new Promise((resolve, reject) => {
    openDb().then((db) => {
      let result;
      const t = db.transaction(STORE, mode);
      const request = makeRequest(t.objectStore(STORE));
      request.onsuccess = () => {
        result = request.result;
      };
      t.oncomplete = () => {
        db.close();
        resolve(result);
      };
      t.onerror = () => {
        db.close();
        reject(t.error);
      };
      t.onabort = () => {
        db.close();
        reject(t.error);
      };
    }, reject);
  });
}

/** Persist a pending photo blob + its create metadata. Rethrows on failure. */
export async function putPendingPhoto(key, blob, meta) {
  await runOp("readwrite", (store) => store.put({ blob, meta }, key));
}

/** Read a pending photo ({ blob, meta }) or null if absent / unavailable. */
export async function getPendingPhoto(key) {
  try {
    return (await runOp("readonly", (store) => store.get(key))) || null;
  } catch {
    return null;
  }
}

/** Remove a pending photo (best-effort). */
export async function deletePendingPhoto(key) {
  try {
    await runOp("readwrite", (store) => store.delete(key));
  } catch {
    /* best-effort — a stale blob is reclaimed by reconcile */
  }
}

/** All pending blob keys (best-effort; [] when unavailable). */
export async function allPendingKeys() {
  try {
    const keys = await runOp("readonly", (store) => store.getAllKeys());
    return Array.isArray(keys) ? keys : [];
  } catch {
    return [];
  }
}

/** Drop pending blobs whose key isn't in `liveKeys` (their op already drained). */
export async function reconcilePendingPhotos(liveKeys) {
  const live = liveKeys instanceof Set ? liveKeys : new Set(liveKeys || []);
  const keys = await allPendingKeys();
  for (const key of keys) {
    if (!live.has(key)) await deletePendingPhoto(key);
  }
}

/**
 * Wipe ALL pending photo blobs. Called on sign-out / user switch so one user's
 * offline captures can never linger in IndexedDB on a shared field tablet (the
 * localStorage outbox is cleared alongside it — see AuthContext). Best-effort.
 */
export async function clearPendingPhotos() {
  try {
    await runOp("readwrite", (store) => store.clear());
  } catch {
    /* best-effort — unavailable IndexedDB (private mode / SSR) is a no-op */
  }
}
