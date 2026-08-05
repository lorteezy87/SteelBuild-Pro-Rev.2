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
import { loadQueue, saveQueue, enqueueOp, flushQueue } from "@/lib/field/offlineQueue";

export function useFieldOutbox(handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const flushingRef = useRef(false);
  const [pending, setPending] = useState(() => loadQueue().length);

  const enqueue = useCallback((op) => {
    const next = enqueueOp(loadQueue(), op);
    saveQueue(next);
    setPending(next.length);
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const queue = loadQueue();
    if (queue.length === 0) return;

    flushingRef.current = true;
    try {
      const result = await flushQueue(queue, handlersRef.current);
      saveQueue(result.remaining);
      setPending(result.remaining.length);
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} field update${result.synced === 1 ? "" : "s"}`);
      }
    } finally {
      flushingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onOnline = () => {
      flush();
    };
    window.addEventListener("online", onOnline);
    flush(); // drain any backlog left from a previous (offline) session
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  return { pending, enqueue, flush };
}
