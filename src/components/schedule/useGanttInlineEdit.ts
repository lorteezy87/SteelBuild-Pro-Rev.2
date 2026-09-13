import { useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { percentCompleteOrNull } from "./scheduleTaskUtils";
import { isSummaryScheduleTask } from "./scheduleGanttHelpers";

type TaskId = string;

type EditableTask = {
  id: TaskId;
  task_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  percent_complete?: number | string | null;
  _hasChildren?: boolean;
};

export type GanttEditDraft = {
  task_name?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  percent_complete?: number | null;
};

type SaveTaskUpdate = GanttEditDraft & { id: TaskId };

type UseGanttInlineEditOptions = {
  onSave?: (update: SaveTaskUpdate) => unknown | Promise<unknown>;
};

type UseGanttInlineEditResult = {
  editingId: TaskId | null;
  editDraft: GanttEditDraft;
  setEditDraft: Dispatch<SetStateAction<GanttEditDraft>>;
  saving: boolean;
  setSaving: Dispatch<SetStateAction<boolean>>;
  startInlineEdit: (task: EditableTask, event: Pick<MouseEvent, "stopPropagation">) => void;
  commitEdit: (taskId: TaskId) => Promise<void>;
  cancelEdit: () => void;
};

export function useGanttInlineEdit({
  onSave,
}: UseGanttInlineEditOptions): UseGanttInlineEditResult {
  const [editingId, setEditingId] = useState<TaskId | null>(null);
  const [editDraft, setEditDraft] = useState<GanttEditDraft>({});
  const [saving, setSaving] = useState(false);

  const startInlineEdit = (
    task: EditableTask,
    event: Pick<MouseEvent, "stopPropagation">,
  ) => {
    event.stopPropagation();
    if (isSummaryScheduleTask(task)) return;
    setEditingId(task.id);
    setEditDraft({
      task_name: task.task_name || "",
      start_date: task.start_date || "",
      end_date: task.end_date || "",
      status: task.status || "Not Started",
      percent_complete: percentCompleteOrNull(task),
    });
  };

  const commitEdit = async (taskId: TaskId) => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave({ id: taskId, ...editDraft });
      setEditingId(null);
      setEditDraft({});
    } catch (err) {
      console.error("Gantt save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  return {
    editingId,
    editDraft,
    setEditDraft,
    saving,
    setSaving,
    startInlineEdit,
    commitEdit,
    cancelEdit,
  };
}
