import { describe, expect, it } from "vitest";
import { buildProjectExport, buildExportAuditRecord, PROJECT_EXPORT_TABLES, fileManifest } from "./exportShape";

describe("shared production export v2 compatibility", () => {
  it("retains canonical records and shared-app tables instead of reverting to the legacy manifest", () => {
    expect(PROJECT_EXPORT_TABLES).toEqual(expect.arrayContaining([
      "pieces", "piece_drawings", "piece_drawing_sets", "piece_events", "project_calendars",
      "gc_drawing_sets", "gc_drawings", "drawing_holds", "submittal_comment_dispositions",
      "drawing_transmittal_activity", "planner_action_events", "material_requirements",
      "scope_items", "activities", "pma_decisions", "pma_assumptions", "pma_audit_logs",
    ]));
    expect(new Set(PROJECT_EXPORT_TABLES).size).toBe(PROJECT_EXPORT_TABLES.length);
  });

  it("preserves v2 file references while adding object listings separately", () => {
    const storageFiles = [{ bucket: "app-files", path: "org/project/drawing.pdf", size: 40 }];
    const envelope = buildProjectExport({
      project: { id: "project" }, exportedBy: "Staging user", storageFiles,
      tableResults: [{ table: "drawings", rows: [{ id: "sheet", file_url: "org/project/drawing.pdf" }] }],
    });
    expect(envelope.export_version).toBe(2);
    expect(envelope.files).toEqual([{ table: "drawings", row_id: "sheet", column: "file_url", path: "org/project/drawing.pdf" }]);
    expect(envelope.file_count).toBe(1);
    expect(envelope.storage_files).toEqual(storageFiles);
    expect(envelope.total_rows).toBe(1);
  });

  it("retains legacy absolute URLs, deduplicates references and excludes inline data", () => {
    expect(fileManifest([{ table: "photos", rows: [
      { id: "a", file_url: "https://legacy.example/file.jpg" },
      { id: "b", file_url: "https://legacy.example/file.jpg" },
      { id: "c", file_url: "data:image/png;base64,ignored" },
    ] }])).toEqual([{ table: "photos", row_id: "a", column: "file_url", path: "https://legacy.example/file.jpg" }]);
  });

  it("retains the verified actor id in the audit record without copying project rows", () => {
    const project = { id: "project", name: "Staging" };
    const envelope = buildProjectExport({ project, tableResults: [], exportedBy: "User" });
    const audit = buildExportAuditRecord({ projectId: "project", project, envelope, performedBy: "User", performedByUserId: "verified-user" });
    expect(audit.performed_by_user_id).toBe("verified-user");
    expect(audit.metadata.file_count).toBe(0);
    expect(audit).not.toHaveProperty("tables");
  });
});
