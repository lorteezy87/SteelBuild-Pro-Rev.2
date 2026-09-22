// ─────────────────────────────────────────────────────────────────────────────
// email-send — Supabase Edge Function
//
// Sends emails on behalf of authenticated SteelBuild Pro users.
// Supports compose (new) and reply modes with threading headers, plus
// file attachments (base64) sent through whichever provider is active.
//
// Provider routing:
//   1. Resend API (default) — transactional email, easiest setup.
//   2. Microsoft Graph (optional) — send-as from shared mailbox.
//
// Stores every sent message in email_messages with direction='outbound'
// so the Email Inbox shows a complete conversation history.
//
// Auth: JWT-verified. User must have project access.
//
// Secrets required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY (for Resend provider)
//   — OR —
//   MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, MS_GRAPH_TENANT_ID (for Graph)
//
// Deploy:
//   supabase functions deploy email-send
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { reportError } from "../_shared/reportError.ts";
import {
  isDangerousAttachment,
  MAX_ATTACHMENT_BYTES,
  sanitizeAttachmentName,
} from "../_shared/attachments.ts";
import { normalizeRecipients } from "./recipients.ts";

// Max combined raw (decoded) size of outbound attachments. base64 inflates
// the payload ~33%, so the actual request body stays well under typical
// edge limits. MS Graph's inline sendMail path is stricter (~4 MB total).
const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

// Abuse ceilings for outbound mail. Attachment size was already bounded; the
// two things that actually determine blast radius — how many people one message
// reaches, and how many messages one account can send — were not.
//
// Both matter because every send leaves from OUR verified domain through OUR
// provider tenant. One compromised or careless account damages deliverability
// for every customer on the platform, and that reputation takes weeks to
// rebuild. These are deliberately generous relative to real project
// correspondence and deliberately far below "mailing list".
const MAX_RECIPIENTS_PER_MESSAGE = 50;

/** Rolling-window send cap per user. 0 disables (set via EMAIL_SEND_HOURLY_LIMIT). */
const DEFAULT_SEND_HOURLY_LIMIT = 100;
const SEND_WINDOW_MS = 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailAttachmentInput {
  filename: string;
  content_type?: string;
  /** base64-encoded file bytes, no `data:` prefix */
  content_base64: string;
  size_bytes?: number;
}

interface SendEmailRequest {
  project_id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_text: string;
  body_html?: string;
  /** For replies: the email_messages.id being replied to */
  reply_to_message_id?: string;
  /** For replies: the external Message-ID header for In-Reply-To */
  in_reply_to_external_id?: string;
  /** Thread grouping key */
  thread_id?: string;
  /** From address — must match a configured email account for the project */
  from_email?: string;
  from_name?: string;
  /** File attachments (base64-encoded, no `data:` prefix) */
  attachments?: EmailAttachmentInput[];
}

interface SendResult {
  provider: string;
  provider_message_id: string | null;
  success: boolean;
  error?: string;
}

// ── JWT Verification ──────────────────────────────────────────────────────────

async function verifyJwt(req: Request): Promise<{ userId: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": serviceKey,
      },
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

// ── Identifier validation ─────────────────────────────────────────────────────

/**
 * Every id below is interpolated into a PostgREST filter URL
 * (`?project_id=eq.${projectId}`). PostgREST parses that value as filter
 * SYNTAX, so an unvalidated string is an injection vector — and here it lands
 * inside getProjectRole(), i.e. the authorization check itself, where a crafted
 * value could change which row the role lookup returns.
 *
 * email-ingest already validated its path-supplied project id with exactly this
 * pattern; email-send took its id from the request BODY and did not. Same guard,
 * applied at the boundary and again defensively at each fetch site, so no future
 * caller can reintroduce it.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// ── Send Rate Limit ───────────────────────────────────────────────────────────

/**
 * Rolling-hour outbound cap per user, counted off the `email_messages` rows
 * this function already writes (`sent_by`, `sent_at`, `direction='outbound'`)
 * — no new table.
 *
 * Fails CLOSED. That is the opposite of the llm-proxy quota default, and
 * deliberately so: there, an unverifiable cheap call costs fractions of a cent
 * and the rule is "telemetry never breaks the user's request". Here the
 * unbounded failure mode is a spam run from our verified domain, which costs
 * every customer's deliverability for weeks. A short outage that delays a few
 * emails with a clear retry message is the cheaper failure.
 *
 * Set EMAIL_SEND_HOURLY_LIMIT=0 to disable.
 */
async function checkSendRateLimit(
  userId: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ ok: true } | { ok: false; status: 429 | 503; error: string; retryAfterSeconds: number }> {
  const raw = Deno.env.get("EMAIL_SEND_HOURLY_LIMIT");
  const limit = raw === undefined || raw === ""
    ? DEFAULT_SEND_HOURLY_LIMIT
    : Number(raw);
  if (!Number.isFinite(limit) || limit <= 0) return { ok: true }; // explicitly disabled

  if (!isUuid(userId)) {
    return { ok: false, status: 503, error: "Send limits can't be verified right now.", retryAfterSeconds: 30 };
  }

  const sinceIso = new Date(Date.now() - SEND_WINDOW_MS).toISOString();
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/email_messages` +
      `?sent_by=eq.${userId}&direction=eq.outbound&sent_at=gte.${encodeURIComponent(sinceIso)}` +
      `&select=id&limit=1`,
      {
        headers: {
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
          // Exact count in Content-Range without transferring the rows.
          "Prefer": "count=exact",
        },
        // Bound the pre-send read so a stalled PostgREST can't hang the send.
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!resp.ok) {
      console.error(`[email-send] rate-limit read ${resp.status}`);
      return { ok: false, status: 503, error: "Send limits can't be verified right now. Please retry shortly.", retryAfterSeconds: 30 };
    }
    // Content-Range: "0-0/123" — the total is after the slash.
    const total = Number(resp.headers.get("content-range")?.split("/")[1]);
    if (!Number.isFinite(total)) {
      console.error("[email-send] rate-limit read returned no usable count");
      return { ok: false, status: 503, error: "Send limits can't be verified right now. Please retry shortly.", retryAfterSeconds: 30 };
    }
    if (total >= limit) {
      // Keep the configured cap in the SERVER log only, so a caller can't read
      // the threshold off the response and pace just under it.
      console.warn(`[email-send] rate limit BLOCK user=${userId} sent=${total} >= cap=${limit}`);
      return { ok: false, status: 429, error: "Hourly send limit reached. Please try again later.", retryAfterSeconds: 900 };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[email-send] rate-limit check threw: ${err instanceof Error ? err.message : err}`);
    return { ok: false, status: 503, error: "Send limits can't be verified right now. Please retry shortly.", retryAfterSeconds: 30 };
  }
}

// ── Project Access Check ──────────────────────────────────────────────────────

async function checkProjectAccess(
  userId: string,
  projectId: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<boolean> {
  // Mirrors the RLS helper user_has_project_access: a user_projects row OR org
  // owner/admin standing both grant access. getProjectRole() resolves both, so a
  // non-null effective role means the user has access — this fixes org owners/admins
  // who manage a project without a user_projects row being wrongly 403'd.
  return (await getProjectRole(userId, projectId, supabaseUrl, serviceKey)) !== null;
}

// ── Project Role Check ──────────────────────────────────────────────────────────

// Outbound/mutating actions require an elevated project role. Sending email is
// a mutation (it creates correspondence and persists records), so a viewer or
// field user must not be able to send even though they have project access.
const SEND_ALLOWED_ROLES = new Set(["owner", "admin", "pm"]);

async function getProjectRole(
  userId: string,
  projectId: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<string | null> {
  // Defence in depth: the handler already rejects a non-UUID project_id, but
  // this function builds PostgREST filters from it, so it refuses to run on
  // anything that isn't a UUID regardless of how it was called.
  if (!isUuid(projectId) || !isUuid(userId)) return null;

  const headers = { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` };
  try {
    // 1. Direct project membership role.
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/user_projects?user_id=eq.${userId}&project_id=eq.${projectId}&select=role&limit=1`,
      { headers },
    );
    if (resp.ok) {
      const rows = await resp.json();
      const role = Array.isArray(rows) && rows.length ? rows[0]?.role : null;
      if (typeof role === "string" && role) return role.toLowerCase();
    }
    // 2. Org owner/admin fallback — mirrors get_my_project_role: an org owner or
    //    admin has an effective project role even without a user_projects row.
    const projResp = await fetch(
      `${supabaseUrl}/rest/v1/projects?id=eq.${projectId}&select=org_id&limit=1`,
      { headers },
    );
    if (!projResp.ok) return null;
    const projRows = await projResp.json();
    const orgId = Array.isArray(projRows) && projRows.length ? projRows[0]?.org_id : null;
    // DB-sourced, so trusted — but it is interpolated into another filter URL
    // below, and "trusted source" is exactly the assumption that rots. Check it.
    if (!isUuid(orgId)) return null;
    const omResp = await fetch(
      `${supabaseUrl}/rest/v1/organization_members?org_id=eq.${orgId}&user_id=eq.${userId}&select=role&limit=1`,
      { headers },
    );
    if (!omResp.ok) return null;
    const omRows = await omResp.json();
    const orgRole = Array.isArray(omRows) && omRows.length ? String(omRows[0]?.role || "").toLowerCase() : null;
    if (orgRole === "owner" || orgRole === "admin") return orgRole;
    return null;
  } catch {
    return null;
  }
}

// ── Resend Provider ───────────────────────────────────────────────────────────

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string[],
  cc: string[],
  bcc: string[],
  subject: string,
  bodyText: string,
  bodyHtml: string | null,
  headers: Record<string, string>,
  attachments: EmailAttachmentInput[],
): Promise<SendResult> {
  try {
    const payload: Record<string, unknown> = {
      from,
      to,
      subject,
      text: bodyText,
    };
    if (cc.length > 0) payload.cc = cc;
    if (bcc.length > 0) payload.bcc = bcc;
    if (bodyHtml) payload.html = bodyHtml;
    if (Object.keys(headers).length > 0) payload.headers = headers;
    if (attachments.length > 0) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content_base64,
      }));
    }

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error(`[email-send] Resend error ${resp.status}: ${detail.slice(0, 300)}`);
      return { provider: "resend", provider_message_id: null, success: false, error: detail.slice(0, 200) };
    }

    const data = await resp.json();
    return { provider: "resend", provider_message_id: data.id || null, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { provider: "resend", provider_message_id: null, success: false, error: msg };
  }
}

// ── Microsoft Graph Provider ──────────────────────────────────────────────────

async function getMsGraphToken(tenantId: string, clientId: string, clientSecret: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const resp = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2/token`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params },
    );

    if (!resp.ok) {
      const detail = await resp.text();
      console.error(`[email-send] MS Graph token error ${resp.status}: ${detail.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    return data.access_token || null;
  } catch (err) {
    console.error(`[email-send] MS Graph token error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function sendViaMsGraph(
  token: string,
  fromEmail: string,
  to: string[],
  cc: string[],
  bcc: string[],
  subject: string,
  bodyText: string,
  bodyHtml: string | null,
  inReplyTo: string | null,
  attachments: EmailAttachmentInput[],
): Promise<SendResult> {
  try {
    const message: Record<string, unknown> = {
      subject,
      body: {
        contentType: bodyHtml ? "HTML" : "Text",
        content: bodyHtml || bodyText,
      },
      toRecipients: to.map((addr) => ({ emailAddress: { address: addr } })),
    };

    if (cc.length > 0) {
      message.ccRecipients = cc.map((addr) => ({ emailAddress: { address: addr } }));
    }
    if (bcc.length > 0) {
      message.bccRecipients = bcc.map((addr) => ({ emailAddress: { address: addr } }));
    }
    if (inReplyTo) {
      message.internetMessageHeaders = [
        { name: "In-Reply-To", value: inReplyTo },
      ];
    }
    if (attachments.length > 0) {
      // sendMail carries attachments inline; the whole request must stay
      // under ~4 MB. Larger files require an upload session (future work).
      message.attachments = attachments.map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.filename,
        contentType: a.content_type || "application/octet-stream",
        contentBytes: a.content_base64,
      }));
    }

    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ message, saveToSentItems: true }),
      },
    );

    if (!resp.ok) {
      const detail = await resp.text();
      console.error(`[email-send] MS Graph send error ${resp.status}: ${detail.slice(0, 300)}`);
      return { provider: "msgraph", provider_message_id: null, success: false, error: detail.slice(0, 200) };
    }

    // Graph sendMail returns 202 with no body
    return { provider: "msgraph", provider_message_id: null, success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { provider: "msgraph", provider_message_id: null, success: false, error: msg };
  }
}

// ── Attachment Helpers ──────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const clean = b64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hashContent(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Persist sent attachments to Storage + email_attachments, mirroring the
// inbound email-ingest path so the Email Inbox renders them identically.
async function storeSentAttachments(
  supabaseUrl: string,
  serviceKey: string,
  projectId: string,
  messageId: string,
  attachments: EmailAttachmentInput[],
): Promise<number> {
  let stored = 0;
  for (const att of attachments) {
    try {
      const bytes = base64ToBytes(att.content_base64);
      const contentType = att.content_type || "application/octet-stream";
      const contentHash = await hashContent(bytes);
      // Sanitize the (user-supplied) filename before it enters the storage path —
      // a name like "../x" or "a/b" would otherwise escape the message prefix.
      const safeName = sanitizeAttachmentName(att.filename);
      const storagePath = `${projectId}/${messageId}/${safeName}`;

      const uploadResp = await fetch(
        `${supabaseUrl}/storage/v1/object/email-attachments/${storagePath}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
            "Content-Type": contentType,
            "x-upsert": "true",
          },
          body: bytes,
        },
      );

      if (!uploadResp.ok) {
        const detail = await uploadResp.text();
        console.error(`[email-send] Storage upload failed for ${att.filename}: ${detail.slice(0, 200)}`);
        continue;
      }

      const attRow = {
        message_id: messageId,
        project_id: projectId,
        filename: safeName,
        content_type: contentType,
        size_bytes: bytes.length,
        content_hash: contentHash,
        storage_path: storagePath,
        storage_bucket: "email-attachments",
      };

      const attResp = await fetch(`${supabaseUrl}/rest/v1/email_attachments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify(attRow),
      });

      if (!attResp.ok) {
        const detail = await attResp.text();
        console.error(`[email-send] Insert attachment failed for ${att.filename}: ${detail.slice(0, 200)}`);
        continue;
      }

      stored++;
    } catch (err) {
      console.error(`[email-send] Attachment error for ${att.filename}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return stored;
}

// ── Store Sent Message ────────────────────────────────────────────────────────

async function storeSentMessage(
  supabaseUrl: string,
  serviceKey: string,
  projectId: string,
  userId: string,
  req: SendEmailRequest,
  result: SendResult,
): Promise<string | null> {
  const now = new Date().toISOString();
  const externalId = result.provider_message_id
    ? `sent-${result.provider}-${result.provider_message_id}`
    : `sent-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const row = {
    project_id: projectId,
    external_id: externalId,
    direction: "outbound",
    subject: req.subject,
    sender_email: req.from_email || "",
    sender_name: req.from_name || "",
    recipients: JSON.stringify(req.to),
    cc: JSON.stringify(req.cc || []),
    body_text: req.body_text,
    body_html: req.body_html || null,
    received_at: now,
    sent_at: now,
    sent_by: userId,
    in_reply_to: req.in_reply_to_external_id || null,
    thread_id: req.thread_id || null,
    import_status: "approved",
    is_read: true,
    has_attachments: (req.attachments?.length ?? 0) > 0,
    attachment_count: req.attachments?.length ?? 0,
    parsed_type: "general",
    parsed_confidence: 1.0,
    parsed_metadata: JSON.stringify({
      send_provider: result.provider,
      provider_message_id: result.provider_message_id,
      sent_at: now,
      // email_messages has no bcc column; keep the blind-copied recipients in
      // metadata so the sent record reflects everyone the message reached.
      bcc: req.bcc || [],
    }),
  };

  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/email_messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(row),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error(`[email-send] Store sent message failed ${resp.status}: ${detail.slice(0, 300)}`);
      return null;
    }

    const [inserted] = await resp.json();
    return inserted?.id || null;
  } catch (err) {
    console.error(`[email-send] Store error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return errorResponse(405, "Method not allowed", req);

  // Authenticate
  const user = await verifyJwt(req);
  if (!user) return errorResponse(401, "Unauthorized — valid JWT required", req);

  // Parse body
  let body: SendEmailRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body", req);
  }

  // Validate required fields
  if (!body.project_id) return errorResponse(400, "project_id is required", req);
  // Must be a UUID before it reaches any PostgREST filter — see isUuid().
  if (!isUuid(body.project_id)) return errorResponse(400, "Invalid project_id format", req);
  if (!body.to || body.to.length === 0) return errorResponse(400, "to is required (array of email addresses)", req);

  // Recipient ceiling. This function sends from OUR verified domain through OUR
  // Resend / Microsoft Graph tenant, so a single authenticated user blasting a
  // large list burns the platform's sending reputation for every customer. Real
  // correspondence tops out well under this; anything larger is a mailing list
  // and belongs in a marketing tool, not the project email surface.
  const totalRecipients =
    (body.to?.length ?? 0) + (body.cc?.length ?? 0) + (body.bcc?.length ?? 0);
  if (totalRecipients > MAX_RECIPIENTS_PER_MESSAGE) {
    return errorResponse(
      400,
      `Too many recipients (${totalRecipients}). Maximum is ${MAX_RECIPIENTS_PER_MESSAGE} across to/cc/bcc.`,
      req,
    );
  }
  if (!body.subject) return errorResponse(400, "subject is required", req);
  if (!body.body_text) return errorResponse(400, "body_text is required", req);

  // Normalize + format-validate recipients at the boundary so malformed
  // addresses fail fast instead of surfacing as opaque provider errors.
  const toRecipients = normalizeRecipients(body.to);
  const ccRecipients = normalizeRecipients(body.cc ?? []);
  const bccRecipients = normalizeRecipients(body.bcc ?? []);
  const invalidAddresses = [
    ...toRecipients.invalid,
    ...ccRecipients.invalid,
    ...bccRecipients.invalid,
  ];
  if (invalidAddresses.length > 0) {
    return errorResponse(
      400,
      `Invalid email address(es): ${invalidAddresses.slice(0, 5).join(", ")}`,
      req,
    );
  }
  if (toRecipients.valid.length === 0) {
    return errorResponse(
      400,
      "to must contain at least one valid email address",
      req,
    );
  }
  body.to = toRecipients.valid;
  body.cc = ccRecipients.valid;
  body.bcc = bccRecipients.valid;

  // Validate + size-guard attachments (base64 inflates ~33%; cap on raw bytes).
  // Mirror the inbound email-ingest guards (_shared/attachments.ts): reject
  // executable/script extensions and per-file oversize BEFORE sending or storing,
  // so the outbound path can't push a dangerous or unbounded file into storage.
  const attachments = body.attachments ?? [];
  let attachmentBytes = 0;
  for (const att of attachments) {
    if (!att.filename || !att.content_base64) {
      return errorResponse(400, "Each attachment requires filename and content_base64", req);
    }
    if (isDangerousAttachment(att.filename)) {
      return errorResponse(400, `Attachment type not allowed: ${att.filename}`, req);
    }
    const fileBytes = Math.floor(att.content_base64.length * 0.75);
    if (fileBytes > MAX_ATTACHMENT_BYTES) {
      return errorResponse(413, `Attachment "${att.filename}" exceeds the 25 MB per-file limit`, req);
    }
    attachmentBytes += fileBytes;
  }
  if (attachmentBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    return errorResponse(413, "Attachments exceed the 20 MB total limit", req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return errorResponse(500, "Edge function not configured", req);

  // Verify project access
  const hasAccess = await checkProjectAccess(user.userId, body.project_id, supabaseUrl, serviceKey);
  if (!hasAccess) return errorResponse(403, "No access to this project", req);

  // Verify project role. Membership alone is not enough to send outbound email —
  // per the RBAC contract, mutating/outbound actions require owner/admin/pm.
  // A viewer or field user is a member but must not be able to send.
  const projectRole = await getProjectRole(user.userId, body.project_id, supabaseUrl, serviceKey);
  if (!projectRole || !SEND_ALLOWED_ROLES.has(projectRole)) {
    return errorResponse(403, "Your project role does not permit sending email", req);
  }

  // Per-user hourly cap. Checked AFTER authorization (so an unauthorized caller
  // can't probe it) and BEFORE the provider call (so a throttled user never
  // reaches Resend / Graph and never burns domain reputation).
  const rate = await checkSendRateLimit(user.userId, supabaseUrl, serviceKey);
  if (!rate.ok) {
    const res = errorResponse(rate.status, rate.error, req);
    res.headers.set("Retry-After", String(rate.retryAfterSeconds));
    return res;
  }

  // Determine the from address. A caller-supplied from_email must be one of the
  // project's ACTIVE email accounts — otherwise a member could send as any
  // address (spoofing) and the spoofed message would be persisted as legitimate
  // project correspondence. When none is supplied we fall back to the first
  // active account. Always fetch the active accounts so we can validate.
  let fromEmail = body.from_email || "";
  let fromName = body.from_name || "";

  let activeAccounts: Array<{ email_address?: string; display_name?: string }> = [];
  try {
    const acctResp = await fetch(
      `${supabaseUrl}/rest/v1/email_accounts?project_id=eq.${body.project_id}&is_active=eq.true&select=email_address,display_name`,
      { headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` } },
    );
    if (acctResp.ok) {
      const accts = await acctResp.json();
      if (Array.isArray(accts)) activeAccounts = accts;
    }
  } catch { /* best effort */ }

  if (fromEmail) {
    const match = activeAccounts.find(
      (a) => (a.email_address || "").toLowerCase() === fromEmail.toLowerCase(),
    );
    if (!match) {
      return errorResponse(403, "from_email is not an active sending account for this project", req);
    }
    fromName = fromName || match.display_name || "";
  } else if (activeAccounts.length > 0) {
    fromEmail = activeAccounts[0].email_address || "";
    fromName = fromName || activeAccounts[0].display_name || "";
  }

  if (!fromEmail) {
    return errorResponse(400, "No from_email provided and no active email account configured for this project", req);
  }

  const fromFormatted = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  // Build threading headers
  const threadingHeaders: Record<string, string> = {};
  if (body.in_reply_to_external_id) {
    threadingHeaders["In-Reply-To"] = body.in_reply_to_external_id;
    threadingHeaders["References"] = body.in_reply_to_external_id;
  }

  // Route to provider
  let result: SendResult;

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const msClientId = Deno.env.get("MS_GRAPH_CLIENT_ID");
  const msClientSecret = Deno.env.get("MS_GRAPH_CLIENT_SECRET");
  const msTenantId = Deno.env.get("MS_GRAPH_TENANT_ID");

  if (msClientId && msClientSecret && msTenantId) {
    // Prefer Microsoft Graph when configured — sends as the actual shared mailbox
    const token = await getMsGraphToken(msTenantId, msClientId, msClientSecret);
    if (!token) return errorResponse(502, "Failed to obtain Microsoft Graph token", req);

    result = await sendViaMsGraph(
      token, fromEmail, body.to, body.cc || [], body.bcc || [],
      body.subject, body.body_text, body.body_html || null,
      body.in_reply_to_external_id || null, attachments,
    );
  } else if (resendKey) {
    result = await sendViaResend(
      resendKey, fromFormatted, body.to, body.cc || [], body.bcc || [],
      body.subject, body.body_text, body.body_html || null,
      threadingHeaders, attachments,
    );
  } else {
    return errorResponse(503, "No email send provider configured. Set RESEND_API_KEY or MS_GRAPH_* secrets.", req);
  }

  if (!result.success) {
    console.error(`[email-send] Send failed via ${result.provider}: ${result.error}`);
    return jsonResponse({
      success: false,
      provider: result.provider,
      error: result.error,
    }, 502, req);
  }

  // Store the sent message
  const storedId = await storeSentMessage(supabaseUrl, serviceKey, body.project_id, user.userId, body, result);

  // Persist attachments now that we have the stored message id
  let attachmentsStored = 0;
  if (storedId && attachments.length > 0) {
    attachmentsStored = await storeSentAttachments(supabaseUrl, serviceKey, body.project_id, storedId, attachments);
  }

  // Log recipient COUNT, not addresses, and omit the subject — avoid leaking
  // correspondence PII into function logs. from=project mailbox is retained for
  // mailbox-level debugging.
  console.log(
    `[email-send] Sent: project=${body.project_id} from=${fromEmail} ` +
    `recipients=${body.to.length} provider=${result.provider} ` +
    `stored=${storedId || "failed"} attachments=${attachmentsStored}/${attachments.length}`,
  );

  return jsonResponse({
    success: true,
    provider: result.provider,
    message_id: storedId,
    provider_message_id: result.provider_message_id,
  }, 200, req);
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await reportError(err, "email-send", { unhandled: true });
    return errorResponse(500, `Internal error: ${message}`, req);
  }
});
