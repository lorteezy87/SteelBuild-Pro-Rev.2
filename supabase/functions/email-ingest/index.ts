// ─────────────────────────────────────────────────────────────────────────────
// email-ingest — Supabase Edge Function
//
// Receives inbound emails via:
//   1. Manual forward webhook (POST with JSON or multipart/form-data)
//   2. SendGrid Inbound Parse webhook (multipart/form-data)
//   3. Microsoft Power Automate / Logic Apps (JSON)
//
// Parses the email, deduplicates by Message-ID, stores attachments in
// Supabase Storage, and inserts the message into email_messages with
// import_status='pending' for human review in the Email Inbox UI.
//
// Auth: This endpoint does NOT require a JWT (verify_jwt=false) because
// it receives webhooks from external email services. Instead, it uses
// a shared secret (EMAIL_WEBHOOK_SECRET) as a bearer token or query param.
//
// Secrets required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMAIL_WEBHOOK_SECRET
//
// Deploy:
//   supabase functions deploy email-ingest --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface ParsedEmail {
  externalId: string;
  subject: string;
  senderEmail: string;
  senderName: string;
  recipients: string[];
  cc: string[];
  bodyText: string;
  bodyHtml: string;
  receivedAt: string;
  attachments: ParsedAttachment[];
  headers: Record<string, string>;
}

interface ParsedAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  content: Uint8Array;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Authentication ─────────────────────────────────────────────────────────

function authenticateWebhook(req: Request): boolean {
  const secret = Deno.env.get("EMAIL_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[email-ingest] EMAIL_WEBHOOK_SECRET not configured");
    return false;
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const webhookHeader = req.headers.get("x-webhook-secret");
  if (webhookHeader === secret) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;

  return false;
}

// ── Email Parsing ──────────────────────────────────────────────────────────

function generateMessageId(): string {
  return `manual-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1] : raw.trim();
}

function extractDisplayName(raw: string): string {
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : extractEmailAddress(raw);
}

function parseRecipientList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((r) => extractEmailAddress(r.trim())).filter(Boolean);
}

// deno-lint-ignore no-explicit-any
async function parseJsonPayload(body: Record<string, any>): Promise<ParsedEmail> {
  const subject = String(body.subject || body.Subject || "");
  const from = String(body.from || body.From || body.sender || body.Sender || "");
  const to = String(body.to || body.To || body.recipients || "");
  const cc = String(body.cc || body.Cc || "");
  const text = String(body.text || body.body_text || body.Body || body.bodyText || body.body || "");
  const html = String(body.html || body.body_html || body.bodyHtml || body.BodyHtml || "");
  const messageId = String(
    body.message_id || body.messageId || body["Message-ID"] ||
    (body.headers && body.headers.messageId) || ""
  );
  const date = String(body.date || body.Date || body.received_at || body.receivedAt || "");

  return {
    externalId: messageId || generateMessageId(),
    subject,
    senderEmail: extractEmailAddress(from),
    senderName: extractDisplayName(from),
    recipients: parseRecipientList(to),
    cc: parseRecipientList(cc),
    bodyText: text,
    bodyHtml: html,
    receivedAt: date ? new Date(date).toISOString() : new Date().toISOString(),
    attachments: [],
    headers: {},
  };
}

async function parseMultipartPayload(req: Request): Promise<ParsedEmail> {
  const formData = await req.formData();

  const subject = String(formData.get("subject") || "");
  const from = String(formData.get("from") || "");
  const to = String(formData.get("to") || "");
  const cc = String(formData.get("cc") || "");
  const text = String(formData.get("text") || formData.get("body-plain") || "");
  const html = String(formData.get("html") || formData.get("body-html") || "");
  const messageId = String(formData.get("Message-ID") || formData.get("message-id") || "");
  const date = String(formData.get("Date") || formData.get("date") || "");

  const attachments: ParsedAttachment[] = [];
  for (const [key, value] of formData.entries()) {
    if (value instanceof File && key.startsWith("attachment")) {
      const buffer = await value.arrayBuffer();
      attachments.push({
        filename: value.name,
        contentType: value.type || "application/octet-stream",
        sizeBytes: buffer.byteLength,
        content: new Uint8Array(buffer),
      });
    }
  }

  return {
    externalId: messageId || generateMessageId(),
    subject,
    senderEmail: extractEmailAddress(from),
    senderName: extractDisplayName(from),
    recipients: parseRecipientList(to),
    cc: parseRecipientList(cc),
    bodyText: text,
    bodyHtml: html,
    receivedAt: date ? new Date(date).toISOString() : new Date().toISOString(),
    attachments,
    headers: {},
  };
}

// ── AI Classification ──────────────────────────────────────────────────────

function classifyEmail(email: ParsedEmail): { type: string; confidence: number } {
  const subjectLower = (email.subject || "").toLowerCase();
  const bodyLower = (email.bodyText || "").toLowerCase();
  const combined = `${subjectLower} ${bodyLower}`;

  const rfiPatterns = ["rfi", "request for information", "rfi #", "rfi-", "information request"];
  if (rfiPatterns.some((p) => combined.includes(p))) {
    return { type: "rfi", confidence: 0.85 };
  }

  const submittalPatterns = ["submittal", "shop drawing", "product data", "sample", "mock-up", "mockup"];
  if (submittalPatterns.some((p) => combined.includes(p))) {
    return { type: "submittal", confidence: 0.80 };
  }

  const transmittalPatterns = ["transmittal", "transmitted", "enclosed please find", "attached please find", "for your review"];
  if (transmittalPatterns.some((p) => combined.includes(p))) {
    return { type: "transmittal", confidence: 0.70 };
  }

  const actionPatterns = [
    "action required", "action item", "please confirm", "please advise",
    "deadline", "due date", "by end of day", "eod", "asap", "urgent",
    "follow up", "follow-up",
  ];
  if (actionPatterns.some((p) => combined.includes(p))) {
    return { type: "action_item", confidence: 0.65 };
  }

  return { type: "general", confidence: 0.50 };
}

// ── Content Hash ───────────────────────────────────────────────────────────

async function hashContent(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Main Handler ───────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!authenticateWebhook(req)) {
    return json({ error: "Unauthorized — invalid or missing webhook secret" }, 401);
  }

  // Extract project_id from URL path: /email-ingest/:projectId
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const projectId = pathParts[pathParts.length - 1];

  if (!projectId || projectId === "email-ingest") {
    return json({ error: "Missing project_id in URL path. Use /email-ingest/<project-id>" }, 400);
  }

  // Parse email based on content type
  const contentType = req.headers.get("content-type") || "";
  let email: ParsedEmail;

  try {
    if (contentType.includes("multipart/form-data")) {
      email = await parseMultipartPayload(req);
    } else {
      const body = await req.json();
      email = await parseJsonPayload(body);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email-ingest] Parse error: ${msg}`);
    return json({ error: `Failed to parse email payload: ${msg}` }, 400);
  }

  if (!email.senderEmail) {
    return json({ error: "No sender email found in payload" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    console.error("[email-ingest] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return json({ error: "Edge function not configured" }, 500);
  }

  const supabaseHeaders = {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Prefer": "return=representation",
  };

  // Dedup check
  if (email.externalId && !email.externalId.startsWith("manual-")) {
    const dedupResp = await fetch(
      `${supabaseUrl}/rest/v1/email_messages?project_id=eq.${projectId}&external_id=eq.${encodeURIComponent(email.externalId)}&select=id&limit=1`,
      { headers: supabaseHeaders }
    );
    if (dedupResp.ok) {
      const existing = await dedupResp.json();
      if (Array.isArray(existing) && existing.length > 0) {
        console.log(`[email-ingest] Duplicate skipped: ${email.externalId}`);
        return json({ status: "duplicate", message_id: existing[0].id });
      }
    }
  }

  const classification = classifyEmail(email);

  // Insert email_message
  const messageRow = {
    project_id: projectId,
    external_id: email.externalId,
    subject: email.subject,
    sender_email: email.senderEmail,
    sender_name: email.senderName,
    recipients: JSON.stringify(email.recipients),
    cc: JSON.stringify(email.cc),
    body_text: email.bodyText,
    body_html: email.bodyHtml,
    received_at: email.receivedAt,
    has_attachments: email.attachments.length > 0,
    attachment_count: email.attachments.length,
    parsed_type: classification.type,
    parsed_confidence: classification.confidence,
    parsed_metadata: JSON.stringify({
      ingestion_method: "webhook",
      ingested_at: new Date().toISOString(),
    }),
    import_status: "pending",
  };

  const msgResp = await fetch(`${supabaseUrl}/rest/v1/email_messages`, {
    method: "POST",
    headers: supabaseHeaders,
    body: JSON.stringify(messageRow),
  });

  if (!msgResp.ok) {
    const detail = await msgResp.text();
    console.error(`[email-ingest] Insert email_messages failed ${msgResp.status}: ${detail.slice(0, 500)}`);
    return json({ error: "Failed to store email message", detail: detail.slice(0, 200) }, 500);
  }

  const [insertedMsg] = await msgResp.json();
  const messageId = insertedMsg.id;

  // Store attachments
  const storedAttachments: string[] = [];
  for (const att of email.attachments) {
    try {
      const contentHash = await hashContent(att.content);
      const storagePath = `${projectId}/${messageId}/${att.filename}`;

      const uploadResp = await fetch(
        `${supabaseUrl}/storage/v1/object/email-attachments/${storagePath}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
            "Content-Type": att.contentType,
            "x-upsert": "true",
          },
          body: att.content,
        }
      );

      if (!uploadResp.ok) {
        const detail = await uploadResp.text();
        console.error(`[email-ingest] Storage upload failed for ${att.filename}: ${detail.slice(0, 200)}`);
        continue;
      }

      const attRow = {
        message_id: messageId,
        project_id: projectId,
        filename: att.filename,
        content_type: att.contentType,
        size_bytes: att.sizeBytes,
        content_hash: contentHash,
        storage_path: storagePath,
        storage_bucket: "email-attachments",
      };

      const attResp = await fetch(`${supabaseUrl}/rest/v1/email_attachments`, {
        method: "POST",
        headers: { ...supabaseHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify(attRow),
      });

      if (!attResp.ok) {
        const detail = await attResp.text();
        console.error(`[email-ingest] Insert attachment failed for ${att.filename}: ${detail.slice(0, 200)}`);
      } else {
        storedAttachments.push(att.filename);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[email-ingest] Attachment error for ${att.filename}: ${msg}`);
    }
  }

  console.log(
    `[email-ingest] Ingested: project=${projectId} messageId=${messageId} ` +
    `from=${email.senderEmail} subject="${email.subject?.slice(0, 60)}" ` +
    `type=${classification.type}(${classification.confidence}) ` +
    `attachments=${storedAttachments.length}/${email.attachments.length}`
  );

  return json({
    status: "ingested",
    message_id: messageId,
    parsed_type: classification.type,
    parsed_confidence: classification.confidence,
    attachments_stored: storedAttachments.length,
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email-ingest] Unhandled: ${message}`);
    return json({ error: `Internal error: ${message}` }, 500);
  }
});
