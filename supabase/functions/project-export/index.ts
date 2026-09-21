// ─────────────────────────────────────────────────────────────────────────────
// project-export — Supabase Edge Function
//
// RLS-scoped, audited project export / backup. Returns a single JSON envelope
// containing the project header plus every project-owned table the caller is
// entitled to read, and writes ONE audit row for every successful export.
//
// Security model:
//   1. Reads run through a JWT-scoped Supabase client (anon key + the caller's
//      Authorization header). Postgres RLS therefore filters every row to
//      projects the caller can access — a user simply cannot export a project
//      they cannot read. We also do an explicit up-front access check on the
//      `projects` row so an unauthorized caller gets a clean 403 instead of an
//      empty export.
//   2. The audit row is written with the SERVICE ROLE so the client can neither
//      forge nor suppress it. Every successful export is recorded in
//      `activities` (action='exported', entity_type='Project').
//
// Preserve the deployed shared v2 contract in ./exportShape.ts.
// Table reads page to completeness under caller RLS and fail on any missing page.
// Additional storage listing lives in storage_files; files retains v2 row references.
//
// Auth: JWT-verified. Method: POST { project_id }.
//
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:
//   supabase functions deploy project-export
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { readTablePaged, readQueryPages, type ExportClient } from "./readTablePaged.ts";
import { buildProjectExport, buildExportAuditRecord, PROJECT_EXPORT_TABLES, type ProjectExportTableResult, type StorageFile } from "./exportShape.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.47";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { reportError } from "../_shared/reportError.ts";

// Additional object inventory supplements, rather than replaces, the v2 file references.
const PROJECT_EXPORT_STORAGE_BUCKETS = ["app-files", "email-attachments"] as const;
const EXPORT_PAGE_SIZE = 1000;
type ProjectExportFile = StorageFile;

// ── Auth ──────────────────────────────────────────────────────────────────────

interface AuthedUser {
  id: string;
  email: string | null;
  displayName: string;
}

/**
 * Verify the caller's JWT by hitting Supabase Auth's /user endpoint directly,
 * avoiding library-side ES256 verification lag.
 */
async function verifyJwt(
  token: string,
  supabaseUrl: string,
  anonKey: string,
): Promise<AuthedUser | null> {
  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    if (!user?.id) return null;
    const meta = user.user_metadata || {};
    return {
      id: user.id,
      email: user.email ?? null,
      displayName: meta.full_name || user.email || "Unknown user",
    };
  } catch {
    return null;
  }
}

// ── Paginated table read ───────────────────────────────────────────────────────

/**
 * Note folders are org-scoped (no project_id / no single id on the link PK).
 * Export only folders that effectively attach to this project: direct job-link
 * rows plus those folder records and their visible descendants.
 */
async function readNoteFolderExport(
  rls: SupabaseClient,
  projectId: string,
): Promise<{ results: ProjectExportTableResult[]; error: string | null }> {
  const links: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await rls
      .from("note_folder_job_links")
      .select("*")
      .eq("project_id", projectId)
      .order("folder_id", { ascending: true })
      .range(from, from + EXPORT_PAGE_SIZE - 1);
    if (error) return { results: [], error: error.message };
    const page = (data ?? []) as Record<string, unknown>[];
    links.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) break;
    from += EXPORT_PAGE_SIZE;
  }

  const folderIds = new Set<string>(
    links
      .map((row) => (typeof row.folder_id === "string" ? row.folder_id : null))
      .filter((id): id is string => Boolean(id)),
  );

  const folders: Record<string, unknown>[] = [];
  let frontier = [...folderIds];
  while (frontier.length > 0) {
    const chunk = frontier.splice(0, 100);
    const { data, error } = await rls
      .from("note_folders")
      .select("*")
      .in("id", chunk);
    if (error) return { results: [], error: error.message };
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      if (typeof row.id === "string" && !folders.some((existing) => existing.id === row.id)) {
        folders.push(row);
      }
    }
    const { rows: children, error: childErr } = await readQueryPages(async (start, end) => await rls
      .from("note_folders")
      .select("*")
      .in("parent_folder_id", chunk)
      .order("id", { ascending: true })
      .range(start, end));
    if (childErr) return { results: [], error: childErr };
    for (const row of (children ?? []) as Record<string, unknown>[]) {
      if (typeof row.id !== "string" || folderIds.has(row.id)) continue;
      folderIds.add(row.id);
      folders.push(row);
      frontier.push(row.id);
    }
  }

  return {
    results: [
      { table: "note_folder_job_links", rows: links },
      { table: "note_folders", rows: folders },
    ],
    error: null,
  };
}

// ── Storage manifest ────────────────────────────────────────────────────────────

/**
 * Best-effort list of Storage objects under the project's prefix across the
 * configured buckets, recording { bucket, path, size } per object. Bytes are
 * NEVER downloaded — only the object listing. Reads run under the RLS-scoped
 * client so storage-bucket policies apply. Failures are logged and skipped: a
 * missing manifest must not abort the (data-complete) export.
 */
async function listProjectStorageFiles(
  rls: SupabaseClient,
  projectId: string,
  orgId?: string,
): Promise<ProjectExportFile[]> {
  const files: ProjectExportFile[] = [];
  const STORAGE_PAGE = 1000;

  for (const bucket of PROJECT_EXPORT_STORAGE_BUCKETS) {
    // Recursively walk the project prefix. supabase-js storage.list() is not
    // recursive — a "folder" comes back as an entry with a null id — so we
    // descend explicitly. Read both legacy and organization-prefixed project roots.
    const prefixes: string[] = orgId ? [projectId, `${orgId}/${projectId}`] : [projectId];
    while (prefixes.length > 0) {
      const prefix = prefixes.pop() as string;
      const dir = prefix;
      let offset = 0;
      for (;;) {
        const { data, error } = await rls.storage.from(bucket).list(dir, {
          limit: STORAGE_PAGE,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) {
          console.error(`[project-export] storage list ${bucket}/${dir}: ${error.message}`);
          break; // best-effort: skip this dir/bucket, keep the export
        }
        const entries = data ?? [];
        for (const entry of entries) {
          const name = entry.name;
          if (!name) continue;
          const relPath = prefix ? `${prefix}/${name}` : name;
          // A storage "folder" placeholder has a null id; recurse into it.
          if (entry.id === null || entry.id === undefined) {
            prefixes.push(relPath);
            continue;
          }
          const size =
            typeof entry.metadata?.size === "number" ? entry.metadata.size : 0;
          files.push({ bucket, path: relPath, size });
        }
        if (entries.length < STORAGE_PAGE) break; // last page for this dir
        offset += STORAGE_PAGE;
      }
    }
  }

  return files;
}

// ── Handler ─────────────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed", req);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(401, "Unauthorized — valid JWT required", req);
  }
  const token = authHeader.slice("Bearer ".length).trim();

  let body: { project_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body", req);
  }
  const projectId = body.project_id;
  if (!projectId || typeof projectId !== "string") {
    return errorResponse(400, "project_id is required", req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return errorResponse(500, "Edge function not configured", req);
  }

  const user = await verifyJwt(token, supabaseUrl, anonKey);
  if (!user) return errorResponse(401, "Invalid or expired session", req);

  // RLS-scoped client: anon key + caller JWT. Every select below is filtered by
  // Postgres RLS to rows the caller may read.
  const rls: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Explicit access gate: fetch the project header under RLS. If the caller has
  // no access, RLS yields no row and we return 403 (rather than an empty dump).
  const { data: project, error: projectErr } = await rls
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr) {
    console.error(`[project-export] project fetch error: ${projectErr.message}`);
    return errorResponse(500, "Failed to read project", req);
  }
  if (!project) {
    // No row visible under RLS => caller is not a member (or it doesn't exist).
    return errorResponse(403, "No access to this project", req);
  }

  // Fetch each project-owned table under RLS, paging past the ~1000-row cap. A
  // per-table failure aborts the export — a partial backup that silently drops
  // rows (or a whole table) is worse than none.
  const tableResults: ProjectExportTableResult[] = [];
  for (const table of PROJECT_EXPORT_TABLES) {
    // Narrow the dynamic-table client boundary; expanding Supabase's full generic
    // query builder here exceeds Deno's type-instantiation limit.
    const { rows, error } = await readTablePaged(rls as unknown as ExportClient, table, projectId);
    if (error) {
      console.error(`[project-export] ${table} fetch error: ${error}`);
      return errorResponse(500, `Failed to read ${table}`, req);
    }
    tableResults.push({ table, rows });
  }

  const folderExport = await readNoteFolderExport(rls, projectId);
  if (folderExport.error) {
    console.error(`[project-export] note folders fetch error: ${folderExport.error}`);
    return errorResponse(500, "Failed to read note folders", req);
  }
  tableResults.push(...folderExport.results);

  // Storage manifest (paths + sizes only, never bytes). Best-effort: a failure
  // here is logged and skipped — it must not abort a data-complete export.
  const files = await listProjectStorageFiles(rls, projectId, typeof project.org_id === "string" ? project.org_id : undefined);

  const envelope = buildProjectExport({
    project: project as Record<string, unknown>,
    tableResults,
    storageFiles: files,
    exportedBy: user.displayName,
  });

  // Audit with the service role so the record cannot be forged or suppressed by
  // the client. Failure to write the audit row aborts the export — an
  // unaudited export of sensitive project data is not acceptable.
  const auditRecord = buildExportAuditRecord({
    projectId,
    project: project as Record<string, unknown>,
    envelope,
    performedBy: user.displayName,
    performedByUserId: user.id,
  });

  const admin = createClient(supabaseUrl, serviceKey);
  const { error: auditErr } = await admin.from("activities").insert(auditRecord);
  if (auditErr) {
    console.error(`[project-export] audit insert failed: ${auditErr.message}`);
    return errorResponse(500, "Failed to record export audit entry", req);
  }

  // Log scope only — never row-level project data — into function logs.
  console.log(
    `[project-export] project=${projectId} by=${user.id} ` +
      `rows=${envelope.total_rows} tables=${Object.keys(envelope.tables).length} ` +
      `files=${envelope.file_count}`,
  );

  return jsonResponse(envelope, 200, req);
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await reportError(err, "project-export", { unhandled: true });
    return errorResponse(500, `Internal error: ${message}`, req);
  }
});
