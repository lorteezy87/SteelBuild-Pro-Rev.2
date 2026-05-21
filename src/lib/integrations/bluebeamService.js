/**
 * bluebeamService.js
 *
 * Client-side service for Bluebeam Max (Studio) API integration.
 * All calls route through the bluebeam-proxy Edge Function — no
 * Bluebeam tokens or secrets ever reach the browser.
 *
 * Usage:
 *   import { bluebeam } from "@/lib/integrations/bluebeamService";
 *   const status = await bluebeam.connectionStatus();
 *   const sessions = await bluebeam.listSessions();
 */

import { supabase } from "@/lib/supabase";

const FUNCTION_NAME = "bluebeam-proxy";

/**
 * Call the bluebeam-proxy Edge Function with the given action and params.
 * Automatically attaches the user's Supabase JWT.
 */
async function callProxy(action, params = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action, ...params },
  });

  if (error) {
    // Supabase functions.invoke wraps HTTP errors
    const message = error.message || "Bluebeam proxy request failed";
    throw new Error(message);
  }

  // The proxy returns { error: "..." } for application-level errors
  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

// ── OAuth ────────────────────────────────────────────────────────────────

/**
 * Get the OAuth authorization URL. Opens in a popup or redirect.
 * Returns { url, state }.
 */
export async function getAuthUrl() {
  return callProxy("auth_url");
}

/**
 * Exchange an OAuth authorization code for tokens.
 * Called from the OAuth callback handler.
 */
export async function exchangeCode(code) {
  return callProxy("exchange_code", { code });
}

/**
 * Check if the current user has an active Bluebeam connection.
 * Returns { connected, connection, configured }.
 */
export async function connectionStatus() {
  return callProxy("connection_status");
}

/**
 * Disconnect (revoke) the user's Bluebeam connection.
 */
export async function disconnect() {
  return callProxy("disconnect");
}

// ── Sessions ─────────────────────────────────────────────────────────────

/**
 * List all Bluebeam sessions the user can see.
 */
export async function listSessions() {
  return callProxy("list_sessions");
}

/**
 * Create a new Bluebeam session, optionally linked to a SteelBuild
 * project, drawing set, or submittal.
 */
export async function createSession({
  name,
  projectId,
  sessionType = "review",
  drawingSetId,
  submittalId,
  notification = true,
  restricted = false,
} = {}) {
  return callProxy("create_session", {
    name,
    projectId,
    sessionType,
    drawingSetId,
    submittalId,
    notification,
    restricted,
  });
}

/**
 * Get details for a specific Bluebeam session.
 */
export async function getSession(sessionId) {
  return callProxy("get_session", { sessionId });
}

/**
 * End (close) a Bluebeam session.
 */
export async function endSession(sessionId) {
  return callProxy("end_session", { sessionId });
}

/**
 * Invite a user to a Bluebeam session by email.
 * permission: "full" or "view"
 */
export async function inviteUser(sessionId, email, permission = "full") {
  return callProxy("invite_user", { sessionId, email, permission });
}

// ── Files ────────────────────────────────────────────────────────────────

/**
 * List files in a Bluebeam session.
 */
export async function listSessionFiles(sessionId) {
  return callProxy("list_session_files", { sessionId });
}

/**
 * Upload a document to a Bluebeam session via URL.
 * The Edge Function fetches the file server-side.
 */
export async function uploadToSession({
  sessionId,
  fileUrl,
  fileName,
  projectId,
  documentId,
} = {}) {
  return callProxy("upload_to_session", {
    sessionId,
    fileUrl,
    fileName,
    projectId,
    documentId,
  });
}

/**
 * Create a flattened markup snapshot of a session.
 */
export async function createSnapshot(sessionId) {
  return callProxy("create_snapshot", { sessionId });
}

// ── Bluebeam Projects ────────────────────────────────────────────────────

/**
 * List Bluebeam projects (not SteelBuild projects).
 */
export async function listBBProjects() {
  return callProxy("list_bb_projects");
}

/**
 * List files in a Bluebeam project folder.
 */
export async function listProjectFiles(bbProjectId, folderId) {
  return callProxy("list_project_files", { bbProjectId, folderId });
}

// ── Local DB queries (Supabase direct) ───────────────────────────────────

/**
 * Get Bluebeam sessions linked to a SteelBuild project.
 */
export async function getProjectSessions(projectId) {
  const { data, error } = await supabase
    .from("bluebeam_sessions")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get documents tracked for a Bluebeam session.
 */
export async function getSessionDocuments(sessionId) {
  const { data, error } = await supabase
    .from("bluebeam_session_documents")
    .select("*")
    .eq("session_id", sessionId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

// ── OAuth popup flow ─────────────────────────────────────────────────────

/**
 * Open Bluebeam OAuth in a popup window and return a Promise that
 * resolves when the user completes the flow. The popup posts the
 * auth code back via postMessage.
 */
export function connectWithPopup() {
  return new Promise(async (resolve, reject) => {
    try {
      const { url } = await getAuthUrl();

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        url,
        "bluebeam-oauth",
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
      );

      if (!popup) {
        reject(new Error("Popup blocked. Please allow popups for this site."));
        return;
      }

      // Listen for the callback
      const handler = async (event) => {
        if (event.data?.type !== "bluebeam-oauth-callback") return;
        window.removeEventListener("message", handler);

        const { code, error: oauthError } = event.data;
        if (oauthError) {
          reject(new Error(oauthError));
          return;
        }

        try {
          const result = await exchangeCode(code);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };

      window.addEventListener("message", handler);

      // Poll for popup close (user cancelled)
      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer);
          window.removeEventListener("message", handler);
          reject(new Error("Authentication cancelled"));
        }
      }, 500);
    } catch (err) {
      reject(err);
    }
  });
}

// ── Convenience namespace ────────────────────────────────────────────────

export const bluebeam = {
  getAuthUrl,
  exchangeCode,
  connectionStatus,
  disconnect,
  connectWithPopup,
  listSessions,
  createSession,
  getSession,
  endSession,
  inviteUser,
  listSessionFiles,
  uploadToSession,
  createSnapshot,
  listBBProjects,
  listProjectFiles,
  getProjectSessions,
  getSessionDocuments,
};

export default bluebeam;
