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
import { parseDateUTC, toDateOnly } from "./scheduleDateUtils";
import { addDaysUTC, isActionableScheduleTask } from "./scheduleGanttHelpers";
import { sanitizeTaskName } from "./scheduleTaskUtils";

const TASK_DRAG_THRESHOLD_PX = 4;

export function useTaskBarDrag({ onSave, saving, setSaving, PX_PER_DAY, suppressTaskClickRef, setTooltip }) {
  const [taskDrag, setTaskDrag] = useState(null);
  const taskDragRef = useRef(null);
  const dragBodyStyleRef = useRef(null);

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

    const onUp = async () => {
      const current = taskDragRef.current;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      restoreTaskDragBodyStyle();
      updateTaskDrag(null);
      if (!current?.hasMoved || current.daysDelta === 0 || !onSave) return;

      // move → shift both ends; resize-start → start only; resize-end → end only.
      const nextStart = toDateOnly(addDaysUTC(
        current.storedStart, current.mode === "resize-end" ? 0 : current.daysDelta
      ));
      const nextEnd = toDateOnly(addDaysUTC(
        current.storedEnd, current.mode === "resize-start" ? 0 : current.daysDelta
      ));
      if (!nextStart || !nextEnd) return;

      setSaving(true);
      try {
        await onSave({
          id: current.taskId,
          start_date: nextStart,
          end_date: nextEnd,
        });
      } catch {
        // The parent onSave path owns the visible failure toast.
      } finally {
        setSaving(false);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      restoreTaskDragBodyStyle();
    };
    // Rebind only when a new row begins dragging or the current zoom changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDrag?.taskId, PX_PER_DAY, onSave]);

  return { taskDrag, startTaskBarDrag };
}
