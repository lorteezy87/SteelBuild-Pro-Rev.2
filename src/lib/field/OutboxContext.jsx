import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { entities, integrations } from "@/api/supabaseClient";
import { useFieldOutbox } from "@/hooks/useFieldOutbox";
import { useAuth } from "@/lib/AuthContext";
import { useOrg } from "@/components/shared/OrgContext";
import { captureDayFromTimestamp, persistScheduleProgress } from "@/lib/field/progressSync";
import {
  OP_SCHEDULE_PROGRESS,
  OP_PUNCH_CREATE,
  OP_DAILYLOG_CREATE,
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
/** @typedef {{ pending: number, online: boolean, enqueue: (op: unknown) => void, flush: () => Promise<void> }} OutboxValue */
/** @type {import('react').Context<OutboxValue | null>} */
const OutboxContext = createContext(null);

/** @returns {OutboxValue} */
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
    [OP_SCHEDULE_PROGRESS]: async ({ id, pct, captureDay, startCaptureDay }, op, assertActive, client) => {
      // New ops persist their original local work day explicitly. The timestamp
      // fallback keeps already-queued v1 ops replayable after this deployment.
      const capturedDay = captureDay || captureDayFromTimestamp(op?.createdAt);
      await persistScheduleProgress({
        gateway: entities.ScheduleTask,
        id,
        pct,
        capturedDay,
        // Set only when this op swallowed an earlier one that had already
        // started the task, so a start and a finish captured on different
        // offline days are not both stamped with the finish day.
        startCapturedDay: startCaptureDay || null,
        assertActive,
        requestOptions: { client },
      });
      assertActive();
      invalidate(["schedule-tasks"]);
      invalidate(["field-plan-tasks"]);
    },
    [OP_PUNCH_CREATE]: async (record, _op, assertActive, client) => {
      try {
        await entities.PunchlistItem.create(record, { client });
      } catch (err) {
        // A prior attempt already created this row (same client_op_id) — the
        // replay is a no-op, not a failure. Any other error is real: rethrow so
        // flushQueue keeps the op for the next reconnect.
        if (!isUniqueViolation(err)) throw err;
      }
      assertActive();
      invalidate(["field-hub-punchlist"]);
      invalidate(["punchlist"]);
    },
    [OP_DAILYLOG_CREATE]: async (record, _op, assertActive, client) => {
      try {
        await entities.DailyLog.create(record, { client });
      } catch (err) {
        // Already created (same client_op_id hit the daily_logs partial-unique
        // index) — replay is a no-op. Any other error is real: rethrow to keep
        // the op queued.
        if (!isUniqueViolation(err)) throw err;
      }
      assertActive();
      invalidate(["daily-logs"]);
    },
    [OP_PHOTO_CREATE]: async (_payload, op, assertActive, client) => {
      await replayPhotoCreate(op, {
        getBlob: getPendingPhoto,
        uploadFile: (args) => integrations.Core.UploadFile({ ...args, client }),
        createPhoto: (record) => entities.Photo.create(record, { client }),
        deleteBlob: deletePendingPhoto,
        isUniqueViolation,
      }, assertActive);
      assertActive();
      invalidate(["field-hub-photos"]);
    },
  };
}

export function OutboxProvider({ children }) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoadingAuth, isCheckingMfa, mfaRequired,
    mfaStatusDegraded, isPasswordRecovery } = useAuth();
  const { currentOrg, isLoadingOrgs } = useOrg();
  const ready = isAuthenticated && !isLoadingAuth && !isCheckingMfa && !mfaRequired &&
    !mfaStatusDegraded && !isPasswordRecovery && !isLoadingOrgs && user?.id && currentOrg?.id;
  const owner = ready ? { userId: user.id, orgId: currentOrg.id } : null;
  const handlers = useMemo(() => makeGlobalHandlers(queryClient), [queryClient]);
  const { pending, enqueue, flush } = useFieldOutbox(handlers, owner);

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
