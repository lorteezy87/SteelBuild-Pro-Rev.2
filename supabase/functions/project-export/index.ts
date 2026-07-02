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
// The pure shaping + audit-record helpers below are the canonical, unit-tested
// versions in src/services/projectExportService.ts. That module can't be
// imported here (Deno can't resolve the `@/` alias), so the helpers are
// duplicated verbatim — keep the two in lockstep.
//   ⚠ DIVERGENCE: this copy now (a) reads every table PAGED past PostgREST's
//   ~1000-row cap, (b) exports the comprehensive project-scoped table superset,
//   and (c) adds a Storage `files` manifest (bucket/path/size) to the envelope.
//   The src/ mirror must be brought back in lockstep (table list, envelope
//   `files`/`file_count` fields) in a separate change — this task is scoped to
//   supabase/functions/ only.
//
// Auth: JWT-verified. Method: POST { project_id }.
//
// Secrets required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:
//   supabase functions deploy project-export
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.47";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

// ── Pure export shaping (mirror of src/services/projectExportService.ts) ──────

const PROJECT_EXPORT_VERSION = 1;

// Comprehensive project-scoped tenant table set. Every table listed has a
// `project_id` column; reads run under RLS, so a table the caller can't see just
// returns 0 rows (harmless). Operational-only tables (e.g. llm_telemetry) are
// deliberately excluded — a project backup is tenant data, not telemetry.
const PROJECT_EXPORT_TABLES: readonly string[] = [
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
  "drawing_impacts",
  "drawing_links",
  "drawing_markups",
  "drawing_reviews",
  "drawing_revision_comparisons",
  "drawing_revision_summaries",
  "drawing_revisions",
  "drawing_sets",
  "drawing_signoffs",
  "drawing_transmittal_items",
  "drawing_transmittals",
  "drawing_watchers",
  "drawing_zones",
  "drawing_zone_activity",
  "drawing_zone_dependencies",
  "drawing_zone_proposals",
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
  "inspections",
  "linked_folders",
  "look_ahead",
  "meetings",
  "mitigation_actions",
  "mitigation_logs",
  "model_element_links",
  "model_elements",
  "model_registry",
  "pay_application_lines",
  "pay_applications",
  "photos",
  "piece_production",
  "pma_assumptions",
  "pma_decisions",
  "production_notes",
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
  "submittal_rounds",
  "submittal_sheet_responses",
  "submittals",
  "task_dependencies",
  "uploaded_files",
  "warranties",
  "work_packages",
] as const;

// Storage buckets whose project-prefixed objects are listed in the export
// manifest (paths + sizes only — bytes are never downloaded).
const PROJECT_EXPORT_STORAGE_BUCKETS: readonly string[] = [
  "app-files",
  "email-attachments",
] as const;

// PostgREST returns at most ~1000 rows per request. Read each table in pages of
// this size and accumulate until a short page signals the end — a single
// unpaginated select silently truncates large tables.
const EXPORT_PAGE_SIZE = 1000;

interface ProjectExportTableResult {
  table: string;
  rows: Record<string, unknown>[];
}

interface ProjectExportFile {
  bucket: string;
  path: string;
  size: number;
}

interface ProjectExportEnvelope {
  export_version: number;
  exported_at: string;
  exported_by: string;
  project: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
  row_counts: Record<string, number>;
  total_rows: number;
  files: ProjectExportFile[];
  file_count: number;
}

function buildProjectExport(args: {
  project: Record<string, unknown>;
  tableResults: ProjectExportTableResult[];
  files: ProjectExportFile[];
  exportedBy: string;
  exportedAt?: string;
}): ProjectExportEnvelope {
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

  const files = Array.isArray(args.files) ? args.files : [];

  return {
    export_version: PROJECT_EXPORT_VERSION,
    exported_at: exportedAt,
    exported_by: args.exportedBy,
    project: args.project ?? {},
    tables,
    row_counts: rowCounts,
    total_rows: totalRows,
    files,
    file_count: files.length,
  };
}

function getExportProjectName(project: Record<string, unknown> | null | undefined): string {
  if (!project) return "project";
  const name = project.name ?? project.project_name ?? project.title;
  return typeof name === "string" && name.trim() ? name.trim() : "project";
}

function buildExportAuditRecord(args: {
  projectId: string;
  project: Record<string, unknown>;
  envelope: ProjectExportEnvelope;
  performedBy: string;
  timestamp?: string;
}) {
  const tableCount = Object.keys(args.envelope.tables).length;
  const projectName = getExportProjectName(args.project);
  return {
    project_id: args.projectId,
    project_name: projectName,
    entity_type: "Project" as const,
    entity_id: args.projectId,
    action: "exported" as const,
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

// ── Auth ──────────────────────────────────────────────────────────────────────

interface AuthedUser {
  id: string;
  email: string | null;
  displayName: string;
}

/**
 * Verify the caller's JWT by hitting Supabase Auth's /user endpoint directly
 * (immune to library-side ES256 verification lag — see schedule-assistant).
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

interface PaginatedReadResult {
  rows: Record<string, unknown>[];
  error: string | null;
}

/**
 * Read every row of a project-scoped table under RLS, paging through PostgREST's
 * ~1000-row cap. Accumulates fixed-size pages ordered by id until a short page
 * (fewer than EXPORT_PAGE_SIZE rows) signals the end. On any page error the whole
 * read fails — the caller aborts the export rather than shipping a partial backup.
 */
async function readTablePaged(
  rls: SupabaseClient,
  table: string,
  projectId: string,
): Promise<PaginatedReadResult> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  // Bounded loop: every iteration either appends a full page (advancing `from`)
  // or returns. A short page ends it, so it can't spin.
  for (;;) {
    const { data, error } = await rls
      .from(table)
      .select("*")
      .eq("project_id", projectId)
      .order("id", { ascending: true })
      .range(from, from + EXPORT_PAGE_SIZE - 1);
    if (error) {
      return { rows, error: error.message };
    }
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) break; // short page → last page
    from += EXPORT_PAGE_SIZE;
  }
  return { rows, error: null };
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
): Promise<ProjectExportFile[]> {
  const files: ProjectExportFile[] = [];
  const STORAGE_PAGE = 1000;

  for (const bucket of PROJECT_EXPORT_STORAGE_BUCKETS) {
    // Recursively walk the project prefix. supabase-js storage.list() is not
    // recursive — a "folder" comes back as an entry with a null id — so we
    // descend explicitly. `prefix` is relative to the project root.
    const prefixes: string[] = [""];
    while (prefixes.length > 0) {
      const prefix = prefixes.pop() as string;
      const dir = prefix ? `${projectId}/${prefix}` : projectId;
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
          files.push({ bucket, path: `${projectId}/${relPath}`, size });
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
  if (req.method !== "POST") return errorResponse(405, "Method not allowed");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(401, "Unauthorized — valid JWT required");
  }
  const token = authHeader.slice("Bearer ".length).trim();

  let body: { project_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }
  const projectId = body.project_id;
  if (!projectId || typeof projectId !== "string") {
    return errorResponse(400, "project_id is required");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return errorResponse(500, "Edge function not configured");
  }

  const user = await verifyJwt(token, supabaseUrl, anonKey);
  if (!user) return errorResponse(401, "Invalid or expired session");

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
    return errorResponse(500, "Failed to read project");
  }
  if (!project) {
    // No row visible under RLS => caller is not a member (or it doesn't exist).
    return errorResponse(403, "No access to this project");
  }

  // Fetch each project-owned table under RLS, paging past the ~1000-row cap. A
  // per-table failure aborts the export — a partial backup that silently drops
  // rows (or a whole table) is worse than none.
  const tableResults: ProjectExportTableResult[] = [];
  for (const table of PROJECT_EXPORT_TABLES) {
    const { rows, error } = await readTablePaged(rls, table, projectId);
    if (error) {
      console.error(`[project-export] ${table} fetch error: ${error}`);
      return errorResponse(500, `Failed to read ${table}`);
    }
    tableResults.push({ table, rows });
  }

  // Storage manifest (paths + sizes only, never bytes). Best-effort: a failure
  // here is logged and skipped — it must not abort a data-complete export.
  const files = await listProjectStorageFiles(rls, projectId);

  const envelope = buildProjectExport({
    project: project as Record<string, unknown>,
    tableResults,
    files,
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
  });

  const admin = createClient(supabaseUrl, serviceKey);
  const { error: auditErr } = await admin.from("activities").insert(auditRecord);
  if (auditErr) {
    console.error(`[project-export] audit insert failed: ${auditErr.message}`);
    return errorResponse(500, "Failed to record export audit entry");
  }

  // Log scope only — never row-level project data — into function logs.
  console.log(
    `[project-export] project=${projectId} by=${user.id} ` +
      `rows=${envelope.total_rows} tables=${Object.keys(envelope.tables).length} ` +
      `files=${envelope.file_count}`,
  );

  return jsonResponse(envelope);
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[project-export] Unhandled: ${message}`);
    return errorResponse(500, `Internal error: ${message}`);
  }
});
