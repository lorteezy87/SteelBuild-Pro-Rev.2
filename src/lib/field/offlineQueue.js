/**
 * offlineQueue.js — a tiny, durable outbox for field captures made with no
 * signal (Phase 3, offline slice 1).
 *
 * Scope is deliberately narrow because offline sync is where subtle data-loss
 * bugs live: this queue carries ONLY idempotent operations — today, schedule
 * task progress (set task X to N%). Replaying "set X to 50%" twice is harmless,
 * so we never need server-side dedup, exactly-once delivery, or op ids that
 * survive a create. Non-idempotent captures (punch/photo CREATE) are NOT queued
 * here yet — they need a client-op-id dedup key first, or a replay would mint
 * duplicates.
 *
 * Design choices that keep it safe:
 *   • localStorage, not IndexedDB — synchronous, survives reload/crash, no async
 *     failure surface. The payloads are tiny (one coalesced op per task), so the
 *     ~5MB cap is irrelevant. Storage is injectable so this is swappable later.
 *   • Coalescing — a newer progress value for the same task REPLACES the older
 *     queued one (last-value-wins). The queue can never grow past one op per
 *     task, and we never replay a stale intermediate value.
 *   • Ordered, fail-stop flush — replay in FIFO order; on the first failure
 *     (still offline) stop and keep that op + the remainder. Nothing is dropped.
 *
 * The pure functions here (enqueueOp/flushQueue/makeProgressOp) take their
 * inputs explicitly (queue, handlers, `now`) so they are deterministic and
 * unit-tested without a clock or a browser.
 */

const STORAGE_KEY = "sbp:field:outbox:v1";

/** Op type for an idempotent schedule-task progress write. */
export const OP_SCHEDULE_PROGRESS = "schedule-progress";

/** Op type for a punchlist-item create (dedup'd by client_op_id on replay). */
export const OP_PUNCH_CREATE = "punch-create";

/**
 * A client-generated idempotency key. The SAME key rides the online create
 * attempt AND the queued offline retry, so a duplicate replay collides with the
 * server's partial-unique index (and is then treated as already-applied). Uses
 * crypto.randomUUID where available, with a non-crypto fallback that is still
 * unique enough for outbox dedup.
 */
export function newClientOpId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function localStorageAdapter() {
  return {
    read: () => {
      try {
        return typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      } catch {
        return null;
      }
    },
    write: (value) => {
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* quota / privacy mode — drop silently; the optimistic UI still holds */
      }
    },
  };
}

/** Read the persisted queue (always returns an array; tolerant of corruption). */
export function loadQueue(storage = localStorageAdapter()) {
  try {
    const raw = storage.read();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist the queue. */
export function saveQueue(queue, storage = localStorageAdapter()) {
  storage.write(JSON.stringify(Array.isArray(queue) ? queue : []));
}

/**
 * Add an op to the queue, coalescing by `coalesceKey`: any existing op with the
 * same key is dropped so only the latest value for a given target survives.
 * Returns a new array (pure).
 */
export function enqueueOp(queue, op) {
  const base = (Array.isArray(queue) ? queue : []).filter(
    (existing) =>
      !(op?.coalesceKey && existing?.coalesceKey === op.coalesceKey) &&
      !(op?.id && existing?.id === op.id),
  );
  base.push(op);
  return base;
}

/** Build an idempotent schedule-progress op (caller supplies `now`). */
export function makeProgressOp(taskId, pct, now) {
  return {
    id: `${OP_SCHEDULE_PROGRESS}:${taskId}:${now}`,
    type: OP_SCHEDULE_PROGRESS,
    coalesceKey: `${OP_SCHEDULE_PROGRESS}:${taskId}`,
    payload: { id: taskId, pct },
    createdAt: now,
  };
}

/**
 * Build a punchlist-create op. The op id IS the client_op_id (which the payload
 * also carries) so the queue itself can't hold the same create twice, and the
 * server dedups a replay against its partial-unique index. No coalesceKey —
 * distinct creates must never collapse into one.
 */
export function makePunchCreateOp(payload, clientOpId, now) {
  return {
    id: clientOpId,
    type: OP_PUNCH_CREATE,
    payload,
    createdAt: now,
  };
}

/**
 * Did a create fail because the row already exists (its client_op_id hit the
 * partial-unique index)? Then a PRIOR attempt actually succeeded — the replay
 * is a no-op, not an error. Postgres unique_violation is SQLSTATE 23505.
 */
export function isUniqueViolation(error) {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = String(error.message || error).toLowerCase();
  return message.includes("duplicate key") || message.includes("unique constraint");
}

/**
 * Replay the queue in order against `handlers` (a map of type -> async fn).
 * Stops at the first failing op (treated as "still offline") and keeps it plus
 * everything after it. Unknown op types are dropped (forward-compat). Returns
 * { remaining, synced, failed, error } — never throws.
 */
export async function flushQueue(queue, handlers) {
  const remaining = [...(Array.isArray(queue) ? queue : [])];
  let synced = 0;

  while (remaining.length > 0) {
    const op = remaining[0];
    const handler = handlers?.[op?.type];

    if (typeof handler !== "function") {
      remaining.shift(); // unknown/retired op type — discard, don't wedge the queue
      continue;
    }

    try {
      await handler(op.payload, op);
      remaining.shift();
      synced += 1;
    } catch (error) {
      return { remaining, synced, failed: op, error };
    }
  }

  return { remaining, synced, failed: null, error: null };
}

/**
 * Heuristic: did this write fail because we're offline (vs. a real server
 * rejection)? Offline Supabase/fetch calls surface as "TypeError: Failed to
 * fetch". A genuine 4xx/RLS error has a different shape and should NOT be
 * queued — it would just fail forever.
 */
export function isLikelyOfflineError(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error) return false;
  if (error.name === "TypeError") return true;
  const message = String(error.message || error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
}
