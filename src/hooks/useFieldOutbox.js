/**
 * useFieldOutbox — React glue for the offline field outbox (see
 * src/lib/field/offlineQueue.js). Exposes the pending count + an `enqueue`,
 * and drains the queue automatically when the browser regains connectivity
 * (and once on mount, to cover a reload that happened while a backlog was
 * sitting in localStorage).
 *
 * `handlers` is a map of op-type -> async replay fn. It's read through a ref so
 * the consumer can pass a fresh object each render without re-subscribing the
 * online listener or restarting an in-flight flush.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { getActiveOrgGeneration, getActiveOrgId, subscribeActiveOrgChange } from "@/lib/activeOrg";
import { createReplayClient } from "@/lib/field/replayClient";
import {
  loadQueue,
  saveQueue,
  enqueueOp,
  flushQueue,
  reconcileAfterFlush,
  belongsToOutboxOwner,
} from "@/lib/field/offlineQueue";

/** @param {{ userId: string, orgId: string } | null} [owner] */
export function useFieldOutbox(handlers, owner = null) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const ownerKey = owner ? JSON.stringify([owner.userId, owner.orgId]) : null;
  const scopeRef = useRef(null);
  const flushingRef = useRef(null);
  // Replace the scope synchronously so an old continuation cannot publish
  // while React is committing a changed identity/readiness state.
  if (scopeRef.current?.key !== ownerKey) {
    flushingRef.current?.controller.abort();
    flushingRef.current = null;
    scopeRef.current = { key: ownerKey, owner };
  }
  const scope = scopeRef.current;
  const mountedRef = useRef(false);
  const [pendingState, setPending] = useState({ key: ownerKey, count: 0 });

  const enqueue = useCallback((op) => {
    if (!mountedRef.current || !scope?.owner || scopeRef.current !== scope ||
      getActiveOrgId() !== scope.owner.orgId) return;
    const persisted = loadQueue();
    const owned = persisted.filter((queued) => belongsToOutboxOwner(queued, scope.owner));
    const nextOwned = enqueueOp(owned, { ...op, owner: scope.owner });
    // Coalescing in one workspace must not overwrite another workspace's op
    // (or an ownerless capture retained for manual recovery).
    const next = [...persisted.filter((queued) => !belongsToOutboxOwner(queued, scope.owner)), ...nextOwned];
    saveQueue(next);
    setPending({ key: scope.key, count: nextOwned.length });
  }, [scope]);

  const flush = useCallback(async () => {
    if (!mountedRef.current || !scope?.owner || scopeRef.current !== scope ||
      getActiveOrgId() !== scope.owner.orgId) return;
    if (flushingRef.current?.scope === scope) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const queue = loadQueue().filter((op) => belongsToOutboxOwner(op, scope.owner));
    if (queue.length === 0) return;

    const run = { scope, generation: getActiveOrgGeneration(), controller: new AbortController() };
    flushingRef.current = run;
    const isActive = () => mountedRef.current && scopeRef.current === scope &&
      flushingRef.current === run && getActiveOrgId() === scope.owner.orgId &&
      getActiveOrgGeneration() === run.generation;
    const assertActive = () => {
      if (!isActive()) throw new Error("Outbox replay identity changed");
    };
    try {
      const client = await createReplayClient(scope.owner.userId, assertActive, run.controller.signal);
      assertActive();
      const result = await flushQueue(queue, handlersRef.current, assertActive, client);
      if (!isActive()) return;
      // Do NOT write result.remaining directly. `queue` was snapshotted before
      // the await, so any op the user enqueued DURING the flush (a punch item
      // captured while syncing on marginal signal) is in storage but not in
      // that snapshot — a blind write would silently destroy it. Re-read and
      // subtract only what the flush actually consumed.
      const persisted = loadQueue();
      const owned = persisted.filter((op) => belongsToOutboxOwner(op, scope.owner));
      const remainingOwned = reconcileAfterFlush(owned, queue, result.remaining);
      const remainingSet = new Set(remainingOwned);
      const merged = persisted.filter((op) => !belongsToOutboxOwner(op, scope.owner) || remainingSet.has(op));
      saveQueue(merged);
      setPending({ key: scope.key, count: remainingOwned.length });
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} field update${result.synced === 1 ? "" : "s"}`);
      }
    } catch {
      // Unresolved/replaced auth leaves captures queued for their original
      // owner. A cancelled run must not publish even a failure notification.
    } finally {
      if (flushingRef.current === run) flushingRef.current = null;
    }
  }, [scope]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    mountedRef.current = true;
    const unsubscribe = subscribeActiveOrgChange(() => {
      flushingRef.current?.controller.abort();
      flushingRef.current = null;
      setPending({ key: null, count: 0 });
    });
    setPending({ key: scope?.key, count: loadQueue().filter((op) => belongsToOutboxOwner(op, scope?.owner)).length });
    const onOnline = () => {
      flush();
    };
    window.addEventListener("online", onOnline);
    flush(); // drain any backlog left from a previous (offline) session
    return () => {
      mountedRef.current = false;
      flushingRef.current?.controller.abort();
      flushingRef.current = null;
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [flush, scope]);

  const pending = pendingState.key === ownerKey ? pendingState.count : 0;
  return { pending, enqueue, flush };
}
