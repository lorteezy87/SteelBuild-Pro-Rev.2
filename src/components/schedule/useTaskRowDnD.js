import { useCallback, useRef, useState } from "react";
import { validReparentTargets } from "@/lib/schedule/hierarchy";

/** Pure: which third of a row the pointer is over. */
export function dropZoneFor(rect, clientY) {
  const rel = (clientY - rect.top) / rect.height; // 0..1
  if (rel < 0.2) return "before";
  if (rel > 0.8) return "after";
  return "nest";
}

/**
 * Native HTML5 drag-and-drop for left-panel schedule rows.
 *
 * @param {object} args
 * @param {any[]} args.tasks        flat displayed rows (in render order, with _depth)
 * @param {(p: {ids: string[], newParentId: string|null, dropIndex?: number|null}) => void} args.onReparent
 * @param {() => HTMLElement|null} args.getScrollEl  returns the scroll container
 */
export function useTaskRowDnD({ tasks, onReparent, getScrollEl }) {
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { id, zone }
  const validTargets = useRef(new Set());

  const onDragStart = useCallback((e, task) => {
    setDragId(task.id);
    validTargets.current = validReparentTargets(tasks, task.id);
    try { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; } catch {}
  }, [tasks]);

  const onDragOverRow = useCallback((e, task) => {
    if (!dragId || task.id === dragId) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const zone = dropZoneFor(rect, e.clientY);
    if (zone === "nest" && !validTargets.current.has(task.id)) {
      e.dataTransfer.dropEffect = "none";
      setDropTarget(null);
      return;
    }
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ id: task.id, zone });
    const sc = getScrollEl?.();
    if (sc) {
      const b = sc.getBoundingClientRect();
      if (e.clientY - b.top < 40) sc.scrollTop -= 12;
      else if (b.bottom - e.clientY < 40) sc.scrollTop += 12;
    }
  }, [dragId, getScrollEl]);

  const onDropRow = useCallback((e, task) => {
    e.preventDefault();
    const id = dragId;
    const target = dropTarget;
    setDragId(null);
    setDropTarget(null);
    if (!id || !target || task.id !== target.id || id === task.id) return;

    if (target.zone === "nest") {
      onReparent({ ids: [id], newParentId: task.id, dropIndex: null });
      return;
    }
    const parentId = task.parent_task_id ?? null;
    const sibs = tasks.filter((t) => (t.parent_task_id ?? null) === parentId);
    const rowIdx = sibs.findIndex((t) => t.id === task.id);
    const dropIndex = target.zone === "before" ? rowIdx : rowIdx + 1;
    onReparent({ ids: [id], newParentId: parentId, dropIndex });
  }, [dragId, dropTarget, tasks, onReparent]);

  const onDragEnd = useCallback(() => { setDragId(null); setDropTarget(null); }, []);

  return { dragId, dropTarget, onDragStart, onDragOverRow, onDropRow, onDragEnd };
}
