import { base44 } from "@/api/base44Client";
import { normalizeSetKey } from "./submittalsUtils";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (error) =>
  String(error?.message || error?.response?.data?.error || "").toLowerCase().includes("rate limit");

export const bulkUpdateDrawings = async (updates) => {
  const sanitized = (updates || []).filter((item) => item?.id && item?.patch && Object.keys(item.patch).length);
  if (!sanitized.length) return { success: true, count: 0, results: [] };
  return base44.functions.invoke("bulkUpdateDrawings", { updates: sanitized });
};

export const runDrawingMutations = async (jobs, { batchSize = 4, pauseMs = 150, retryMs = 500 } = {}) => {
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    try {
      await Promise.all(batch.map((job) => job()));
    } catch (error) {
      if (!isRateLimitError(error)) throw error;
      await sleep(retryMs);
      for (const job of batch) {
        await job();
        await sleep(pauseMs);
      }
    }
    if (i + batchSize < jobs.length) await sleep(pauseMs);
  }
};

export const ensureDrawingSetRecord = async ({
  setName,
  sourceDrawing,
  drawingSets,
  setDrawingSets,
  activeProject,
}) => {
  const trimmedSetName = String(setName || "").trim();
  if (!trimmedSetName) return null;

  const existing = drawingSets.find((set) => normalizeSetKey(set?.set_name) === normalizeSetKey(trimmedSetName));
  if (existing) return existing;

  try {
    const created = await base44.entities.DrawingSet.create({
      set_name: trimmedSetName,
      project_id: activeProject?.id || "",
      project_name: activeProject?.name || "",
      current_revision: String(sourceDrawing?.revision_number ?? "0"),
      current_issue_date: sourceDrawing?.issue_date || "",
      current_issued_by: sourceDrawing?.issued_by || "",
      current_file_url: sourceDrawing?.file_url || "",
      sheet_count: 1,
      revision_history: "[]",
    });
    if (created?.id) {
      setDrawingSets((prev) => [created, ...prev]);
    }
    return created;
  } catch {
    return null;
  }
};

export const persistDrawingSetAssignment = async ({
  setName,
  sourceDrawing,
  drawingIds,
  activeProject,
}) => {
  const trimmedSetName = String(setName || "").trim();
  const ids = (Array.isArray(drawingIds) ? drawingIds : [drawingIds]).filter(Boolean);
  if (!trimmedSetName || !ids.length) return null;

  return base44.functions.invoke("assignDrawingSetName", {
    set_name: trimmedSetName,
    drawing_ids: ids,
    project_id: activeProject?.id || sourceDrawing?.project_id || "",
    project_name: activeProject?.name || sourceDrawing?.project_name || "",
    revision_number: String(sourceDrawing?.revision_number ?? "0"),
    issue_date: sourceDrawing?.issue_date || "",
    issued_by: sourceDrawing?.issued_by || "",
    file_url: sourceDrawing?.file_url || "",
  });
};

const normalizeIsoDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
};

const addDays = (isoDate, days) => {
  const base = normalizeIsoDate(isoDate);
  if (!base) return "";
  const next = new Date(`${base}T00:00:00`);
  if (Number.isNaN(next.getTime())) return "";
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
};

const getDrawingSetScheduleDates = ({
  setRecord,
  sourceDrawing,
  submittedDate,
  dueDate,
  returnedDate,
}) => {
  const startDate =
    normalizeIsoDate(submittedDate) ||
    normalizeIsoDate(sourceDrawing?.submitted_date) ||
    normalizeIsoDate(setRecord?.current_issue_date) ||
    normalizeIsoDate(sourceDrawing?.issue_date) ||
    new Date().toISOString().slice(0, 10);

  const finishDate =
    normalizeIsoDate(returnedDate) ||
    normalizeIsoDate(dueDate) ||
    normalizeIsoDate(sourceDrawing?.due_date) ||
    normalizeIsoDate(sourceDrawing?.return_date) ||
    addDays(startDate, 14) ||
    startDate;

  return { startDate, finishDate };
};

const getDrawingSetScheduleStatus = ({ setRecord, percentComplete, startDate }) => {
  const approvalStatus = String(setRecord?.approval_status || "").toLowerCase();
  const revisionStatus = String(setRecord?.current_revision_status || "").toLowerCase();

  if (percentComplete >= 100 || approvalStatus === "approved" || revisionStatus === "approved") {
    return "Complete";
  }

  if (startDate) return "In Progress";
  return "Not Started";
};

export const upsertDrawingSetScheduleTask = async ({
  activeProject,
  setRecord,
  setName,
  sourceDrawing,
  submittedDate,
  dueDate,
  returnedDate,
  sheetCount,
  percentComplete,
}) => {
  const resolvedSetName = String(setName || setRecord?.set_name || "").trim();
  const projectId = activeProject?.id || sourceDrawing?.project_id || setRecord?.project_id || "";
  if (!projectId || !resolvedSetName) return null;

  const { startDate, finishDate } = getDrawingSetScheduleDates({
    setRecord,
    sourceDrawing,
    submittedDate,
    dueDate,
    returnedDate,
  });

  const safePercent =
    Number.isFinite(Number(percentComplete))
      ? Math.max(0, Math.min(100, Number(percentComplete)))
      : 0;

  const taskPayload = {
    project_id: projectId,
    project_name: activeProject?.name || sourceDrawing?.project_name || setRecord?.project_name || "",
    task_name: resolvedSetName,
    task_type: "Submittal",
    phase: "Detailing",
    start_date: startDate,
    end_date: finishDate,
    status: getDrawingSetScheduleStatus({ setRecord, percentComplete: safePercent, startDate }),
    percent_complete: safePercent,
    linked_entity_type: "DrawingSet",
    linked_entity_id: setRecord?.id || "",
  };

  const existingTasks = await base44.entities.ScheduleTask.filter({ project_id: projectId }).catch(() => []);
  const existingTask = existingTasks.find((task) => {
    const linkedType = String(task?.linked_entity_type || "").trim();
    const linkedId = String(task?.linked_entity_id || "").trim();
    const taskName = String(task?.task_name || "").trim();

    if (linkedType === "DrawingSet" && setRecord?.id && linkedId === String(setRecord.id)) {
      return true;
    }

    return linkedType === "DrawingSet" && normalizeSetKey(taskName) === normalizeSetKey(resolvedSetName);
  });

  if (existingTask?.id) {
    return base44.entities.ScheduleTask.update(existingTask.id, taskPayload);
  }

  return base44.entities.ScheduleTask.create({
    ...taskPayload,
    priority: safePercent >= 100 ? "Normal" : "High",
    notes: `Auto-created from drawing set ${resolvedSetName}`,
    is_milestone: false,
  });
};
