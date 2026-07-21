import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.101.1";

export interface MaintenanceContext {
  token_sha256: string | null;
  expected_project_ref: string | null;
  completed_at: string | null;
  founding_org_id: string | null;
}

export class MaintenanceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export function projectRefFromUrl(url: string): string {
  const hostname = new URL(url).hostname;
  const ref = hostname.split(".")[0];
  if (!/^[a-z0-9]{20}$/.test(ref)) {
    throw new MaintenanceError(503, "Maintenance function project URL is invalid.");
  }
  return ref;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function maintenanceClient(): { client: SupabaseClient; url: string } {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new MaintenanceError(503, "Maintenance function is not configured.");
  }
  return {
    url,
    client: createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export async function authorizeMaintenanceRequest(
  request: Request,
  client: SupabaseClient,
  projectUrl: string,
  jobKey: string,
): Promise<MaintenanceContext> {
  const { data, error } = await client
    .rpc("get_maintenance_job_context", { p_job_key: jobKey })
    .single();
  if (error || !data) {
    throw new MaintenanceError(503, "Maintenance job is not initialized.");
  }

  const context = data as MaintenanceContext;
  if (context.completed_at) {
    throw new MaintenanceError(410, "Maintenance job is permanently closed.");
  }

  const actualProjectRef = projectRefFromUrl(projectUrl);
  if (!context.expected_project_ref || context.expected_project_ref !== actualProjectRef) {
    throw new MaintenanceError(403, "Maintenance job is not authorized for this project.");
  }

  if (!context.token_sha256 || !/^[0-9a-f]{64}$/.test(context.token_sha256)) {
    throw new MaintenanceError(503, "Maintenance authorization is not initialized.");
  }

  const preimage = request.headers.get("x-sbp-maintenance-token") || "";
  if (preimage.length < 32 || preimage.length > 512) {
    throw new MaintenanceError(401, "Unauthorized maintenance request.");
  }
  const suppliedHash = await sha256Hex(preimage);
  if (!constantTimeHexEqual(suppliedHash, context.token_sha256)) {
    throw new MaintenanceError(401, "Unauthorized maintenance request.");
  }

  return context;
}
