/**
 * Shared v2 project envelope and audit shaping. Reads and the mandatory audit
 * write run under the caller JWT in project-export; the database stamps the
 * verified actor. The separate workspace bundle keeps its own version 1.
 */
import { getExportProjectName, buildProjectExport, buildExportAuditRecord } from '../../supabase/functions/project-export/exportShape';
export { PROJECT_EXPORT_VERSION, PROJECT_EXPORT_TABLES, buildProjectExport, buildExportAuditRecord, getExportProjectName } from '../../supabase/functions/project-export/exportShape';
export type { ProjectExportEnvelope, ProjectExportTableResult } from '../../supabase/functions/project-export/exportShape';
export type BuildProjectExportArgs = Parameters<typeof buildProjectExport>[0];
export type BuildExportAuditArgs = Parameters<typeof buildExportAuditRecord>[0];
export type ExportAuditRecord = ReturnType<typeof buildExportAuditRecord>;

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
