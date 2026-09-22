// Based on the authenticated live project-export v28 exportShape.ts, retrieved 2026-09-21.
// Preserve the shared production v2 envelope and table coverage when deploying Rev.2.
// Pure, runtime-agnostic export shaping for project-export. Free of Deno globals and remote imports so both the
// Edge Function and the Vitest suite (src/lib/data/exportShape.test.ts) can import it. Keep the table list in
// lockstep with the modules that exist — a table missing here is silently absent from every backup.

export const PROJECT_EXPORT_VERSION = 2;

/** Every project-scoped table the export reads (under the caller's RLS). Order = the order in the envelope. */
export const PROJECT_EXPORT_TABLES: readonly string[] = [
  "action_items",
  "activities",
  "alerts",
  "backcharge_events",
  "backcharge_tm_tickets",
  "backcharges",
  "budget_hour_items",
  "change_orders",
  "change_requests",
  "comments",
  "contacts",
  "cost_codes",
  "daily_logs",
  "deliveries",
  "document_folders",
  "documents",
  "drawing_activity",
  "drawing_analyses",
  "drawing_holds",
  "drawing_impacts",
  "drawing_links",
  "drawing_markups",
  "drawing_reviews",
  "drawing_revision_comparisons",
  "drawing_revision_summaries",
  "drawing_revisions",
  "drawing_sets",
  "drawing_signoffs",
  "drawing_transmittal_activity",
  "drawing_transmittal_items",
  "drawing_transmittals",
  "drawing_watchers",
  "drawing_zone_activity",
  "drawing_zone_dependencies",
  "drawing_zone_proposals",
  "drawing_zones",
  "drawings",
  "email_accounts",
  "email_attachments",
  "email_intake_queue",
  "email_integration_settings",
  "email_messages",
  "expenses",
  "external_file_refs",
  "external_linked_folders",
  "fab_release_log",
  "fab_release_overrides",
  "fab_releases",
  "gc_drawing_sets",
  "gc_drawings",
  "inspections",
  "linked_folders",
  "look_ahead",
  "material_requirements",
  "meetings",
  "mitigation_actions",
  "mitigation_logs",
  "model_element_links",
  "model_elements",
  "model_registry",
  "pay_application_lines",
  "pay_applications",
  "photos",
  "piece_drawing_sets",
  "piece_drawings",
  "piece_events",
  "piece_production",
  "pieces",
  "planner_action_events",
  "pma_assumptions",
  "pma_audit_logs",
  "pma_decisions",
  "production_notes",
  "project_calendars",
  "project_closeout",
  "project_handoff_items",
  "punchlist_items",
  "quality_control_records",
  "resources",
  "rfis",
  "risks",
  "safety_incidents",
  "schedule_tasks",
  "scope_items",
  "sov_items",
  "submittal_activity",
  "submittal_comment_dispositions",
  "submittal_rounds",
  "submittal_sheet_responses",
  "submittals",
  "task_dependencies",
  "uploaded_files",
  "warranties",
  "work_packages",
] as const;

/** Columns that hold Storage paths; every non-empty value lands in the file manifest so a backup can pull the bytes. */
export const FILE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  drawings: ["file_url", "thumbnail_url"],
  drawing_revisions: ["file_url", "thumbnail_url"],
  gc_drawings: ["file_url", "thumbnail_url"],
  photos: ["file_url"],
  expenses: ["receipt_path"],
  documents: ["file_url"],
  scope_items: ["file_url", "storage_path"],
  warranties: ["document_path"],
};

export interface ProjectExportTableResult { table: string; rows: Record<string, unknown>[] }
export interface StorageFile { bucket: string; path: string; size: number }
export interface ExportFileRef { table: string; row_id: string | null; column: string; path: string }
export interface ProjectExportEnvelope {
  export_version: number;
  exported_at: string;
  exported_by: string;
  project: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
  row_counts: Record<string, number>;
  total_rows: number;
  files: ExportFileRef[];
  file_count: number;
  storage_files: StorageFile[];
}

const isStoragePath = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && !v.startsWith("data:");

/** Every Storage reference across the exported rows (absolute URLs are kept verbatim — legacy rows carry them). */
export function fileManifest(tableResults: readonly ProjectExportTableResult[]): ExportFileRef[] {
  const out: ExportFileRef[] = [];
  const seen = new Set<string>();
  for (const result of tableResults) {
    const cols = FILE_COLUMNS[result.table];
    if (!cols) continue;
    for (const row of (result.rows ?? [])) {
      for (const column of cols) {
        const value = row[column];
        if (!isStoragePath(value)) continue;
        const key = `${result.table}:${column}:${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ table: result.table, row_id: typeof row.id === "string" ? row.id : null, column, path: value });
      }
    }
  }
  return out;
}

export function buildProjectExport(args: { project: Record<string, unknown>; tableResults: ProjectExportTableResult[]; exportedBy: string; exportedAt?: string; storageFiles?: StorageFile[] }): ProjectExportEnvelope {
  const exportedAt = args.exportedAt ?? new Date().toISOString();
  const tables: Record<string, Record<string, unknown>[]> = {};
  const rowCounts: Record<string, number> = {};
  let totalRows = 0;
  for (const result of args.tableResults) {
    const sourceRows = Array.isArray(result.rows) ? result.rows : [];
    // Mailbox credentials are authentication material, not project records.
    // Keep connection metadata and the v2 table shape, but never export tokens.
    const rows = result.table === "email_accounts"
      ? sourceRows.map(({ access_token: _access, refresh_token: _refresh, ...record }) => record)
      : sourceRows;
    tables[result.table] = rows;
    rowCounts[result.table] = rows.length;
    totalRows += rows.length;
  }
  const files = fileManifest(args.tableResults);
  return { export_version: PROJECT_EXPORT_VERSION, exported_at: exportedAt, exported_by: args.exportedBy, project: args.project ?? {}, tables, row_counts: rowCounts, total_rows: totalRows, files, file_count: files.length, storage_files: args.storageFiles ?? [] };
}

export function getExportProjectName(project: Record<string, unknown> | null | undefined): string {
  if (!project) return "project";
  const name = project.name ?? project.project_name ?? project.title;
  return typeof name === "string" && name.trim() ? name.trim() : "project";
}

/** The `activities` row the service role writes for every successful export — the audit the client cannot forge. */
export function buildExportAuditRecord(args: { projectId: string; project: Record<string, unknown>; envelope: ProjectExportEnvelope; performedBy: string; performedByUserId?: string | null; timestamp?: string }) {
  const tableCount = Object.keys(args.envelope.tables).length;
  return {
    project_id: args.projectId,
    project_name: getExportProjectName(args.project),
    entity_type: "Project" as const,
    entity_id: args.projectId,
    action: "exported" as const,
    description: `Exported project backup — ${args.envelope.total_rows} rows across ${tableCount} tables, ${args.envelope.files.length} file reference(s)`,
    performed_by: args.performedBy,
    performed_by_user_id: args.performedByUserId ?? null,
    timestamp: args.timestamp ?? new Date().toISOString(),
    metadata: { export_version: args.envelope.export_version, total_rows: args.envelope.total_rows, table_count: tableCount, file_count: args.envelope.files.length },
  };
}
