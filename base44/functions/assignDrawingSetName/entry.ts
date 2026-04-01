import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function normalizeSetName(value: unknown) {
  return String(value || "").trim();
}

function parseHistory(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const setName = normalizeSetName(body?.set_name);
    const drawingIds = Array.isArray(body?.drawing_ids)
      ? body.drawing_ids.filter(Boolean)
      : body?.drawing_id
        ? [body.drawing_id]
        : [];

    if (!setName || !drawingIds.length) {
      return Response.json({ error: "set_name and drawing_id or drawing_ids are required" }, { status: 400 });
    }

    const projectId = String(body?.project_id || "").trim();
    const projectName = String(body?.project_name || "").trim();
    const revisionNumber = String(body?.revision_number ?? "0").trim() || "0";
    const issueDate = String(body?.issue_date || "").trim();
    const issuedBy = String(body?.issued_by || "").trim();
    const fileUrl = String(body?.file_url || "").trim();

    const updatedDrawings = await Promise.all(
      drawingIds.map((id: string) =>
        base44.asServiceRole.entities.Drawing.update(id, { drawing_set_name: setName })
      )
    );

    const resolvedProjectId =
      projectId ||
      String(updatedDrawings.find((drawing: any) => drawing?.project_id)?.project_id || "").trim();
    const resolvedProjectName =
      projectName ||
      String(updatedDrawings.find((drawing: any) => drawing?.project_name)?.project_name || "").trim();
    const resolvedRevisionNumber =
      revisionNumber ||
      String(updatedDrawings.find((drawing: any) => drawing?.revision_number != null)?.revision_number ?? "0").trim() ||
      "0";
    const resolvedIssueDate =
      issueDate ||
      String(updatedDrawings.find((drawing: any) => drawing?.issue_date)?.issue_date || "").trim();
    const resolvedIssuedBy =
      issuedBy ||
      String(updatedDrawings.find((drawing: any) => drawing?.issued_by)?.issued_by || "").trim();
    const resolvedFileUrl =
      fileUrl ||
      String(updatedDrawings.find((drawing: any) => drawing?.file_url)?.file_url || "").trim();

    let existingSet = null;
    try {
      const sets = resolvedProjectId
        ? await base44.asServiceRole.entities.DrawingSet.filter({ project_id: resolvedProjectId })
        : await base44.asServiceRole.entities.DrawingSet.list("-created_date", 200);
      existingSet =
        sets.find(
          (set: any) =>
            normalizeSetName(set?.set_name).toLowerCase() === setName.toLowerCase() &&
            (!resolvedProjectId || String(set?.project_id || "").trim() === resolvedProjectId)
        ) || null;
    } catch {
      existingSet = null;
    }

    const projectDrawings = resolvedProjectId
      ? await base44.asServiceRole.entities.Drawing.filter({ project_id: resolvedProjectId, drawing_set_name: setName })
      : [];

    const activeProjectDrawings = projectDrawings.filter((drawing: any) => !drawing?.is_superseded);
    const sheetCount = activeProjectDrawings.length || updatedDrawings.filter((drawing: any) => !drawing?.is_superseded).length || drawingIds.length;
    const assignedSheetNumbers = (activeProjectDrawings.length ? activeProjectDrawings : updatedDrawings)
      .map((drawing: any) => String(drawing?.sheet_number || "").trim())
      .filter(Boolean);

    const mergeAssignmentHistory = (existingHistory: unknown) => {
      const history = parseHistory(existingHistory).filter((entry) => !entry?.__assignment_map);
      history.push({
        __assignment_map: true,
        drawing_ids: drawingIds,
        sheet_numbers: assignedSheetNumbers,
        updated_at: new Date().toISOString(),
      });
      return JSON.stringify(history);
    };

    if (existingSet?.id) {
      await base44.asServiceRole.entities.DrawingSet.update(existingSet.id, {
        set_name: setName,
        project_id: resolvedProjectId || existingSet.project_id || "",
        project_name: resolvedProjectName || existingSet.project_name || "",
        current_revision: existingSet.current_revision || resolvedRevisionNumber,
        current_issue_date: existingSet.current_issue_date || resolvedIssueDate,
        current_issued_by: existingSet.current_issued_by || resolvedIssuedBy,
        current_file_url: existingSet.current_file_url || resolvedFileUrl,
        sheet_count: sheetCount,
        revision_history: mergeAssignmentHistory(existingSet.revision_history),
      });
    } else {
      await base44.asServiceRole.entities.DrawingSet.create({
        set_name: setName,
        project_id: resolvedProjectId,
        project_name: resolvedProjectName,
        current_revision: resolvedRevisionNumber,
        current_issue_date: resolvedIssueDate,
        current_issued_by: resolvedIssuedBy,
        current_file_url: resolvedFileUrl,
        sheet_count: sheetCount,
        revision_history: mergeAssignmentHistory("[]"),
      });
    }

    return Response.json({ success: true, set_name: setName, drawing_ids: drawingIds, sheet_count: sheetCount });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
