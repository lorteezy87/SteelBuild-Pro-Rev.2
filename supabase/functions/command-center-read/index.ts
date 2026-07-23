import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.105.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  decodeCursor,
  encodeCursor,
  parseReadRequest,
  type SteelBuildEntityType,
  type SteelBuildReadRequest,
} from "./contract.ts";
import { normalizeSourceRow, type ProjectIdentity } from "./normalize.ts";

const MAX_REQUEST_BYTES = 32_768;
const PROJECT_IDENTITY_SELECT = "id,project_number,name";
const PROJECT_SELECT = "id,project_number,name,phase,health_status,on_hold,on_hold_reason,project_manager,target_completion_date,forecast_completion_date,start_date,updated_at,created_at,is_deleted,deleted_at";
const RFI_SELECT = "id,project_id,rfi_number,title,status,priority,assigned_to,ball_in_court,date_required,due_date,cost_impact,cost_impact_amount,schedule_impact,schedule_impact_days,updated_at,created_at,is_deleted,deleted_at";
const CHANGE_ORDER_SELECT = "id,project_id,co_number,title,status,co_amount,submitted_date,approved_date,approved_by,schedule_impact_days,updated_at,created_at,is_deleted,deleted_at";
const DRAWING_REVISION_SELECT = "id,project_id,drawing_id,sheet_number,sheet_title,revision_code,release_status,is_current,issued_at,updated_at,created_at,archived_at";
const SCHEDULE_TASK_SELECT = "id,project_id,task_name,wbs_code,status,assigned_to,resource_names,start_date,end_date,target_release,priority,blockers,percent_complete,is_milestone,milestone,updated_at,created_at";
const SUBMITTAL_SELECT = "id,project_id,submittal_number,revision,title,status,ball_in_court,reviewer,required_date,days_in_review,submitted_by,submitted_date,returned_date,approved_date,updated_at,created_at,is_deleted,deleted_at";

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return jsonResponse({ error: "POST required" }, 405, request);

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "Authenticated SteelBuild session required");
    const token = authHeader.slice("Bearer ".length).trim();
    const body = await readJson(request);
    const readRequest = parseReadRequest(body);
    const { url, anonKey, baseUrl } = requireEnvironment();
    const rls = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await rls.auth.getUser(token);
    if (userError || !userData.user) throw new HttpError(401, "Authenticated SteelBuild session required");

    const result = await readOneEntity({ rls, request: readRequest, baseUrl });
    return jsonResponse(result, 200, request);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    const message = error instanceof HttpError ? error.message : "Invalid SteelBuild read request";
    return jsonResponse({ error: message }, status, request);
  }
});

async function readOneEntity(input: {
  rls: SupabaseClient;
  request: SteelBuildReadRequest;
  baseUrl: string;
}) {
  const entityType = input.request.entityTypes[0];
  const projects = await fetchVisibleProjects(input.rls, input.request.projectIds);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const visibleProjectIds = projects.map((project) => project.id);

  if (visibleProjectIds.length === 0) {
    return emptyResponse(entityType, input.request);
  }

  const rows = await queryEntityRows({
    rls: input.rls,
    entityType,
    visibleProjectIds,
    request: input.request,
  });
  const truncated = rows.length > input.request.limitPerEntity;
  const page = rows.slice(0, input.request.limitPerEntity);
  const items = page.map((row) => {
    const project = entityType === "project"
      ? projectIdentityFromRow(row)
      : projectById.get(String(row.project_id));
    if (!project) throw new HttpError(403, "Record project is not visible to the caller");
    return normalizeSourceRow({ entityType, row, project, baseUrl: input.baseUrl });
  });
  const last = items.at(-1);
  const priorCursor = input.request.cursors?.[entityType];

  return {
    generatedAt: new Date().toISOString(),
    items,
    cursors: last === undefined
      ? (priorCursor === undefined ? {} : { [entityType]: priorCursor })
      : { [entityType]: encodeCursor({ version: 1, entityType, updatedAt: last.updatedAt, id: last.id }) },
    truncated: { [entityType]: truncated },
  };
}

async function fetchVisibleProjects(
  rls: SupabaseClient,
  requestedProjectIds?: readonly string[],
): Promise<ProjectIdentity[]> {
  const pageSize = 1_000;
  const results: ProjectIdentity[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = rls
      .from("projects")
      .select(PROJECT_IDENTITY_SELECT)
      .eq("is_deleted", false)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (requestedProjectIds !== undefined) query = query.in("id", [...requestedProjectIds]);
    const { data, error } = await query;
    if (error) throw new HttpError(error.code === "42501" ? 403 : 503, "Unable to read visible SteelBuild projects");
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    results.push(...rows.map(projectIdentityFromRow));
    if (rows.length < pageSize) break;
  }
  return results;
}

async function queryEntityRows(input: {
  rls: SupabaseClient;
  entityType: SteelBuildEntityType;
  visibleProjectIds: string[];
  request: SteelBuildReadRequest;
}): Promise<Array<Record<string, unknown>>> {
  const { table, select } = entityQueryDefinition(input.entityType);
  let query: any = input.rls.from(table).select(select);

  if (input.entityType === "project") {
    query = query.eq("is_deleted", false).is("deleted_at", null).in("id", input.visibleProjectIds);
  } else {
    query = query.in("project_id", input.visibleProjectIds);
    if (input.entityType === "rfi" || input.entityType === "change_order") {
      query = query.eq("is_deleted", false).is("deleted_at", null);
    } else if (input.entityType === "drawing_revision") {
      query = query.is("archived_at", null).eq("is_current", true);
    } else if (input.entityType === "submittal") {
      query = query.is("deleted_at", null).or("is_deleted.is.null,is_deleted.eq.false");
    }
  }

  query = query.not("updated_at", "is", null);
  const cursorValue = input.request.cursors?.[input.entityType];
  if (cursorValue !== undefined) {
    const cursor = decodeCursor(cursorValue, input.entityType);
    query = query.or(`updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`);
  } else if (input.request.updatedAfter !== undefined) {
    query = query.gt("updated_at", input.request.updatedAfter);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(input.request.limitPerEntity + 1);
  if (error) throw new HttpError(error.code === "42501" ? 403 : 503, "Unable to read SteelBuild records");
  return (data ?? []) as Array<Record<string, unknown>>;
}

function entityQueryDefinition(entityType: SteelBuildEntityType): { table: string; select: string } {
  switch (entityType) {
    case "project": return { table: "projects", select: PROJECT_SELECT };
    case "rfi": return { table: "rfis", select: RFI_SELECT };
    case "change_order": return { table: "change_orders", select: CHANGE_ORDER_SELECT };
    case "drawing_revision": return { table: "drawing_revisions", select: DRAWING_REVISION_SELECT };
    case "schedule_task": return { table: "schedule_tasks", select: SCHEDULE_TASK_SELECT };
    case "submittal": return { table: "submittals", select: SUBMITTAL_SELECT };
  }
}

function projectIdentityFromRow(row: Record<string, unknown>): ProjectIdentity {
  if (typeof row.id !== "string" || typeof row.name !== "string" || row.name.trim() === "") {
    throw new HttpError(503, "SteelBuild returned an invalid project identity");
  }
  return {
    id: row.id,
    ...(typeof row.project_number === "string" && row.project_number.trim() !== ""
      ? { number: row.project_number.trim().slice(0, 100) }
      : {}),
    name: row.name.trim().slice(0, 500),
  };
}

function emptyResponse(entityType: SteelBuildEntityType, request: SteelBuildReadRequest) {
  const priorCursor = request.cursors?.[entityType];
  return {
    generatedAt: new Date().toISOString(),
    items: [],
    cursors: priorCursor === undefined ? {} : { [entityType]: priorCursor },
    truncated: { [entityType]: false },
  };
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    throw new HttpError(413, "SteelBuild read request is too large");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "SteelBuild read request must be valid JSON");
  }
}

function requireEnvironment(): { url: string; anonKey: string; baseUrl: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const baseUrl = Deno.env.get("STEELBUILD_BASE_URL");
  if (!url || !anonKey || !baseUrl) throw new HttpError(503, "SteelBuild read service is not configured");
  return { url, anonKey, baseUrl };
}

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
