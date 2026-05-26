/**
 * sharepoint-proxy Edge Function
 *
 * Server-side proxy for Microsoft Graph API calls (SharePoint / OneDrive).
 * Keeps OAuth tokens out of the browser — the client sends a Supabase JWT,
 * this function resolves the project's Azure AD credentials from Vault
 * secrets, calls Graph, and returns the result.
 *
 * Endpoints:
 *   POST /sharepoint-proxy
 *   Body: { action, projectId, folderId?, driveId?, siteId?, path?, fileId? }
 *
 * Actions:
 *   - "list_sites"     — search for SharePoint sites the token can see
 *   - "list_drives"    — list drives for a site
 *   - "list_children"  — list files/folders in a drive path
 *   - "get_file_meta"  — get metadata for a single file
 *   - "sync_folder"    — discover new/changed files and stage them in document_import_queue
 *
 * Auth: Supabase JWT required (via Authorization header).
 * Azure credentials: read from Supabase secrets (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ── Azure token acquisition (client_credentials flow) ────────────────────

interface TokenResult {
  access_token: string;
  expires_in: number;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAzureToken(tenantId: string): Promise<string> {
  const clientId = Deno.env.get("AZURE_CLIENT_ID");
  const clientSecret = Deno.env.get("AZURE_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error(
      "Azure AD credentials not configured. Set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in Edge Function secrets."
    );
  }

  const cacheKey = `${tenantId}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure token error (${res.status}): ${errText}`);
  }

  const data: TokenResult = await res.json();
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

// ── Graph API helpers ────────────────────────────────────────────────────

async function graphGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Graph API error (${res.status}): ${errText}`);
  }
  return res.json();
}

// ── Action handlers ─────────────────────────────────────────────────────

async function listSites(token: string, query?: string) {
  const search = query ? `?search=${encodeURIComponent(query)}` : "";
  const data = await graphGet(token, `/sites${search}`) as { value: unknown[] };
  return data.value.map((site: Record<string, unknown>) => ({
    id: site.id,
    name: site.displayName,
    webUrl: site.webUrl,
    description: site.description,
  }));
}

async function listDrives(token: string, siteId: string) {
  const data = await graphGet(token, `/sites/${siteId}/drives`) as { value: unknown[] };
  return data.value.map((drive: Record<string, unknown>) => ({
    id: drive.id,
    name: drive.name,
    driveType: drive.driveType,
    webUrl: drive.webUrl,
    quota: drive.quota,
  }));
}

async function listChildren(token: string, driveId: string, path?: string) {
  const endpoint = path
    ? `/drives/${driveId}/root:/${encodeURIComponent(path)}:/children`
    : `/drives/${driveId}/root/children`;
  const data = await graphGet(token, `${endpoint}?$top=200&$orderby=name`) as { value: unknown[] };
  return data.value.map((item: Record<string, unknown>) => ({
    id: item.id,
    name: item.name,
    size: (item as Record<string, unknown>).size,
    webUrl: item.webUrl,
    lastModifiedDateTime: item.lastModifiedDateTime,
    mimeType: (item.file as Record<string, unknown> | undefined)?.mimeType || null,
    isFolder: !!item.folder,
    childCount: (item.folder as Record<string, unknown> | undefined)?.childCount ?? null,
  }));
}

async function getFileMeta(token: string, driveId: string, fileId: string) {
  const item = await graphGet(token, `/drives/${driveId}/items/${fileId}`) as Record<string, unknown>;
  return {
    id: item.id,
    name: item.name,
    size: item.size,
    webUrl: item.webUrl,
    lastModifiedDateTime: item.lastModifiedDateTime,
    mimeType: (item.file as Record<string, unknown> | undefined)?.mimeType || null,
    createdDateTime: item.createdDateTime,
    downloadUrl: (item as Record<string, string>)["@microsoft.graph.downloadUrl"] || null,
  };
}

async function syncFolder(
  token: string,
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  folderId: string,
  driveId: string,
  path: string | null,
  provider: string,
) {
  const children = await listChildren(token, driveId, path || undefined);
  const files = children.filter((c: { isFolder: boolean }) => !c.isFolder);

  if (files.length === 0) {
    return { discovered: 0, staged: 0, skipped: 0 };
  }

  let staged = 0;
  let skipped = 0;

  for (const file of files) {
    const { data: existing } = await supabase
      .from("document_import_queue")
      .select("id, import_status")
      .eq("project_id", projectId)
      .eq("external_file_id", (file as Record<string, string>).id)
      .eq("provider", provider)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("document_import_queue").insert({
      project_id: projectId,
      linked_folder_id: folderId,
      provider,
      external_file_id: (file as Record<string, string>).id,
      external_file_url: (file as Record<string, string>).webUrl,
      file_name: (file as Record<string, string>).name,
      file_size: (file as Record<string, number>).size || null,
      mime_type: (file as Record<string, string>).mimeType || null,
      external_last_modified: (file as Record<string, string>).lastModifiedDateTime || null,
      import_status: "pending",
    });

    if (error) {
      if (error.code === "23505") {
        skipped++;
      } else {
        console.error(`Failed to stage file ${(file as Record<string, string>).name}:`, error);
      }
    } else {
      staged++;
    }
  }

  // Update linked_folder sync status
  await supabase
    .from("linked_folders")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_error: null,
    })
    .eq("id", folderId);

  return { discovered: files.length, staged, skipped };
}

// ── Authorization ────────────────────────────────────────────────────────
// This proxy talks to the DB with the service-role client (RLS bypassed), so
// any action that acts in a SteelBuild project's context MUST verify the
// caller's project membership explicitly — a valid JWT alone is not enough.
async function userHasProjectAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_projects")
    .select("id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .limit(1)
    .maybeSingle();
  return !error && !!data;
}

// Org-level SharePoint browsing (no projectId) enumerates the whole connected
// tenant's sites/drives/files via the service-role token — gate it to system
// admins so a valid JWT alone can't let any authenticated user browse it.
async function userIsSystemAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return !error && data?.role === "admin";
}

// ── Main handler ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  // Verify Supabase JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse(401, "Missing authorization header");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Verify the user's JWT
  const userToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return errorResponse(401, "Invalid or expired token");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const { action, projectId, tenantId } = body as {
    action: string;
    projectId?: string;
    tenantId?: string;
  };

  if (!action) {
    return errorResponse(400, "Missing 'action' field");
  }

  // A projectId in the request means the caller is acting in that project's
  // context (sync_folder stages files into its import queue, and the tenant is
  // resolved from its linked folders) — require membership before proceeding.
  if (projectId && !(await userHasProjectAccess(supabase, user.id, projectId))) {
    return errorResponse(403, "You do not have access to this project.");
  }

  // Org-level browse actions carry no projectId and expose the ENTIRE connected
  // tenant's SharePoint — require a system admin (these are integration-setup
  // operations, not per-project work). Closes the residual where any valid JWT
  // could enumerate the org's sites/drives/files.
  const ORG_BROWSE_ACTIONS = new Set(["list_sites", "list_drives", "list_children", "get_file_meta"]);
  if (!projectId && ORG_BROWSE_ACTIONS.has(action)) {
    if (!(await userIsSystemAdmin(supabase, user.id))) {
      return errorResponse(403, "Org-level SharePoint browsing requires a system admin.");
    }
  }

  // Resolve tenant ID — either from request body or from the linked folder
  let resolvedTenantId = tenantId as string | undefined;
  if (!resolvedTenantId && projectId) {
    const { data: folders } = await supabase
      .from("linked_folders")
      .select("tenant_id")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
      .not("tenant_id", "is", null)
      .limit(1);
    if (folders?.[0]?.tenant_id) {
      resolvedTenantId = folders[0].tenant_id;
    }
  }

  if (!resolvedTenantId) {
    const envTenant = Deno.env.get("AZURE_TENANT_ID");
    if (envTenant) {
      resolvedTenantId = envTenant;
    }
  }

  if (!resolvedTenantId) {
    return errorResponse(400, "No Azure tenant ID configured. Set AZURE_TENANT_ID in secrets or provide tenantId in the linked folder.");
  }

  try {
    const token = await getAzureToken(resolvedTenantId);

    switch (action) {
      case "list_sites": {
        const sites = await listSites(token, body.query as string | undefined);
        return jsonResponse({ sites });
      }

      case "list_drives": {
        const siteId = body.siteId as string;
        if (!siteId) return errorResponse(400, "Missing siteId");
        const drives = await listDrives(token, siteId);
        return jsonResponse({ drives });
      }

      case "list_children": {
        const driveId = body.driveId as string;
        if (!driveId) return errorResponse(400, "Missing driveId");
        const children = await listChildren(token, driveId, body.path as string | undefined);
        return jsonResponse({ children });
      }

      case "get_file_meta": {
        const driveId = body.driveId as string;
        const fileId = body.fileId as string;
        if (!driveId || !fileId) return errorResponse(400, "Missing driveId or fileId");
        const meta = await getFileMeta(token, driveId, fileId);
        return jsonResponse({ file: meta });
      }

      case "sync_folder": {
        const folderId = body.folderId as string;
        if (!folderId || !projectId) return errorResponse(400, "Missing folderId or projectId");

        // Scope the folder lookup to the validated project. The membership gate
        // above only proves the caller belongs to `projectId`; without this
        // filter a member of one project could pass a folderId owned by another
        // and sync its files (cross-project IDOR).
        const { data: folder, error: folderErr } = await supabase
          .from("linked_folders")
          .select("*")
          .eq("id", folderId)
          .eq("project_id", projectId)
          .eq("is_deleted", false)
          .single();

        if (folderErr || !folder) {
          return errorResponse(404, "Linked folder not found");
        }

        // Mark sync as pending
        await supabase
          .from("linked_folders")
          .update({ last_sync_status: "pending" })
          .eq("id", folderId);

        try {
          const result = await syncFolder(
            token,
            supabase,
            projectId,
            folderId,
            folder.external_drive_id!,
            folder.folder_path,
            folder.provider,
          );
          return jsonResponse({ sync: result });
        } catch (syncErr) {
          await supabase
            .from("linked_folders")
            .update({
              last_sync_status: "error",
              last_sync_error: (syncErr as Error).message,
              last_sync_at: new Date().toISOString(),
            })
            .eq("id", folderId);
          throw syncErr;
        }
      }

      default:
        return errorResponse(400, `Unknown action: ${action}`);
    }
  } catch (err) {
    console.error("[sharepoint-proxy]", err);
    return errorResponse(500, (err as Error).message || "Internal error");
  }
});
