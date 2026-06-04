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

const PROJECT_EXPORT_TABLES: readonly string[] = [
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

interface ProjectExportTableResult {
  table: string;
  rows: Record<string, unknown>[];
}

interface ProjectExportEnvelope {
  export_version: number;
  exported_at: string;
  exported_by: string;
  project: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
  row_counts: Record<string, number>;
  total_rows: number;
}

function buildProjectExport(args: {
  project: Record<string, unknown>;
  tableResults: ProjectExportTableResult[];
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

// ── Handler ─────────────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

  // Fetch each project-owned table under RLS. A per-table failure aborts the
  // export — a partial backup that silently drops a table is worse than none.
  const tableResults: ProjectExportTableResult[] = [];
  for (const table of PROJECT_EXPORT_TABLES) {
    const { data, error } = await rls.from(table).select("*").eq("project_id", projectId);
    if (error) {
      console.error(`[project-export] ${table} fetch error: ${error.message}`);
      return errorResponse(500, `Failed to read ${table}`);
    }
    tableResults.push({ table, rows: (data ?? []) as Record<string, unknown>[] });
  }

  const envelope = buildProjectExport({
    project: project as Record<string, unknown>,
    tableResults,
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
      `rows=${envelope.total_rows} tables=${Object.keys(envelope.tables).length}`,
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
