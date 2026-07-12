import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { entities, integrations } from "@/api/supabaseClient";
import { useFieldOutbox } from "@/hooks/useFieldOutbox";
import { progressPatch } from "@/lib/field/fieldToday";
import {
  OP_SCHEDULE_PROGRESS,
  OP_PUNCH_CREATE,
  OP_PHOTO_CREATE,
  isUniqueViolation,
} from "@/lib/field/offlineQueue";
import { replayPhotoCreate } from "@/lib/field/photoSync";
import { getPendingPhoto, deletePendingPhoto } from "@/lib/field/blobStore";
import OfflineOutboxIndicator from "@/components/field/OfflineOutboxIndicator";

/**
 * OutboxContext / OutboxProvider — the app's single offline field-capture outbox.
 *
 * Previously each field page ran its own useFieldOutbox instance, so the only
 * surface that drained the queue on reconnect was Field Today. A capture queued
 * there wouldn't sync until the foreman navigated *back* to that page. Mounting
 * ONE instance app-wide fixes that: the queue drains on reconnect from anywhere,
 * and a single source of truth feeds the global offline/pending indicator.
 *
 * Replay handlers invalidate with PREFIX query keys (no projectId) so a replayed
 * op refreshes every project's affected lists — a safe superset of the
 * per-project invalidation the field pages do inline for their optimistic path.
 */
const OutboxContext = createContext(null);

export function useOutbox() {
  const ctx = useContext(OutboxContext);
  if (!ctx) {
    // Degrade to a no-op outside the provider (e.g. an isolated unit test) so a
    // consumer never throws. Enqueue is a no-op → the caller's optimistic write
    // simply isn't persisted offline, which is the pre-provider behaviour.
    return { pending: 0, online: true, enqueue: () => {}, flush: async () => {} };
  }
  return ctx;
}

function makeGlobalHandlers(queryClient) {
  const invalidate = (queryKey) => queryClient.invalidateQueries({ queryKey });
  return {
    [OP_SCHEDULE_PROGRESS]: async ({ id, pct }) => {
      await entities.ScheduleTask.update(id, progressPatch(pct));
      invalidate(["schedule-tasks"]);
      invalidate(["field-plan-tasks"]);
    },
    [OP_PUNCH_CREATE]: async (record) => {
      try {
        await entities.PunchlistItem.create(record);
      } catch (err) {
        // A prior attempt already created this row (same client_op_id) — the
        // replay is a no-op, not a failure. Any other error is real: rethrow so
        // flushQueue keeps the op for the next reconnect.
        if (!isUniqueViolation(err)) throw err;
      }
      invalidate(["field-hub-punchlist"]);
      invalidate(["punchlist"]);
    },
    [OP_PHOTO_CREATE]: async (_payload, op) => {
      await replayPhotoCreate(op, {
        getBlob: getPendingPhoto,
        uploadFile: integrations.Core.UploadFile,
        createPhoto: entities.Photo.create,
        deleteBlob: deletePendingPhoto,
        isUniqueViolation,
      });
      invalidate(["field-hub-photos"]);
    },
  };
}

export function OutboxProvider({ children }) {
  const queryClient = useQueryClient();
  const handlers = useMemo(() => makeGlobalHandlers(queryClient), [queryClient]);
  const { pending, enqueue, flush } = useFieldOutbox(handlers);

  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const value = useMemo(
    () => ({ pending, online, enqueue, flush }),
    [pending, online, enqueue, flush],
  );

  return (
    <OutboxContext.Provider value={value}>
      {children}
      <OfflineOutboxIndicator pending={pending} online={online} onSync={flush} />
    </OutboxContext.Provider>
  );
}
