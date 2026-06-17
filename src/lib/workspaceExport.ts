/**
 * workspaceExport — client-side "export all my data" for the current workspace.
 *
 * Calls the RLS-scoped, audited `project-export` Edge Function once per project
 * the caller can access, then bundles the per-project envelopes into a single
 * workspace backup the user downloads as JSON. The Edge Function enforces access
 * (a user can't export a project they can't read) and writes an audit row per
 * project; this module only orchestrates, packages, and downloads.
 */
import { supabase } from "@/lib/supabase";
import type { ProjectExportEnvelope } from "@/services/projectExportService";

export interface WorkspaceExportFailure {
  project_id: string;
  name: string | null;
  error: string;
}

export interface WorkspaceExport {
  export_version: number;
  exported_at: string;
  workspace: string;
  project_count: number;
  total_rows: number;
  projects: ProjectExportEnvelope[];
  /** Projects skipped due to an error — surfaced so a backup is never silently partial. */
  failures: WorkspaceExportFailure[];
}

export interface WorkspaceExportProject {
  id: string;
  name?: string | null;
}

/** Invoke the project-export Edge Function for one project (RLS-scoped + audited). */
export async function exportProject(projectId: string): Promise<ProjectExportEnvelope> {
  const { data, error } = await supabase.functions.invoke("project-export", {
    body: { project_id: projectId },
  });
  if (error) throw new Error(error.message || "Export failed");
  if (data && typeof data === "object" && (data as { error?: unknown }).error) {
    throw new Error(String((data as { error: unknown }).error));
  }
  return data as ProjectExportEnvelope;
}

/** Pure: bundle per-project envelopes into a workspace backup. Deterministic given its inputs. */
export function buildWorkspaceExport(
  envelopes: ProjectExportEnvelope[],
  opts: { workspaceName?: string; exportedAt?: string; failures?: WorkspaceExportFailure[] } = {},
): WorkspaceExport {
  return {
    export_version: 1,
    exported_at: opts.exportedAt ?? new Date().toISOString(),
    workspace: opts.workspaceName?.trim() || "workspace",
    project_count: envelopes.length,
    total_rows: envelopes.reduce((sum, e) => sum + (Number(e?.total_rows) || 0), 0),
    projects: envelopes,
    failures: opts.failures ?? [],
  };
}

/**
 * Export every accessible project into one workspace backup. Resilient: a single
 * project that fails is recorded in `failures` and the rest still export.
 */
export async function exportWorkspace(
  projects: WorkspaceExportProject[],
  opts: {
    workspaceName?: string;
    onProgress?: (done: number, total: number, name: string) => void;
  } = {},
): Promise<WorkspaceExport> {
  const envelopes: ProjectExportEnvelope[] = [];
  const failures: WorkspaceExportFailure[] = [];
  const total = projects.length;
  let done = 0;
  for (const p of projects) {
    opts.onProgress?.(done, total, p.name || "project");
    try {
      envelopes.push(await exportProject(p.id));
    } catch (err) {
      failures.push({
        project_id: p.id,
        name: p.name ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    done += 1;
  }
  opts.onProgress?.(done, total, "");
  return buildWorkspaceExport(envelopes, { workspaceName: opts.workspaceName, failures });
}

/** Slugify a workspace name + date into a stable download filename. */
export function workspaceExportFileName(bundle: WorkspaceExport): string {
  const slug =
    (bundle.workspace || "workspace")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "workspace";
  const datePart = (bundle.exported_at || "").slice(0, 10) || "export";
  return `${slug}-export-${datePart}.json`;
}

/** Trigger a browser download of the workspace backup as JSON. */
export function downloadWorkspaceExport(bundle: WorkspaceExport): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = workspaceExportFileName(bundle);
  a.click();
  URL.revokeObjectURL(url);
}
