/**
 * FieldToday.jsx — the thumb-first field capture lane (Phase 3, slice 1).
 *
 * Built for a superintendent/foreman standing on the steel with a phone in one
 * hand. The desktop field pages are read-and-deep-link; this surface is the
 * opposite — it answers "what do I touch today?" and lets them capture in one
 * tap without bouncing into a desktop form:
 *
 *   • Today's Work — the scheduled tasks that matter now (overdue / due today /
 *     underway / TBD), each with quick-set % buttons that write straight back
 *     to the schedule (status derives from %, mirroring the Gantt board).
 *   • Quick capture rail — Add Punch (inline modal), snap a Photo (camera),
 *     open today's Daily Log.
 *
 * Offline-safe: progress %, punch creates, and photo captures made with no
 * signal are held in an outbox (localStorage ops + IndexedDB photo blobs) and
 * replayed on reconnect — idempotent updates and client_op_id-dedup'd creates,
 * so a lost-response retry can never duplicate. Every write reuses an existing,
 * RLS-protected entity path; no new write surface is invented here. Pure
 * date/percent/selection logic lives in src/lib/field/fieldToday.js (tested);
 * the outbox in src/lib/field/offlineQueue.js + photoSync.js (tested).
 */

import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { withProjectId } from "@/lib/mutations/standardMutation";
import { useScheduleTasks } from "@/hooks/useScheduleTasks";
import PunchlistFormModal from "@/components/punchlist/PunchlistFormModal";
import { compressImage } from "@/utils/compressImage";
import { localToday } from "@/utils/dates";
import { clampPercent, progressPatch } from "@/lib/field/fieldToday";
import { useOutbox } from "@/lib/field/OutboxContext";
import {
  makeProgressOp,
  makePunchCreateOp,
  makePhotoCreateOp,
  newClientOpId,
} from "@/lib/field/offlineQueue";
import { putPendingPhoto, deletePendingPhoto } from "@/lib/field/blobStore";
import { assertUploadAllowed } from "@/lib/uploadValidation";
import FieldTodayControlCenter from "./fieldToday/FieldTodayControlCenter";

// ── Urgency presentation (logic-free; buckets come from the helper) ──
function fmtShortDate(iso) {
  if (!iso) return "TBD";
  try {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "TBD";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "TBD";
  }
}

export default function FieldToday() {
  const { activeProject } = useProjectContext();
  const projectId = useProjectId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const photoInputRef = useRef(null);

  const [showPunch, setShowPunch] = useState(false);
  const punchDraftId = useRef(null);
  useEffect(() => { setShowPunch(false); punchDraftId.current = null; }, [projectId]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Control-center supplementary queries (photos + punchlist).
  const todayIsoForQuery = localToday();
  const { data: allPhotos = [], isPending: photosPending, fetchStatus: photosFetchStatus, error: photosError, refetch: refetchPhotos } = useQuery({
    queryKey: ["field-hub-photos", projectId],
    queryFn: () =>
      projectId ? entities.Photo.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
  const { data: allPunchItems = [], isPending: punchlistPending, fetchStatus: punchlistFetchStatus, error: punchlistError, refetch: refetchPunchlist } = useQuery({
    queryKey: ["field-hub-punchlist", projectId],
    queryFn: () =>
      projectId ? entities.PunchlistItem.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });

  const [ccSearch, setCcSearch] = useState("");
  const [ccStatusFilter, setCcStatusFilter] = useState("all");

  const { scheduleTasks, isPending: tasksPending, isPaused: tasksPaused, error: tasksError, refetch: refetchTasks } = useScheduleTasks(projectId);

  // ── Offline outbox: queued idempotent captures replay (in order) on reconnect.
  // The single app-wide instance lives in OutboxProvider so the queue drains from
  // ANY page, not just here (see src/lib/field/OutboxContext.jsx); this page just
  // consumes it to enqueue on a no-signal write and surface the pending count.
  const { pending: pendingSync, enqueue: enqueueOutbox, flush: flushOutbox, assertCaptureActive } = useOutbox();

  // ── Task progress: optimistic write back to the schedule (offline-safe) ──
  const progressMut = useMutation({
    networkMode: "always",
    mutationFn: async ({ task, pct, capturedDay, enqueue, flush }) => {
      // Persist first. One ordered path prevents an old offline percentage
      // from overwriting a newer online tap.
      enqueue(makeProgressOp(task.id, pct, Date.now(), capturedDay));
      toast.message("Progress saved on this device — waiting to sync");
      await flush();
    },
    onMutate: async ({ task, pct, queryKey }) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey);
      const patch = progressPatch(pct);
      queryClient.setQueryData(queryKey, (old) =>
        Array.isArray(old) ? old.map((t) => (t.id === task.id ? { ...t, ...patch } : t)) : old,
      );
      return { prev, queryKey };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ctx.queryKey, ctx.prev);
      toast.error(err.message || "Progress was not saved. Retry when storage is available.");
    },
  });

  const setProgress = (task, pct) => {
    const next = clampPercent(pct);
    if (next === clampPercent(task.percent_complete)) return;
    // Read the local day ONCE, here, where the foreman actually tapped. The
    // online attempt and the offline fallback both reuse it: reading the clock
    // again in onError would record the next calendar day for a tap made just
    // before midnight whose request rejected just after it.
    progressMut.mutate({ task, pct: next, capturedDay: localToday(), queryKey: ["schedule-tasks", projectId], enqueue: enqueueOutbox, flush: flushOutbox });
  };

  // ── Quick punch add (reuses the production PunchlistFormModal + create path) ──
  // The client_op_id is minted in onSave and rides BOTH the online create and
  // the offline retry, so a replay can't mint a duplicate (server dedups it).
  const punchMut = useMutation({
    networkMode: "always",
    mutationFn: async ({ record, enqueue, flush }) => {
      enqueue(makePunchCreateOp(record, record.client_op_id, Date.now()));
      void flush();
    },
    onSuccess: (_result, { record }) => {
      if (record.project_id !== projectId) return;
      toast.message("Punch saved on this device — waiting to sync");
      setShowPunch(false);
      punchDraftId.current = null;
    },
    onError: (err) => toast.error(err.message || "Punch was not saved. Keep this draft open and retry."),
  });

  // ── Quick photo capture (camera → compress → upload → Photo row).
  // Offline-safe: a shot taken with no signal is held (the blob in IndexedDB, a
  // create op in the outbox) and replayed on reconnect, dedup'd by client_op_id
  // so a lost-response retry can't mint a duplicate. ──
  const handlePhotoFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (!projectId) {
      toast.error("Select a project first");
      return;
    }
    setUploadingPhoto(true);
    let queued = 0;
    let failed = 0;
    try {
      for (const raw of files) {
        const clientOpId = newClientOpId();
        let file;
        try { file = await compressImage(raw); } catch { file = raw; }
        try {
          assertCaptureActive();
          assertUploadAllowed(file, "photo");
          await putPendingPhoto(clientOpId, file, { name: file.name, type: file.type });
          // This captured callback refuses an account/workspace switch after
          // compression. All transport uses the pinned replay client.
          enqueueOutbox(makePhotoCreateOp(clientOpId, {
            project_id: projectId, category: "Progress", title: "Field photo",
            location: "", taken_date: todayIsoForQuery, file_name: file.name,
          }, Date.now()));
          queued += 1;
        } catch {
          // This key is unique to the uncommitted capture; targeted cleanup
          // cannot remove any other user's or in-flight capture's bytes.
          await deletePendingPhoto(clientOpId);
          failed += 1;
        }
      }
      if (queued > 0) {
        toast.message(queued + " photos saved on this device — waiting to sync");
        void flushOutbox();
      }
      if (failed > 0) toast.error(failed + " photos were not saved. Keep the originals and retry those photos.");
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // Never delete blobs based on a queue snapshot: a capture may be between
  // its IndexedDB write and enqueue, or the queue may be unreadable.

  if (!projectId) {
    return <section role="status" style={{ padding: 32 }}>
      <h2>Select a project</h2>
      <p>Choose a project from the project selector to view today's field work.</p>
    </section>;
  }
  const fieldError = tasksError || photosError || punchlistError;
  const taskEvidenceUnavailable = Boolean(tasksError) || tasksPaused;
  const photoEvidenceUnavailable = Boolean(photosError) || photosPending || photosFetchStatus === "paused";
  const punchEvidenceUnavailable = Boolean(punchlistError) || punchlistPending || punchlistFetchStatus === "paused";
  const incompleteEvidence = tasksPending || taskEvidenceUnavailable || photoEvidenceUnavailable || punchEvidenceUnavailable;

  // ── Canonical Field Today control center ──────────────────────────────────────────────────
  // The outbox above owns durable capture and ordered replay.
  // We pass the real handlers through as props so the Control Center's capture
  // buttons (Add Punch, Photo, Log Activity) call the exact same mutation paths.
    const todayPhotos = allPhotos.filter((p) => p.taken_date === todayIsoForQuery);

    const modals = showPunch ? (
      <PunchlistFormModal
        projectId={projectId}
        onClose={() => { setShowPunch(false); punchDraftId.current = null; }}
        onSave={(data) => {
          punchDraftId.current ||= newClientOpId();
          punchMut.mutate({ record: withProjectId({ ...data, client_op_id: punchDraftId.current }, projectId), enqueue: enqueueOutbox, flush: flushOutbox });
        }}
        isSaving={punchMut.isPending}
      />
    ) : null;

    return (
      <div className="sb-dashboard-reference-page field-mobile-console">
        <input
          ref={photoInputRef}
          type="file"
          aria-label="Capture field photo"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handlePhotoFiles(e.target.files)}
        />
        {incompleteEvidence && (
          <section role={fieldError ? "alert" : "status"} aria-label="Field Today" style={{ padding: 16, marginBottom: 12, background: "var(--bg-surface)", borderRadius: "var(--radius-card)" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{fieldError ? "Some field records are unavailable" : "Waiting for field records"}</h2>
            <p>Photo and punch capture remain available. Current totals are unavailable for records that have not refreshed.</p>
            {taskEvidenceUnavailable && scheduleTasks.length > 0 && <p>Showing cached schedule tasks; dates and progress may be stale.</p>}
            {fieldError && <button type="button" className="sbd-btn sbd-btn-secondary" onClick={() => {
              void Promise.all([refetchTasks(), refetchPhotos(), refetchPunchlist()]);
            }}>Retry</button>}
          </section>
        )}
        <FieldTodayControlCenter
          projectName={activeProject?.name || "Field"}
          todayIso={todayIsoForQuery}
          tasks={scheduleTasks || []}
          photos={todayPhotos}
          punchItems={allPunchItems}
          pendingSync={pendingSync}
          isLoading={tasksPending}
          tasksUnavailable={taskEvidenceUnavailable}
          photosUnavailable={photoEvidenceUnavailable}
          punchItemsUnavailable={punchEvidenceUnavailable}
          search={ccSearch}
          onSearch={setCcSearch}
          statusFilter={ccStatusFilter}
          onStatusFilter={setCcStatusFilter}
          onSetProgress={(task, pct) => setProgress(task, pct)}
          onAddPunch={() => setShowPunch(true)}
          onAddPhoto={() => photoInputRef.current?.click()}
          onDailyLog={() => navigate("/DailyLogs?new=1")}
          onFlushOutbox={flushOutbox}
          savingTaskId={progressMut.isPending ? progressMut.variables?.task?.id : null}
          uploadingPhoto={uploadingPhoto}
        />
        {modals}
      </div>
    );
}
