/**
 * bluebeam-proxy Edge Function
 *
 * Server-side proxy for Bluebeam Max (Studio) API calls. Keeps OAuth
 * tokens out of the browser — the client sends a Supabase JWT, this
 * function resolves the user's Bluebeam credentials from DB, calls the
 * Bluebeam API, and returns the result.
 *
 * Endpoints:
 *   POST /bluebeam-proxy
 *   Body: { action, ...params }
 *
 * Actions:
 *   OAuth:
 *     - "auth_url"         — returns the Bluebeam OAuth authorization URL
 *     - "exchange_code"    — exchanges auth code for access + refresh tokens
 *     - "connection_status"— checks if user has a valid Bluebeam connection
 *     - "disconnect"       — revokes tokens and marks connection inactive
 *
 *   Sessions:
 *     - "list_sessions"    — list sessions the user can see
 *     - "create_session"   — create a new session
 *     - "get_session"      — get session details
 *     - "end_session"      — end/close a session
 *     - "invite_user"      — invite a user to a session
 *
 *   Files:
 *     - "list_session_files"  — list files in a session
 *     - "upload_to_session"   — upload a document to a session (URL-based)
 *     - "create_snapshot"     — take a markup snapshot of a session
 *
 *   Projects (Bluebeam Projects, not SteelBuild):
 *     - "list_bb_projects"    — list Bluebeam projects
 *     - "list_project_files"  — list files in a Bluebeam project
 *
 * Auth: Supabase JWT required (via Authorization header).
 * Bluebeam credentials: per-user OAuth tokens stored in bluebeam_connections.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BB_CLIENT_ID = Deno.env.get("BLUEBEAM_CLIENT_ID") || "";
const BB_CLIENT_SECRET = Deno.env.get("BLUEBEAM_CLIENT_SECRET") || "";
const BB_REDIRECT_URI = Deno.env.get("BLUEBEAM_REDIRECT_URI") || "";

// OAuth + API endpoints are env-configurable so they can be pointed at the
// correct Bluebeam host/region without a code change. Defaults preserve the
// historical values.
const BB_AUTH_URL = Deno.env.get("BLUEBEAM_AUTH_URL") || "https://authserver.bluebeam.com/auth/oauth/authorize";
const BB_TOKEN_URL = Deno.env.get("BLUEBEAM_TOKEN_URL") || "https://authserver.bluebeam.com/auth/token";
const BB_API_BASE = Deno.env.get("BLUEBEAM_API_BASE") || "https://studioapi.bluebeam.com/publicapi/v1";

// ── PKCE helpers (Authorization Code + S256) ─────────────────────────────
// Bluebeam's OAuth requires PKCE: we generate a high-entropy code_verifier,
// send its SHA-256 challenge on /authorize, then replay the verifier on the
// token exchange. 32 random bytes → 43-char base64url string (matches spec).
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// ── Token management ────────────────────────────────────────────────────

interface BluebeamConnection {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  status: string;
}

/**
 * Get a valid access token for the user, refreshing if expired.
 * Updates the DB row if a refresh occurs.
 */
async function getValidToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ token: string; connectionId: string }> {
  const { data: conn, error } = await supabase
    .from("bluebeam_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .eq("status", "active")
    .single();

  if (error || !conn) {
    throw new Error("No active Bluebeam connection. Please connect your account first.");
  }

  const connection = conn as BluebeamConnection;

  // Check if token is expired (with 2-minute buffer)
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  const isExpired = expiresAt < Date.now() + 120_000;

  if (!isExpired) {
    // Update last_used_at
    await supabase
      .from("bluebeam_connections")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", connection.id);

    return { token: connection.access_token, connectionId: connection.id };
  }

  // Need to refresh
  if (!connection.refresh_token) {
    await supabase
      .from("bluebeam_connections")
      .update({ status: "expired", error_message: "No refresh token available" })
      .eq("id", connection.id);
    throw new Error("Bluebeam token expired and no refresh token available. Please reconnect.");
  }

  try {
    const refreshed = await refreshAccessToken(connection.refresh_token);

    await supabase
      .from("bluebeam_connections")
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || connection.refresh_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        status: "active",
        error_message: null,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return { token: refreshed.access_token, connectionId: connection.id };
  } catch (refreshErr) {
    await supabase
      .from("bluebeam_connections")
      .update({
        status: "expired",
        error_message: `Token refresh failed: ${(refreshErr as Error).message}`,
      })
      .eq("id", connection.id);
    throw new Error("Failed to refresh Bluebeam token. Please reconnect your account.");
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: BB_CLIENT_ID,
    client_secret: BB_CLIENT_SECRET,
  });

  const res = await fetch(BB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh error (${res.status}): ${errText}`);
  }

  return res.json();
}

// ── Bluebeam API helpers ────────────────────────────────────────────────

async function bbGet(token: string, path: string): Promise<unknown> {
  const res = await fetch(`${BB_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Bluebeam API error (${res.status}): ${errText}`);
  }
  return res.json();
}

async function bbPost(token: string, path: string, data: unknown): Promise<unknown> {
  const res = await fetch(`${BB_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Bluebeam API error (${res.status}): ${errText}`);
  }
  return res.json();
}

async function bbDelete(token: string, path: string): Promise<void> {
  const res = await fetch(`${BB_API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Bluebeam API error (${res.status}): ${errText}`);
  }
}

// ── OAuth action handlers ───────────────────────────────────────────────

function buildAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: BB_CLIENT_ID,
    redirect_uri: BB_REDIRECT_URI,
    scope: "offline_access full_user",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${BB_AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: BB_REDIRECT_URI,
    client_id: BB_CLIENT_ID,
    client_secret: BB_CLIENT_SECRET,
    code_verifier: codeVerifier,
  });

  const res = await fetch(BB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token exchange error (${res.status}): ${errText}`);
  }

  return res.json();
}

// ── Session action handlers ─────────────────────────────────────────────

async function listSessions(token: string) {
  const data = await bbGet(token, "/sessions") as { Sessions?: unknown[] };
  return data.Sessions || [];
}

async function createSession(
  token: string,
  name: string,
  opts: { notification?: boolean; restricted?: boolean } = {}
) {
  const payload = {
    Name: name,
    Notification: opts.notification ?? true,
    Restricted: opts.restricted ?? false,
  };
  return bbPost(token, "/sessions", payload);
}

async function getSession(token: string, sessionId: string) {
  return bbGet(token, `/sessions/${sessionId}`);
}

async function endSession(token: string, sessionId: string) {
  return bbPost(token, `/sessions/${sessionId}/end`, {});
}

async function inviteUser(token: string, sessionId: string, email: string, permission: string = "full") {
  return bbPost(token, `/sessions/${sessionId}/invite`, {
    Email: email,
    Permission: permission === "full" ? 2 : 1, // 2=Full, 1=View
    Message: "You've been invited to a Bluebeam review session via SteelBuild Pro.",
  });
}

// ── File action handlers ────────────────────────────────────────────────

async function listSessionFiles(token: string, sessionId: string) {
  const data = await bbGet(token, `/sessions/${sessionId}/files`) as { Files?: unknown[] };
  return data.Files || [];
}

async function uploadToSession(
  token: string,
  sessionId: string,
  fileUrl: string,
  fileName: string
) {
  return bbPost(token, `/sessions/${sessionId}/files`, {
    SourceUrl: fileUrl,
    Name: fileName,
  });
}

async function createSnapshot(token: string, sessionId: string) {
  return bbPost(token, `/sessions/${sessionId}/snapshot`, {});
}

// ── Project action handlers ─────────────────────────────────────────────

async function listBBProjects(token: string) {
  const data = await bbGet(token, "/projects") as { Projects?: unknown[] };
  return data.Projects || [];
}

async function listProjectFiles(token: string, projectId: string, folderId?: string) {
  const path = folderId
    ? `/projects/${projectId}/folders/${folderId}/files`
    : `/projects/${projectId}/files`;
  const data = await bbGet(token, path) as { Files?: unknown[] };
  return data.Files || [];
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

/**
 * Session-scoped actions carry only a Bluebeam `sessionId` (no SteelBuild
 * projectId), yet they read/mutate the project-owned `bluebeam_sessions`
 * record. Resolve the owning project from that record and require the caller
 * to be a member before doing the work. Returns an errorResponse to send when
 * access is denied or the session is unmapped, or null when the caller is a
 * member.
 */
async function assertSessionMembership(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
): Promise<Response | null> {
  const { data: sessionRow, error } = await supabase
    .from("bluebeam_sessions")
    .select("project_id")
    .eq("session_id", sessionId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error || !sessionRow?.project_id) {
    // Not found / unmapped — do not reveal existence; treat as no access.
    return errorResponse(403, "You do not have access to this session.");
  }

  if (!(await userHasProjectAccess(supabase, userId, sessionRow.project_id as string))) {
    return errorResponse(403, "You do not have access to this session.");
  }

  return null;
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

  const userToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return errorResponse(401, "Invalid or expired token");
  }

  // Service-role client for token storage
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const { action } = body;
  if (!action) {
    return errorResponse(400, "Missing 'action' field");
  }

  // Validate Bluebeam credentials are configured for actions that need them
  const needsConfig = action !== "connection_status";
  if (needsConfig && (!BB_CLIENT_ID || !BB_CLIENT_SECRET)) {
    return errorResponse(500, "Bluebeam API credentials not configured. Set BLUEBEAM_CLIENT_ID and BLUEBEAM_CLIENT_SECRET in Edge Function secrets.");
  }

  // Any action carrying a SteelBuild projectId (create_session, upload_to_session)
  // writes that project's data — require membership before doing the work.
  const requestProjectId = body.projectId as string | undefined;
  if (requestProjectId && !(await userHasProjectAccess(supabase, user.id, requestProjectId))) {
    return errorResponse(403, "You do not have access to this project.");
  }

  try {
    switch (action) {
      // ── OAuth actions ──────────────────────────────────────────────

      case "auth_url": {
        if (!BB_REDIRECT_URI) {
          return errorResponse(500, "BLUEBEAM_REDIRECT_URI not configured");
        }
        // Opaque random state + PKCE verifier. The verifier is parked
        // server-side keyed by state so exchange_code can replay it; it
        // never reaches the browser.
        const state = crypto.randomUUID();
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await codeChallengeS256(codeVerifier);

        // Best-effort purge of expired states (keeps the table small).
        await supabase
          .from("bluebeam_oauth_states")
          .delete()
          .lt("expires_at", new Date().toISOString());

        const { error: stateErr } = await supabase
          .from("bluebeam_oauth_states")
          .insert({ state, user_id: user.id, code_verifier: codeVerifier });
        if (stateErr) {
          console.error("[bluebeam-proxy] OAuth state insert error:", stateErr);
          return errorResponse(500, "Failed to start Bluebeam authorization");
        }

        const url = buildAuthUrl(state, codeChallenge);
        return jsonResponse({ url, state });
      }

      case "exchange_code": {
        const code = body.code as string;
        const state = body.state as string;
        if (!code) return errorResponse(400, "Missing 'code'");
        if (!state) return errorResponse(400, "Missing 'state'");

        // Recover + validate the PKCE verifier for this flow.
        const { data: stateRow } = await supabase
          .from("bluebeam_oauth_states")
          .select("user_id, code_verifier, expires_at")
          .eq("state", state)
          .maybeSingle();

        // One-time use: delete immediately regardless of validation outcome.
        await supabase.from("bluebeam_oauth_states").delete().eq("state", state);

        if (!stateRow) {
          return errorResponse(400, "Invalid or expired authorization state. Please restart the connection.");
        }
        if (stateRow.user_id !== user.id) {
          return errorResponse(403, "Authorization state does not match the current user.");
        }
        if (new Date(stateRow.expires_at as string).getTime() < Date.now()) {
          return errorResponse(400, "Authorization state expired. Please restart the connection.");
        }

        const tokens = await exchangeCode(code, stateRow.code_verifier as string);

        // Deactivate any existing connection for this user
        await supabase
          .from("bluebeam_connections")
          .update({ status: "revoked", is_deleted: true, deleted_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("is_deleted", false);

        // Store new connection
        const { data: conn, error: connErr } = await supabase
          .from("bluebeam_connections")
          .insert({
            user_id: user.id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            bluebeam_email: user.email,
            status: "active",
            last_used_at: new Date().toISOString(),
          })
          .select("id, status, bluebeam_email, created_at")
          .single();

        if (connErr) {
          console.error("[bluebeam-proxy] Connection insert error:", connErr);
          return errorResponse(500, "Failed to store Bluebeam connection");
        }

        return jsonResponse({ connected: true, connection: conn });
      }

      case "connection_status": {
        const { data: conn } = await supabase
          .from("bluebeam_connections")
          .select("id, status, bluebeam_email, display_name, last_used_at, created_at, error_message")
          .eq("user_id", user.id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return jsonResponse({
          connected: conn?.status === "active",
          connection: conn || null,
          configured: !!BB_CLIENT_ID,
        });
      }

      case "disconnect": {
        await supabase
          .from("bluebeam_connections")
          .update({ status: "revoked", is_deleted: true, deleted_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("is_deleted", false);

        return jsonResponse({ disconnected: true });
      }

      // ── Session actions (require valid token) ──────────────────────

      case "list_sessions": {
        const { token } = await getValidToken(supabase, user.id);
        const sessions = await listSessions(token);
        return jsonResponse({ sessions });
      }

      case "create_session": {
        const name = body.name as string;
        if (!name) return errorResponse(400, "Missing 'name'");
        const { token } = await getValidToken(supabase, user.id);
        const session = await createSession(token, name, {
          notification: body.notification as boolean | undefined,
          restricted: body.restricted as boolean | undefined,
        });

        // If projectId provided, store session mapping in our DB
        const projectId = body.projectId as string | undefined;
        if (projectId && session) {
          const s = session as Record<string, unknown>;
          await supabase.from("bluebeam_sessions").insert({
            project_id: projectId,
            session_id: String(s.Id || s.SessionId || ""),
            session_name: name,
            session_status: "active",
            session_type: (body.sessionType as string) || "review",
            drawing_set_id: (body.drawingSetId as string) || null,
            submittal_id: (body.submittalId as string) || null,
            created_by: user.id,
            bluebeam_url: String(s.SessionUrl || s.Url || ""),
            invitation_url: String(s.InvitationUrl || ""),
          });
        }

        return jsonResponse({ session });
      }

      case "get_session": {
        const sessionId = body.sessionId as string;
        if (!sessionId) return errorResponse(400, "Missing 'sessionId'");
        const denied = await assertSessionMembership(supabase, user.id, sessionId);
        if (denied) return denied;
        const { token } = await getValidToken(supabase, user.id);
        const session = await getSession(token, sessionId);
        return jsonResponse({ session });
      }

      case "end_session": {
        const sessionId = body.sessionId as string;
        if (!sessionId) return errorResponse(400, "Missing 'sessionId'");
        const denied = await assertSessionMembership(supabase, user.id, sessionId);
        if (denied) return denied;
        const { token } = await getValidToken(supabase, user.id);
        await endSession(token, sessionId);

        // Update our DB record
        await supabase
          .from("bluebeam_sessions")
          .update({ session_status: "ended", ended_at: new Date().toISOString() })
          .eq("session_id", sessionId)
          .eq("is_deleted", false);

        return jsonResponse({ ended: true });
      }

      case "invite_user": {
        const sessionId = body.sessionId as string;
        const email = body.email as string;
        if (!sessionId || !email) return errorResponse(400, "Missing 'sessionId' or 'email'");
        const denied = await assertSessionMembership(supabase, user.id, sessionId);
        if (denied) return denied;
        const { token } = await getValidToken(supabase, user.id);
        const result = await inviteUser(token, sessionId, email, body.permission as string);
        return jsonResponse({ invitation: result });
      }

      // ── File actions ───────────────────────────────────────────────

      case "list_session_files": {
        const sessionId = body.sessionId as string;
        if (!sessionId) return errorResponse(400, "Missing 'sessionId'");
        const denied = await assertSessionMembership(supabase, user.id, sessionId);
        if (denied) return denied;
        const { token } = await getValidToken(supabase, user.id);
        const files = await listSessionFiles(token, sessionId);
        return jsonResponse({ files });
      }

      case "upload_to_session": {
        const sessionId = body.sessionId as string;
        const fileUrl = body.fileUrl as string;
        const fileName = body.fileName as string;
        if (!sessionId || !fileUrl || !fileName) {
          return errorResponse(400, "Missing 'sessionId', 'fileUrl', or 'fileName'");
        }
        // Enforce session membership BEFORE pushing a file — matches every other
        // session-scoped action. Without this a connected user could push a file
        // into a Bluebeam session mapped to another SteelBuild project.
        const denied = await assertSessionMembership(supabase, user.id, sessionId);
        if (denied) return denied;
        const { token } = await getValidToken(supabase, user.id);
        const result = await uploadToSession(token, sessionId, fileUrl, fileName);

        // Track in our DB
        const projectId = body.projectId as string | undefined;
        if (projectId) {
          const bbSession = await supabase
            .from("bluebeam_sessions")
            .select("id")
            .eq("session_id", sessionId)
            .eq("is_deleted", false)
            .maybeSingle();

          if (bbSession.data) {
            await supabase.from("bluebeam_session_documents").insert({
              session_id: bbSession.data.id,
              project_id: projectId,
              bluebeam_file_id: String((result as Record<string, unknown>)?.Id || ""),
              file_name: fileName,
              direction: "push",
              sync_status: "complete",
              source_document_id: (body.documentId as string) || null,
            });

            // Update file count
            await supabase.rpc("increment_bluebeam_file_count", {
              p_session_id: bbSession.data.id,
            }).catch(() => {
              // Non-critical — the count is a convenience field
            });
          }
        }

        return jsonResponse({ file: result });
      }

      case "create_snapshot": {
        const sessionId = body.sessionId as string;
        if (!sessionId) return errorResponse(400, "Missing 'sessionId'");
        const denied = await assertSessionMembership(supabase, user.id, sessionId);
        if (denied) return denied;
        const { token } = await getValidToken(supabase, user.id);
        const snapshot = await createSnapshot(token, sessionId);
        return jsonResponse({ snapshot });
      }

      // ── Project actions ────────────────────────────────────────────

      case "list_bb_projects": {
        const { token } = await getValidToken(supabase, user.id);
        const projects = await listBBProjects(token);
        return jsonResponse({ projects });
      }

      case "list_project_files": {
        const bbProjectId = body.bbProjectId as string;
        if (!bbProjectId) return errorResponse(400, "Missing 'bbProjectId'");
        const { token } = await getValidToken(supabase, user.id);
        const files = await listProjectFiles(token, bbProjectId, body.folderId as string);
        return jsonResponse({ files });
      }

      default:
        return errorResponse(400, `Unknown action: ${action}`);
    }
  } catch (err) {
    console.error("[bluebeam-proxy]", err);
    const message = (err as Error).message || "Internal error";
    const status = message.includes("No active Bluebeam connection") ? 401 : 500;
    return errorResponse(status, message);
  }
});
