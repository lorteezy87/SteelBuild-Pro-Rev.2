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

import React, { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities, integrations } from "@/api/supabaseClient";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { withProjectId } from "@/lib/mutations/standardMutation";
import { useScheduleTasks } from "@/hooks/useScheduleTasks";
import PunchlistFormModal from "@/components/punchlist/PunchlistFormModal";
import { compressImage } from "@/utils/compressImage";
import { localToday } from "@/utils/dates";
import { tasksForToday, taskUrgency, clampPercent, progressPatch } from "@/lib/field/fieldToday";
import { useOutbox } from "@/lib/field/OutboxContext";
import {
  makeProgressOp,
  makePunchCreateOp,
  makePhotoCreateOp,
  newClientOpId,
  isLikelyOfflineError,
  loadQueue,
} from "@/lib/field/offlineQueue";
import { putPendingPhoto, reconcilePendingPhotos } from "@/lib/field/blobStore";
import FieldTodayControlCenter from "./fieldToday/FieldTodayControlCenter";

// ── Urgency presentation (logic-free; buckets come from the helper) ──
const URGENCY = {
  overdue: { label: "OVERDUE", color: "var(--status-error)" },
  "due-today": { label: "DUE TODAY", color: "var(--status-warning)" },
  active: { label: "ACTIVE", color: "var(--accent)" },
  unscheduled: { label: "TBD", color: "var(--text-muted)" },
  upcoming: { label: "UPCOMING", color: "var(--status-info)" },
};

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Control-center supplementary queries (photos + punchlist).
  const todayIsoForQuery = localToday();
  const { data: allPhotos = [] } = useQuery({
    queryKey: ["field-hub-photos", projectId],
    queryFn: () =>
      projectId ? entities.Photo.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });
  const { data: allPunchItems = [] } = useQuery({
    queryKey: ["field-hub-punchlist", projectId],
    queryFn: () =>
      projectId ? entities.PunchlistItem.filter({ project_id: projectId }) : [],
    enabled: !!projectId,
    staleTime: 60 * 1000,
  });

  const [ccSearch, setCcSearch] = useState("");
  const [ccStatusFilter, setCcStatusFilter] = useState("all");

  const { scheduleTasks, isLoading } = useScheduleTasks(projectId);

  const todayIso = localToday();
  const todaysWork = useMemo(
    () => tasksForToday(scheduleTasks, todayIso),
    [scheduleTasks, todayIso],
  );

  // Group the already-sorted list by urgency so a long day (lots of overdue
  // work) stays scannable — every item still shows; nothing is hidden.
  const sections = useMemo(() => {
    const order = ["overdue", "due-today", "active", "unscheduled", "upcoming"];
    const byBucket = new Map();
    for (const task of todaysWork) {
      const bucket = taskUrgency(task, todayIso);
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket).push(task);
    }
    return order
      .filter((bucket) => byBucket.has(bucket))
      .map((bucket) => ({ bucket, tasks: byBucket.get(bucket) }));
  }, [todaysWork, todayIso]);

  // ── Offline outbox: queued idempotent captures replay (in order) on reconnect.
  // The single app-wide instance lives in OutboxProvider so the queue drains from
  // ANY page, not just here (see src/lib/field/OutboxContext.jsx); this page just
  // consumes it to enqueue on a no-signal write and surface the pending count.
  const { pending: pendingSync, enqueue: enqueueOutbox, flush: flushOutbox } = useOutbox();

  // ── Task progress: optimistic write back to the schedule (offline-safe) ──
  const progressMut = useMutation({
    mutationFn: ({ id, pct }) => entities.ScheduleTask.update(id, progressPatch(pct)),
    onMutate: async ({ id, pct }) => {
      await queryClient.cancelQueries({ queryKey: ["schedule-tasks", projectId] });
      const prev = queryClient.getQueryData(["schedule-tasks", projectId]);
      const patch = progressPatch(pct);
      queryClient.setQueryData(["schedule-tasks", projectId], (old) =>
        Array.isArray(old) ? old.map((t) => (t.id === id ? { ...t, ...patch } : t)) : old,
      );
      return { prev };
    },
    onError: (err, vars, ctx) => {
      // No signal? Keep the optimistic value and queue the write for replay —
      // don't roll back (that would silently discard the foreman's tap).
      if (isLikelyOfflineError(err)) {
        enqueueOutbox(makeProgressOp(vars.id, vars.pct, Date.now()));
        toast.message("Saved offline — will sync when you're back online");
        return;
      }
      if (ctx?.prev) queryClient.setQueryData(["schedule-tasks", projectId], ctx.prev);
      toast.error("Couldn't save progress — check signal and retry");
    },
    onSuccess: () => {
      // A successful online write means we're connected — drain any backlog.
      flushOutbox();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["field-plan-tasks", projectId] });
    },
  });

  const setProgress = (task, pct) => {
    const next = clampPercent(pct);
    if (next === clampPercent(task.percent_complete)) return;
    progressMut.mutate({ id: task.id, pct: next });
  };

  // ── Quick punch add (reuses the production PunchlistFormModal + create path) ──
  // The client_op_id is minted in onSave and rides BOTH the online create and
  // the offline retry, so a replay can't mint a duplicate (server dedups it).
  const punchMut = useMutation({
    mutationFn: (data) => entities.PunchlistItem.create(withProjectId(data, projectId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-hub-punchlist", projectId] });
      queryClient.invalidateQueries({ queryKey: ["punchlist", projectId] });
      toast.success("Punch item added");
      setShowPunch(false);
      flushOutbox(); // online write succeeded → drain any backlog
    },
    onError: (err, data) => {
      if (isLikelyOfflineError(err)) {
        const record = { ...data, project_id: data.project_id || projectId };
        enqueueOutbox(makePunchCreateOp(record, record.client_op_id, Date.now()));
        toast.message("Punch saved offline — will sync when you're back online");
        setShowPunch(false);
        return;
      }
      toast.error("Couldn't add punch item");
    },
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
    let added = 0;
    let queued = 0;
    try {
      for (const raw of files) {
        const clientOpId = newClientOpId();
        const meta = {
          project_id: projectId,
          category: "Progress",
          title: "Field photo",
          location: "",
          taken_date: todayIso,
        };
        let file;
        try {
          file = await compressImage(raw);
        } catch {
          file = raw; // compression failed — upload the original
        }
        try {
          const result = await integrations.Core.UploadFile({ file, workflow: "photo" });
          await entities.Photo.create(withProjectId({
            ...meta,
            file_url: result.file_url || result.path,
            file_name: file.name,
            client_op_id: clientOpId,
          }, projectId));
          added += 1;
        } catch (err) {
          if (isLikelyOfflineError(err)) {
            try {
              await putPendingPhoto(clientOpId, file, { name: file.name, type: file.type });
              enqueueOutbox(makePhotoCreateOp(clientOpId, { ...meta, file_name: file.name }, Date.now()));
              queued += 1;
            } catch (storeErr) {
              // Couldn't persist the blob — do NOT claim it was saved offline.
              console.error("[FieldToday] offline photo store failed:", storeErr);
            }
          } else {
            console.error("[FieldToday] photo upload failed:", err);
          }
        }
      }
      if (added > 0) {
        queryClient.invalidateQueries({ queryKey: ["field-hub-photos", projectId] });
      }
      if (added > 0 && queued > 0) {
        toast.message(`${added} photo${added === 1 ? "" : "s"} added · ${queued} saved offline`);
      } else if (queued > 0) {
        toast.message(`${queued} photo${queued === 1 ? "" : "s"} saved offline — will sync when you're back online`);
      } else if (added > 0) {
        toast.success(`${added} photo${added === 1 ? "" : "s"} added`);
      } else {
        toast.error("Photo upload failed");
      }
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  // Reclaim orphaned pending-photo blobs (op already drained) once on mount.
  useEffect(() => {
    reconcilePendingPhotos(new Set(loadQueue().map((op) => op.id)));
  }, []);

  // ── Canonical Field Today control center ──────────────────────────────────────────────────
  // All existing offline outbox + photo sync logic above is UNTOUCHED.
  // We pass the real handlers through as props so the Control Center's capture
  // buttons (Add Punch, Photo, Log Activity) call the exact same mutation paths.
    const todayPhotos = allPhotos.filter((p) => p.taken_date === todayIsoForQuery);

    const modals = showPunch ? (
      <PunchlistFormModal
        projectId={projectId}
        onClose={() => setShowPunch(false)}
        onSave={(data) => punchMut.mutate({ ...data, client_op_id: newClientOpId() })}
        isSaving={punchMut.isPending}
      />
    ) : null;

    return (
      <div className="sb-dashboard-reference-page field-mobile-console">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: "none" }}
          onChange={(e) => handlePhotoFiles(e.target.files)}
        />
        <FieldTodayControlCenter
          projectName={activeProject?.name || "Field"}
          todayIso={todayIsoForQuery}
          tasks={scheduleTasks || []}
          photos={todayPhotos}
          punchItems={allPunchItems}
          pendingSync={pendingSync}
          isLoading={isLoading}
          search={ccSearch}
          onSearch={setCcSearch}
          statusFilter={ccStatusFilter}
          onStatusFilter={setCcStatusFilter}
          onSetProgress={(task, pct) => setProgress(task, pct)}
          onAddPunch={() => setShowPunch(true)}
          onAddPhoto={() => photoInputRef.current?.click()}
          onDailyLog={() => navigate("/DailyLogs?new=1")}
          onFlushOutbox={flushOutbox}
          savingTaskId={progressMut.isPending ? progressMut.variables?.id : null}
          uploadingPhoto={uploadingPhoto}
        />
        {modals}
      </div>
    );
}
