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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities, integrations } from "@/api/supabaseClient";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useScheduleTasks } from "@/hooks/useScheduleTasks";
import { CommandBar } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import PunchlistFormModal from "@/components/punchlist/PunchlistFormModal";
import { compressImage } from "@/utils/compressImage";
import { localToday } from "@/utils/dates";
import {
  ClipboardList,
  Camera,
  ClipboardCheck,
  CalendarClock,
  Users,
  CheckCircle2,
  WifiOff,
} from "lucide-react";
import {
  PROGRESS_STEPS,
  tasksForToday,
  taskUrgency,
  taskLabel,
  taskCrew,
  clampPercent,
  progressPatch,
} from "@/lib/field/fieldToday";
import { useFieldOutbox } from "@/hooks/useFieldOutbox";
import {
  makeProgressOp,
  makePunchCreateOp,
  makePhotoCreateOp,
  newClientOpId,
  isLikelyOfflineError,
  isUniqueViolation,
  OP_SCHEDULE_PROGRESS,
  OP_PUNCH_CREATE,
  OP_PHOTO_CREATE,
} from "@/lib/field/offlineQueue";
import { loadQueue } from "@/lib/field/offlineQueue";
import { replayPhotoCreate } from "@/lib/field/photoSync";
import {
  putPendingPhoto,
  getPendingPhoto,
  deletePendingPhoto,
  reconcilePendingPhotos,
} from "@/lib/field/blobStore";

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

  // ── Offline outbox: queue idempotent progress writes when there's no signal,
  // replay them (in order) on reconnect. Only progress is queued — replaying a
  // "set task X to N%" is safe to repeat; creates are not (see offlineQueue.js).
  const outboxHandlers = useMemo(
    () => ({
      [OP_SCHEDULE_PROGRESS]: async ({ id, pct }) => {
        await entities.ScheduleTask.update(id, progressPatch(pct));
        queryClient.invalidateQueries({ queryKey: ["schedule-tasks", projectId] });
        queryClient.invalidateQueries({ queryKey: ["field-plan-tasks", projectId] });
      },
      [OP_PUNCH_CREATE]: async (record) => {
        try {
          await entities.PunchlistItem.create(record);
        } catch (err) {
          // A prior attempt already created this row (same client_op_id) — the
          // replay is a no-op, not a failure. Any other error is real: rethrow
          // so the op stays queued for the next reconnect.
          if (!isUniqueViolation(err)) throw err;
        }
        queryClient.invalidateQueries({ queryKey: ["field-hub-punchlist", projectId] });
        queryClient.invalidateQueries({ queryKey: ["punchlist", projectId] });
      },
      [OP_PHOTO_CREATE]: async (_payload, op) => {
        await replayPhotoCreate(op, {
          getBlob: getPendingPhoto,
          uploadFile: integrations.Core.UploadFile,
          createPhoto: entities.Photo.create,
          deleteBlob: deletePendingPhoto,
          isUniqueViolation,
        });
        queryClient.invalidateQueries({ queryKey: ["field-hub-photos", projectId] });
      },
    }),
    [queryClient, projectId],
  );
  const { pending: pendingSync, enqueue: enqueueOutbox, flush: flushOutbox } = useFieldOutbox(outboxHandlers);

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
    mutationFn: (data) =>
      entities.PunchlistItem.create({ ...data, project_id: data.project_id || projectId }),
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
          const result = await integrations.Core.UploadFile({ file });
          await entities.Photo.create({
            ...meta,
            file_url: result.file_url || result.path,
            file_name: file.name,
            client_op_id: clientOpId,
          });
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

  // ── States ──
  if (!projectId) {
    return (
      <div className="page-content field-mobile-console" style={{ padding: 16 }}>
        <CommandBar eyebrow="Field" title="Field Today" />
        <div className="sbd-card" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
          Pick a project from the top bar to capture today's field progress.
        </div>
      </div>
    );
  }

  return (
    <div className="page-content field-mobile-console" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <CommandBar
        eyebrow={activeProject?.name || "Field"}
        title="Field Today"
        count={todaysWork.length}
        unit=" open"
        subtitle={fmtShortDate(todayIso)}
      />

      {pendingSync > 0 && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid color-mix(in srgb, var(--status-warning) 40%, var(--border-default))",
            background: "color-mix(in srgb, var(--status-warning) 12%, var(--bg-surface-low))",
            color: "var(--text-primary)",
            fontSize: 12,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <WifiOff size={15} style={{ color: "var(--status-warning)", flexShrink: 0 }} />
            <span>
              {pendingSync} update{pendingSync === 1 ? "" : "s"} saved offline — syncs when you reconnect
            </span>
          </span>
          <button
            type="button"
            onClick={() => flushOutbox()}
            style={{
              flexShrink: 0,
              minHeight: 32,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid var(--status-warning)",
              background: "transparent",
              color: "var(--status-warning)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Sync now
          </button>
        </div>
      )}

      {/* Quick-capture rail — sticky thumb row on phones (styled in responsive.css) */}
      <div className="field-fast-capture-rail" role="group" aria-label="Quick capture">
        <button
          type="button"
          className="field-fast-action"
          style={{ "--field-action-color": "var(--status-warning)" }}
          onClick={() => setShowPunch(true)}
        >
          <span className="field-fast-action-icon"><ClipboardCheck size={18} /></span>
          <span className="field-fast-action-copy">
            <strong>Add Punch</strong>
            <small>Log a deficiency</small>
          </span>
        </button>

        <button
          type="button"
          className="field-fast-action"
          style={{ "--field-action-color": "var(--accent)" }}
          onClick={() => photoInputRef.current?.click()}
          disabled={uploadingPhoto}
        >
          <span className="field-fast-action-icon"><Camera size={18} /></span>
          <span className="field-fast-action-copy">
            <strong>{uploadingPhoto ? "Uploading…" : "Photo"}</strong>
            <small>Snap progress</small>
          </span>
        </button>

        <button
          type="button"
          className="field-fast-action"
          style={{ "--field-action-color": "var(--status-info)" }}
          onClick={() => navigate("/DailyLogs?new=1")}
        >
          <span className="field-fast-action-icon"><ClipboardList size={18} /></span>
          <span className="field-fast-action-copy">
            <strong>Daily Log</strong>
            <small>Today's report</small>
          </span>
        </button>
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handlePhotoFiles(e.target.files)}
      />

      {/* Today's work */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "4px 2px 10px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          <CalendarClock size={14} /> Today's Work
        </div>

        {isLoading ? (
          <LoadingSkeleton variant="list" />
        ) : todaysWork.length === 0 ? (
          <div
            className="sbd-card"
            style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}
          >
            <CheckCircle2 size={22} style={{ opacity: 0.6, marginBottom: 8 }} />
            <div>No open tasks scheduled for today. Nice work.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {sections.map((section) => {
              const tone = URGENCY[section.bucket] || URGENCY.active;
              return (
                <div key={section.bucket} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "2px 2px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.10em",
                      color: tone.color,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ width: 8, height: 8, borderRadius: 999, background: tone.color, flexShrink: 0 }}
                    />
                    {tone.label}
                    <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>· {section.tasks.length}</span>
                  </div>
                  {section.tasks.map((task) => (
                    <TaskCaptureCard
                      key={task.id}
                      task={task}
                      todayIso={todayIso}
                      saving={progressMut.isPending && progressMut.variables?.id === task.id}
                      onSetProgress={(pct) => setProgress(task, pct)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showPunch && (
        <PunchlistFormModal
          projectId={projectId}
          onClose={() => setShowPunch(false)}
          onSave={(data) => punchMut.mutate({ ...data, client_op_id: newClientOpId() })}
          isSaving={punchMut.isPending}
        />
      )}
    </div>
  );
}

// ── A single task row: name, crew, urgency, current %, and quick-set buttons ──
function TaskCaptureCard({ task, todayIso, saving, onSetProgress }) {
  const bucket = taskUrgency(task, todayIso);
  const tone = URGENCY[bucket] || URGENCY.active;
  const pct = clampPercent(task.percent_complete);
  const crew = taskCrew(task);

  return (
    <div
      className="sbd-card field-action-row"
      style={{
        padding: 12,
        borderLeft: `3px solid ${tone.color}`,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        opacity: saving ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text-primary)",
              lineHeight: 1.25,
            }}
          >
            {taskLabel(task)}
          </div>
          {crew && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                marginTop: 4,
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              <Users size={12} /> {crew}
            </div>
          )}
        </div>
        <span
          style={{
            flexShrink: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: "0.08em",
            color: tone.color,
            border: `1px solid ${tone.color}`,
            borderRadius: 999,
            padding: "3px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {tone.label} · {fmtShortDate(task.end_date)}
        </span>
      </div>

      {/* Progress bar + current value */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--bg-surface-low)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: tone.color, transition: "width 120ms ease" }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800, color: "var(--text-primary)", minWidth: 42, textAlign: "right" }}>
          {pct}%
        </span>
      </div>

      {/* Quick-set buttons (thumb targets) */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${PROGRESS_STEPS.length}, 1fr)`, gap: 6 }}>
        {PROGRESS_STEPS.map((step) => {
          const active = pct === step;
          return (
            <button
              key={step}
              type="button"
              disabled={saving}
              onClick={() => onSetProgress(step)}
              aria-pressed={active}
              style={{
                minHeight: 40,
                borderRadius: 8,
                border: `1px solid ${active ? tone.color : "var(--border-default)"}`,
                background: active
                  ? `color-mix(in srgb, ${tone.color} 18%, var(--bg-surface-low))`
                  : "var(--bg-surface-low)",
                color: active ? tone.color : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 800,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {step === 100 ? "Done" : `${step}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
