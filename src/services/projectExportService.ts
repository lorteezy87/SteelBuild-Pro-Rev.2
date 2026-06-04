/**
 * projectExportService.ts — pure, runtime-agnostic logic for the project
 * export / backup feature.
 *
 * The actual data fetch + audit write live in the `project-export` Supabase
 * Edge Function (supabase/functions/project-export/index.ts), which runs in
 * Deno and cannot import this `@/`-aliased module. To keep ONE definition of
 * the export shape and the audit-record shape, the function inlines copies of
 * these same pure helpers; this file is the canonical, unit-tested source and
 * the function comments point back here. Keep the two in lockstep.
 *
 * Nothing here touches Supabase, Deno, or the network — it only transforms
 * already-fetched rows into the export envelope and builds the audit row. That
 * keeps the security-relevant shaping (what gets exported, what the audit trail
 * records) covered by fast Node/Vitest tests.
 *
 * Security model (enforced in the Edge Function, documented here):
 *   - Reads run through a JWT-scoped Supabase client (anon key + caller's
 *     Authorization header), so Postgres RLS filters every row to projects the
 *     caller can access. A user cannot export a project they cannot read.
 *   - The audit row is written with the service role so the client can neither
 *     forge nor suppress it. Every successful export is recorded.
 */

/** Schema version of the export envelope. Bump on breaking shape changes. */
export const PROJECT_EXPORT_VERSION = 1;

/**
 * The project-owned tables included in a backup, in a stable order. Each entry
 * is a table whose rows carry a `project_id` and are protected by project-
 * membership RLS, so selecting `*` filtered by `project_id` under the caller's
 * JWT returns only rows the caller is already entitled to read.
 *
 * `activities` is intentionally EXCLUDED: it is the audit trail itself, and an
 * export should not recursively dump (or be able to rewrite the meaning of) the
 * audit log. The `projects` row is exported separately as the envelope header.
 */
export const PROJECT_EXPORT_TABLES: readonly string[] = [
  "drawings",
  "drawing_sets",
  "submittals",
  "submittal_rounds",
  "rfis",
  "change_orders",
  "work_packages",
  "schedule_tasks",
  "sov_items",
  "expenses",
  "cost_codes",
  "deliveries",
  "daily_logs",
  "punchlist_items",
  "alerts",
] as const;

export interface ProjectExportTableResult {
  table: string;
  rows: Record<string, unknown>[];
}

export interface ProjectExportEnvelope {
  export_version: number;
  exported_at: string;
  exported_by: string;
  project: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
  row_counts: Record<string, number>;
  total_rows: number;
}

export interface BuildProjectExportArgs {
  project: Record<string, unknown>;
  tableResults: ProjectExportTableResult[];
  exportedBy: string;
  /** Defaults to now; injectable for deterministic tests. */
  exportedAt?: string;
}

/**
 * Assemble the export envelope from the project header row and the per-table
 * row sets the Edge Function fetched under RLS. Pure: deterministic given its
 * inputs, no I/O.
 */
export function buildProjectExport(args: BuildProjectExportArgs): ProjectExportEnvelope {
  const exportedAt = args.exportedAt ?? new Date().toISOString();
  const tables: Record<string, Record<string, unknown>[]> = {};
  const rowCounts: Record<string, number> = {};
  let totalRows = 0;

  for (const result of args.tableResults) {
    const rows = Array.isArray(result.rows) ? result.rows : [];
    tables[result.table] = rows;
    rowCounts[result.table] = rows.length;
    totalRows += rows.length;
  }

  return {
    export_version: PROJECT_EXPORT_VERSION,
    exported_at: exportedAt,
    exported_by: args.exportedBy,
    project: args.project ?? {},
    tables,
    row_counts: rowCounts,
    total_rows: totalRows,
  };
}

/** Best-effort human-readable project name for the audit description. */
export function getExportProjectName(project: Record<string, unknown> | null | undefined): string {
  if (!project) return "project";
  const name = project.name ?? project.project_name ?? project.title;
  return typeof name === "string" && name.trim() ? name.trim() : "project";
}

export interface ExportAuditRecord {
  project_id: string;
  project_name: string;
  entity_type: "Project";
  entity_id: string;
  action: "exported";
  description: string;
  performed_by: string;
  timestamp: string;
  metadata: {
    export_version: number;
    total_rows: number;
    table_count: number;
  };
}

export interface BuildExportAuditArgs {
  projectId: string;
  project: Record<string, unknown>;
  envelope: ProjectExportEnvelope;
  performedBy: string;
  timestamp?: string;
}

/**
 * Build the single `activities` audit row recorded for every successful export.
 * Columns are snake_case to match the activities table (see auditLogger.ts).
 * The description summarizes scope (table + row counts) without leaking any
 * row-level project data into the audit trail.
 */
export function buildExportAuditRecord(args: BuildExportAuditArgs): ExportAuditRecord {
  const tableCount = Object.keys(args.envelope.tables).length;
  const projectName = getExportProjectName(args.project);
  return {
    project_id: args.projectId,
    project_name: projectName,
    entity_type: "Project",
    entity_id: args.projectId,
    action: "exported",
    description:
      `Exported project backup — ${args.envelope.total_rows} rows across ` +
      `${tableCount} tables`,
    performed_by: args.performedBy,
    timestamp: args.timestamp ?? new Date().toISOString(),
    metadata: {
      export_version: args.envelope.export_version,
      total_rows: args.envelope.total_rows,
      table_count: tableCount,
    },
  };
}

/** Suggested download filename for the exported JSON. */
export function exportFileName(
  project: Record<string, unknown> | null | undefined,
  exportedAt: string,
): string {
  const name = getExportProjectName(project)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "project";
  const datePart = (exportedAt || "").slice(0, 10) || "export";
  return `${name}-backup-${datePart}.json`;
}
