// ── useTaskBarDrag — drag a Gantt bar to reschedule a task ───────────────
//
// Owns the bar-drag interaction: press a bar to move it (shift both ends) or an
// edge handle to resize (one end), with a live day-delta preview, then commit
// the new start/end via onSave on drop. Self-contained pointer handling + drag
// state, extracted from ScheduleGantt. Behaviour is byte-identical.
//
// The container keeps the shared bits and passes them in: onSave + saving /
// setSaving (the save path is shared with inline edit / sync / baseline),
// suppressTaskClickRef (so a drag doesn't also fire the row click), setTooltip
// (cleared on drag start), and PX_PER_DAY (the px↔day scale from useGanttLayout).
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { parseDateUTC, toDateOnly } from "./scheduleDateUtils";
import { addDaysUTC, isActionableScheduleTask } from "./scheduleGanttHelpers";
import { sanitizeTaskName } from "./scheduleTaskUtils";
import { computeDragLanding, describeLanding } from "./scheduleGanttDerive";

const TASK_DRAG_THRESHOLD_PX = 4;

export function useTaskBarDrag({ onSave, saving, setSaving, PX_PER_DAY, suppressTaskClickRef, setTooltip, projectTasks = [] }) {
  const [taskDrag, setTaskDrag] = useState(null);
  const taskDragRef = useRef(null);
  const dragBodyStyleRef = useRef(null);
  // Latest rows, read ONCE per gesture (in startTaskBarDrag) rather than at
  // drop. Reading it at drop would compare a start-of-gesture rendered position
  // against an end-of-gesture task set — and both realtime invalidation
  // (useScheduleTasks) and FieldToday's optimistic setQueryData can replace
  // that array mid-drag.
  const projectTasksRef = useRef(projectTasks);
  projectTasksRef.current = projectTasks;

  const updateTaskDrag = (nextOrUpdater) => {
    setTaskDrag((prev) => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
      taskDragRef.current = next;
      return next;
    });
  };

  const restoreTaskDragBodyStyle = () => {
    const prior = dragBodyStyleRef.current;
    if (!prior) return;
    document.body.style.cursor = prior.cursor;
    document.body.style.userSelect = prior.userSelect;
    dragBodyStyleRef.current = null;
  };

  const startTaskBarDrag = (event, task, visibleStart, visibleEnd, mode = "move") => {
    if (!onSave || saving || !isActionableScheduleTask(task)) return;
    if (event.button != null && event.button !== 0) return;

    const storedStart = parseDateUTC(task.start_date);
    const storedEnd = parseDateUTC(task.end_date);
    const displayStart = parseDateUTC(visibleStart);
    const displayEnd = parseDateUTC(visibleEnd);
    if (!storedStart || !storedEnd || !displayStart || !displayEnd) return;

    event.preventDefault();
    event.stopPropagation();
    suppressTaskClickRef.current = false;
    setTooltip(null);
    dragBodyStyleRef.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = mode === "move" ? "grabbing" : "ew-resize";
    document.body.style.userSelect = "none";

    updateTaskDrag({
      taskId: task.id,
      taskName: sanitizeTaskName(task),
      mode,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      storedStart,
      storedEnd,
      displayStart,
      displayEnd,
      // One snapshot per gesture — see projectTasksRef.
      projectTasks: projectTasksRef.current,
      daysDelta: 0,
      hasMoved: false,
    });
  };

  useEffect(() => {
    if (!taskDrag?.taskId) return undefined;

    const onMove = (event) => {
      const current = taskDragRef.current;
      if (!current) return;
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      let daysDelta = Math.round(dx / PX_PER_DAY);
      // When resizing one edge, clamp so it can't cross the other edge — the
      // bar keeps a non-negative duration (whole days between the stored ends).
      const durDays = Math.round((current.storedEnd - current.storedStart) / 86400000);
      if (current.mode === "resize-start") daysDelta = Math.min(daysDelta, durDays);
      else if (current.mode === "resize-end") daysDelta = Math.max(daysDelta, -durDays);
      const hasMoved = current.hasMoved ||
        Math.abs(dx) >= TASK_DRAG_THRESHOLD_PX ||
        Math.abs(dy) >= TASK_DRAG_THRESHOLD_PX;
      updateTaskDrag((prev) => prev ? {
        ...prev,
        x: event.clientX,
        y: event.clientY,
        daysDelta,
        hasMoved,
      } : prev);
      if (hasMoved) suppressTaskClickRef.current = true;
    };

    const teardown = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      restoreTaskDragBodyStyle();
      updateTaskDrag(null);
    };

    // Split from pointerup. Both used to run onUp, so a cancelled gesture
    // COMMITTED a reschedule. Nothing calls setPointerCapture on these targets,
    // so pointercancel can be the only terminal event for a real gesture —
    // discarding it silently would just trade a wrong write for a silent one.
    const onCancel = () => {
      const current = taskDragRef.current;
      teardown();
      if (current?.hasMoved && current.daysDelta !== 0) {
        toast.info(`${current.taskName}: drag cancelled — nothing was saved`, {
          id: `drag-cancel-${current.taskId}`,
        });
      }
    };

    const onUp = async () => {
      const current = taskDragRef.current;
      teardown();
      if (!current?.hasMoved || current.daysDelta === 0 || !onSave) return;

      // move → shift both ends; resize-start → start only; resize-end → end only.
      const nextStart = toDateOnly(addDaysUTC(
        current.storedStart, current.mode === "resize-end" ? 0 : current.daysDelta
      ));
      const nextEnd = toDateOnly(addDaysUTC(
        current.storedEnd, current.mode === "resize-start" ? 0 : current.daysDelta
      ));
      if (!nextStart || !nextEnd) return;

      // Predict BEFORE the write, from the gesture's own snapshot. Fails open:
      // an explanation is never allowed to break a save.
      let landing = null;
      try {
        landing = computeDragLanding({
          taskId: current.taskId,
          mode: current.mode,
          projectTasks: current.projectTasks || [],
          renderedStart: toDateOnly(current.displayStart),
          renderedEnd: toDateOnly(current.displayEnd),
          nextStart,
          nextEnd,
        });
      } catch (err) {
        console.warn("[useTaskBarDrag] landing prediction failed:", err?.message);
      }

      setSaving(true);
      try {
        await onSave({
          id: current.taskId,
          start_date: nextStart,
          end_date: nextEnd,
        });
        // Only after the save RESOLVES — a rejected save must not be explained
        // as if it had succeeded. ScheduleBody's catch owns the failure toast.
        if (landing?.landsOffTarget) {
          toast.info(`${current.taskName}: ${describeLanding(landing)}`, {
            id: `drag-landing-${current.taskId}`,
            duration: 8000,
          });
        }
      } catch {
        // ScheduleBody's onSave surfaces the failure.
      } finally {
        setSaving(false);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      restoreTaskDragBodyStyle();
    };
    // Rebind only when a new row begins dragging or the current zoom changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDrag?.taskId, PX_PER_DAY, onSave]);

  return { taskDrag, startTaskBarDrag };
}
