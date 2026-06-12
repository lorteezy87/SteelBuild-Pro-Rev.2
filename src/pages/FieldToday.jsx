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
 * Writes are ONLINE only — this slice deliberately does not queue offline
 * (that's the deferred, data-loss-risk piece). Every write reuses an existing,
 * RLS-protected entity path; no new write surface is invented here. Pure
 * date/percent/selection logic lives in src/lib/field/fieldToday.js (tested).
 */

import React, { useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import {
  PROGRESS_STEPS,
  tasksForToday,
  taskUrgency,
  taskLabel,
  taskCrew,
  clampPercent,
} from "@/lib/field/fieldToday";

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

  // ── Task progress: optimistic write back to the schedule ──
  const progressMut = useMutation({
    mutationFn: ({ id, pct }) => {
      const percent_complete = clampPercent(pct);
      const status =
        percent_complete >= 100 ? "Complete" : percent_complete > 0 ? "In Progress" : "Not Started";
      return entities.ScheduleTask.update(id, { percent_complete, status });
    },
    onMutate: async ({ id, pct }) => {
      await queryClient.cancelQueries({ queryKey: ["schedule-tasks", projectId] });
      const prev = queryClient.getQueryData(["schedule-tasks", projectId]);
      const percent_complete = clampPercent(pct);
      const status =
        percent_complete >= 100 ? "Complete" : percent_complete > 0 ? "In Progress" : "Not Started";
      queryClient.setQueryData(["schedule-tasks", projectId], (old) =>
        Array.isArray(old)
          ? old.map((t) => (t.id === id ? { ...t, percent_complete, status } : t))
          : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["schedule-tasks", projectId], ctx.prev);
      toast.error("Couldn't save progress — check signal and retry");
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
  const punchMut = useMutation({
    mutationFn: (data) =>
      entities.PunchlistItem.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-hub-punchlist", projectId] });
      queryClient.invalidateQueries({ queryKey: ["punchlist", projectId] });
      toast.success("Punch item added");
      setShowPunch(false);
    },
    onError: () => toast.error("Couldn't add punch item"),
  });

  // ── Quick photo capture (camera → compress → upload → Photo row) ──
  const handlePhotoFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (!projectId) {
      toast.error("Select a project first");
      return;
    }
    setUploadingPhoto(true);
    let ok = 0;
    try {
      for (const raw of files) {
        try {
          const file = await compressImage(raw);
          const result = await integrations.Core.UploadFile({ file });
          await entities.Photo.create({
            project_id: projectId,
            category: "Progress",
            title: "Field photo",
            location: "",
            taken_date: todayIso,
            file_url: result.file_url || result.path,
            file_name: file.name,
          });
          ok += 1;
        } catch (err) {
          console.error("[FieldToday] photo upload failed:", err);
        }
      }
      if (ok > 0) {
        queryClient.invalidateQueries({ queryKey: ["field-hub-photos", projectId] });
        toast.success(`${ok} photo${ok === 1 ? "" : "s"} added`);
      } else {
        toast.error("Photo upload failed");
      }
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

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
          onSave={(data) => punchMut.mutate(data)}
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
