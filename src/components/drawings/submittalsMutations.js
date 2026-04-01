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
