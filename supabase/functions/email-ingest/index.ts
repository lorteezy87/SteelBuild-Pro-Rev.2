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
// Attachments arrive two ways: multipart File parts (SendGrid / manual
// forward) or base64 `contentBytes` items in the JSON payload (Power
// Automate / Microsoft Graph). Both decode to the same storage path.
//
// Auth: This endpoint does NOT require a JWT (verify_jwt=false) because
// it receives webhooks from external email services. Instead, it uses
// a shared secret (EMAIL_WEBHOOK_SECRET) supplied in a HEADER — either
// `Authorization: Bearer <secret>` or `x-webhook-secret: <secret>`.
// The former `?secret=` query-parameter form is no longer accepted: a
// credential in a URL ends up in request logs at every hop.
//
// Secrets required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMAIL_WEBHOOK_SECRET
//
// Optional secrets (AI email classification cost guard, #6):
//   OPENAI_API_KEY              — without it, classification uses the free regex path
//   EMAIL_CLASSIFY_DISABLED     — "1"/"true" forces the regex classifier (kill switch)
//   EMAIL_CLASSIFY_DAILY_LIMIT  — per-project rolling-24h cap on paid classify calls
//                                 (default 200; 0 = unlimited). Over the cap → regex.
//   EMAIL_INGEST_TRUSTED_SENDER_DOMAINS — comma-separated global sender-domain allowlist
//   EMAIL_INGEST_TRUSTED_SENDER_DOMAINS_BY_PROJECT — JSON map { "<project-uuid>": ["example.com"] }
//   EMAIL_INGEST_UNTRUSTED_ACTION — "reject" (default) or "flag" (store as rejected)
//
// Deploy:
//   supabase functions deploy email-ingest --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js@2.117.2/edge-runtime.d.ts";
import { EdgeBoundaryError, boundedRequest, configuredLimit, fetchWithDeadline, operationFingerprint, reserveOperation, finishOperation } from "../_shared/edgeOperation.ts";
import { classifyAttachmentContent } from "../_shared/attachmentContent.ts";
import { computeCostUsd } from "../llm-proxy/providers/cost.ts";
import { reportError } from "../_shared/reportError.ts";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  MAX_ATTACHMENT_COUNT,
  sanitizeAttachmentName,
} from "../_shared/attachments.ts";

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
  content: Uint8Array<ArrayBuffer>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Authentication ─────────────────────────────────────────────────────────

/**
 * Length-independent comparison. `===` on a secret leaks its prefix through
 * timing; not a practical remote attack over HTTP in most setups, but this is a
 * bearer credential for an unauthenticated endpoint and the fix is three lines.
 * Mirrors constantTimeHexEqual in _shared/maintenance-auth.ts.
 */
function secretsMatch(supplied: string | null, expected: string): boolean {
  if (!supplied) return false;
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(expected);
  // Compare a fixed number of bytes either way so the loop count does not
  // depend on the supplied length; the length check still decides the result.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

function authenticateWebhook(req: Request): boolean {
  const secret = Deno.env.get("EMAIL_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[email-ingest] EMAIL_WEBHOOK_SECRET not configured");
    return false;
  }

  // Headers only.
  //
  // The `?secret=` query-parameter path is REMOVED. A credential in a URL is
  // written to every hop that logs request lines — Supabase's own request logs,
  // any proxy or CDN in front, the sender's outbound logs, and browser history
  // if anyone ever pastes the URL. It is the one place a secret leaks without
  // anybody being attacked. SendGrid Inbound Parse, Power Automate and a manual
  // forward can all set a header instead; if a caller genuinely cannot, rotate
  // to a dedicated per-sender secret rather than putting it back in the URL.
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ") && secretsMatch(authHeader.slice(7), secret)) return true;

  if (secretsMatch(req.headers.get("x-webhook-secret"), secret)) return true;

  if (new URL(req.url).searchParams.has("secret")) {
    console.warn(
      "[email-ingest] rejected a request carrying ?secret= — the query-param auth path was removed; " +
      "send the shared secret in the x-webhook-secret header instead.",
    );
  }

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeEmail(raw: string): string {
  return extractEmailAddress(raw).trim().toLowerCase();
}

function extractDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

function parseDomainCsv(csv: string | null | undefined): Set<string> {
  if (!csv) return new Set<string>();
  return new Set(
    csv
      .split(",")
      .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean),
  );
}

function resolveTrustedDomainsForProject(projectId: string): Set<string> {
  const domains = parseDomainCsv(Deno.env.get("EMAIL_INGEST_TRUSTED_SENDER_DOMAINS"));
  const projectMapRaw = Deno.env.get("EMAIL_INGEST_TRUSTED_SENDER_DOMAINS_BY_PROJECT");
  if (!projectMapRaw) return domains;
  try {
    const parsed = JSON.parse(projectMapRaw) as Record<string, string | string[]>;
    const projectValue = parsed[projectId] ?? parsed["*"];
    const projectList = Array.isArray(projectValue)
      ? projectValue
      : typeof projectValue === "string"
        ? projectValue.split(",")
        : [];
    for (const entry of projectList) {
      const normalized = String(entry).trim().toLowerCase().replace(/^@/, "");
      if (normalized) domains.add(normalized);
    }
  } catch (err) {
    console.error("[email-ingest] trust_configuration_invalid");
  }
  return domains;
}

async function fetchVerifiedProjectMailboxAddresses(
  supabaseUrl: string,
  serviceKey: string,
  projectId: string,
): Promise<Set<string>> {
  const resp = await fetchWithDeadline(
    `${supabaseUrl}/rest/v1/rpc/get_verified_email_mailboxes`,
    {
      method: "POST",
      headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_project_id: projectId }),
    },
  );
  if (!resp.ok) {
    throw new Error("Mailbox verification lookup failed");
  }
  const rows = await resp.json();
  const addresses = new Set<string>();
  if (!Array.isArray(rows) || !rows.every((row) => row && typeof row.email_address === "string"
    && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(row.email_address))) {
    throw new Error("Invalid mailbox verification result");
  }
  for (const row of rows) addresses.add(row.email_address.toLowerCase());
  return addresses;
}

type SenderTrustDecision = {
  trusted: boolean;
  senderNormalized: string;
  senderDomain: string | null;
  trustReason: "mapped_mailbox_sender" | "trusted_sender_domain" | "untrusted_sender";
};

function evaluateSenderTrust(
  senderEmailRaw: string,
  mailboxAddresses: Set<string>,
  trustedDomains: Set<string>,
): SenderTrustDecision {
  const senderNormalized = normalizeEmail(senderEmailRaw);
  const senderDomain = extractDomain(senderNormalized);
  if (senderNormalized && mailboxAddresses.has(senderNormalized)) {
    return {
      trusted: true,
      senderNormalized,
      senderDomain,
      trustReason: "mapped_mailbox_sender",
    };
  }
  if (senderDomain && trustedDomains.has(senderDomain)) {
    return {
      trusted: true,
      senderNormalized,
      senderDomain,
      trustReason: "trusted_sender_domain",
    };
  }
  return {
    trusted: false,
    senderNormalized,
    senderDomain,
    trustReason: "untrusted_sender",
  };
}

function extractDisplayName(raw: string): string {
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : extractEmailAddress(raw);
}

function parseRecipientList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((r) => extractEmailAddress(r.trim())).filter(Boolean);
}

/** Strip HTML tags and decode common HTML entities to produce clean text. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract sender email from Power Automate nested format or flat string.
 * Power Automate: { emailAddress: { name: "...", address: "..." } }
 * Generic/SendGrid: "Name <email@example.com>" or plain "email@example.com"
 */
// deno-lint-ignore no-explicit-any
function extractSenderEmail(from: any): string {
  if (!from) return "";
  if (typeof from === "object" && from.emailAddress?.address) {
    return String(from.emailAddress.address).trim();
  }
  return extractEmailAddress(String(from));
}

// deno-lint-ignore no-explicit-any
function extractSenderName(from: any): string {
  if (!from) return "";
  if (typeof from === "object" && from.emailAddress) {
    return String(from.emailAddress.name || from.emailAddress.address || "").trim();
  }
  return extractDisplayName(String(from));
}

/**
 * Parse recipients from Power Automate array or flat comma-separated string.
 * Power Automate: [{ emailAddress: { name: "...", address: "..." } }, ...]
 * Generic: "a@b.com, c@d.com"
 */
// deno-lint-ignore no-explicit-any
function parseRecipientsField(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((r) => {
        if (typeof r === "object" && r.emailAddress?.address) {
          return String(r.emailAddress.address).trim();
        }
        return typeof r === "string" ? extractEmailAddress(r) : "";
      })
      .filter(Boolean);
  }
  if (typeof raw === "object") return [];
  return parseRecipientList(String(raw));
}

/**
 * Decode a standard (non-url-safe) base64 string to bytes. Power Automate
 * and Microsoft Graph deliver attachment payloads as a single base64
 * `contentBytes` string.
 */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const clean = b64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Parse attachments from a Power Automate / Microsoft Graph JSON payload.
 * Power Automate (Office 365 Outlook): [{ Name, ContentType, ContentBytes, Size, IsInline }]
 * Microsoft Graph (fileAttachment):    [{ name, contentType, contentBytes, size, isInline }]
 *
 * Inline parts (signature logos, embedded images) are skipped so the
 * inbox shows real document attachments, not boilerplate. Items without a
 * decodable `contentBytes` string are ignored. The decoded bytes flow
 * through the same Storage upload + email_attachments insert path used by
 * the multipart parser.
 */
// deno-lint-ignore no-explicit-any
function parseJsonAttachments(raw: any): ParsedAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    if ((item.isInline ?? item.IsInline) === true) continue;
    const contentBytes = item.contentBytes ?? item.ContentBytes;
    if (!contentBytes || typeof contentBytes !== "string") continue;
    const filename = String(item.name || item.Name || "attachment");
    const contentType = String(item.contentType || item.ContentType || "application/octet-stream");
    try {
      const content = base64ToBytes(contentBytes);
      if (content.byteLength === 0) continue;
      out.push({ filename, contentType, sizeBytes: content.byteLength, content });
    } catch (err) {
      console.error("[email-ingest] attachment_decode_failed");
    }
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function parseJsonPayload(body: Record<string, any>): Promise<ParsedEmail> {
  const subject = String(body.subject || body.Subject || "");

  // ── Sender — Power Automate nested vs flat string ───────────────────
  const fromRaw = body.from || body.From || body.sender || body.Sender || "";
  const senderEmail = extractSenderEmail(fromRaw);
  const senderName = extractSenderName(fromRaw);

  // ── Recipients — Power Automate array vs flat string ────────────────
  const recipients = parseRecipientsField(
    body.toRecipients || body.to || body.To || body.recipients
  );
  const cc = parseRecipientsField(
    body.ccRecipients || body.cc || body.Cc
  );

  // ── Body — Power Automate nested { content, contentType } vs flat ──
  let bodyText = "";
  let bodyHtml = "";
  const bodyField = body.body || body.Body;
  if (bodyField && typeof bodyField === "object" && (bodyField.content || bodyField.Content)) {
    // Power Automate / Microsoft Graph format: { contentType: "HTML", content: "..." }
    const content = String(bodyField.content || bodyField.Content || "");
    const contentType = String(bodyField.contentType || bodyField.ContentType || "").toLowerCase();
    if (contentType === "html" || content.includes("<")) {
      bodyHtml = content;
      bodyText = stripHtml(content);
    } else {
      bodyText = content;
    }
  } else {
    // Flat fields — check for dedicated text/html fields first
    const rawText = body.text || body.body_text || body.bodyText || "";
    const rawHtml = body.html || body.body_html || body.bodyHtml || body.BodyHtml || "";

    if (rawText || rawHtml) {
      bodyText = String(rawText);
      bodyHtml = String(rawHtml);
    } else if (typeof bodyField === "string" && bodyField) {
      // body is a flat string — could be HTML or plain text
      if (bodyField.trim().startsWith("<") || bodyField.includes("<html") || bodyField.includes("<body")) {
        bodyHtml = bodyField;
        bodyText = stripHtml(bodyField);
      } else {
        bodyText = bodyField;
      }
    }
  }

  // If we still have no bodyText but have bodyPreview (Graph), use it
  if (!bodyText && body.bodyPreview) {
    bodyText = String(body.bodyPreview);
  }

  // ── Message ID — Power Automate internetMessageId vs flat ───────────
  const messageId = String(
    body.internetMessageId || body.message_id || body.messageId ||
    body["Message-ID"] || (body.headers && body.headers.messageId) || ""
  );

  // ── Date — Power Automate receivedDateTime vs flat ──────────────────
  const date = String(
    body.receivedDateTime || body.date || body.Date ||
    body.received_at || body.receivedAt || ""
  );

  return {
    externalId: messageId || generateMessageId(),
    subject,
    senderEmail,
    senderName,
    recipients,
    cc,
    bodyText,
    bodyHtml,
    receivedAt: date ? new Date(date).toISOString() : new Date().toISOString(),
    attachments: parseJsonAttachments(body.attachments || body.Attachments),
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

// ── Classification types ───────────────────────────────────────────────────

interface EmailClassification {
  classifier?: "ai" | "regex";
  type: string;
  confidence: number;
  extracted: ExtractedFields;
}

interface ExtractedFields {
  rfi_number: string | null;
  submittal_number: string | null;
  drawing_refs: string[];
  due_date: string | null;
  responsible_party: string | null;
  priority: string | null;
  related_entities: string[];
  summary: string | null;
  action_required: string | null;
}

const EMPTY_EXTRACTED: ExtractedFields = {
  rfi_number: null,
  submittal_number: null,
  drawing_refs: [],
  due_date: null,
  responsible_party: null,
  priority: null,
  related_entities: [],
  summary: null,
  action_required: null,
};

// ── Regex fallback classification ─────────────────────────────────────────

function classifyEmailRegex(email: ParsedEmail): EmailClassification {
  const subjectLower = (email.subject || "").toLowerCase();
  const bodyLower = (email.bodyText || "").toLowerCase();
  const combined = `${subjectLower} ${bodyLower}`;

  const rfiPatterns = ["rfi", "request for information", "rfi #", "rfi-", "information request"];
  if (rfiPatterns.some((p) => combined.includes(p))) {
    return { type: "rfi", confidence: 0.85, extracted: EMPTY_EXTRACTED };
  }

  const submittalPatterns = ["submittal", "shop drawing", "product data", "sample", "mock-up", "mockup"];
  if (submittalPatterns.some((p) => combined.includes(p))) {
    return { type: "submittal", confidence: 0.80, extracted: EMPTY_EXTRACTED };
  }

  const transmittalPatterns = ["transmittal", "transmitted", "enclosed please find", "attached please find", "for your review"];
  if (transmittalPatterns.some((p) => combined.includes(p))) {
    return { type: "transmittal", confidence: 0.70, extracted: EMPTY_EXTRACTED };
  }

  const actionPatterns = [
    "action required", "action item", "please confirm", "please advise",
    "deadline", "due date", "by end of day", "eod", "asap", "urgent",
    "follow up", "follow-up",
  ];
  if (actionPatterns.some((p) => combined.includes(p))) {
    return { type: "action_item", confidence: 0.65, extracted: EMPTY_EXTRACTED };
  }

  return { type: "general", confidence: 0.50, extracted: EMPTY_EXTRACTED };
}

// ── AI Classification via OpenAI ──────────────────────────────────────────

const EMAIL_CLASSIFY_PROMPT = `You are a construction project email classifier for a structural steel fabrication and erection company. Analyze the email and return a JSON object.

Classify the email into exactly one type:
- "rfi" — Request for Information (questions about design, specifications, field conditions)
- "submittal" — Shop drawing submittals, product data, samples, approval requests
- "transmittal" — Document transmittals, file deliveries, drawing distributions
- "change_order" — Change orders, contract modifications, scope changes, PCOs, CORs
- "action_item" — Action items, tasks, requests requiring a response or action
- "general" — General correspondence that doesn't fit above categories

Extract these fields when present (null if not found):
- rfi_number: RFI identifier (e.g. "RFI-042", "RFI 12")
- submittal_number: Submittal identifier (e.g. "Sub-003", "Submittal 15")
- drawing_refs: Array of drawing/sheet references (e.g. ["S3.2", "A2.1", "SK-101"])
- due_date: Due date or deadline in ISO format (YYYY-MM-DD) if mentioned
- responsible_party: Person or company expected to take action
- priority: "critical", "high", "medium", or "low" based on urgency signals
- related_entities: Array of work packages, sequences, areas mentioned (e.g. ["WP-104", "Seq 2", "Area B"])
- summary: One-sentence summary of the email's purpose (max 120 chars)
- action_required: What action is needed, if any (max 120 chars, null if informational only)

Return ONLY valid JSON matching this schema:
{
  "type": string,
  "confidence": number (0.0-1.0),
  "rfi_number": string|null,
  "submittal_number": string|null,
  "drawing_refs": string[],
  "due_date": string|null,
  "responsible_party": string|null,
  "priority": string|null,
  "related_entities": string[],
  "summary": string|null,
  "action_required": string|null
}`;

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

async function classifyEmailWithAI(email: ParsedEmail, projectId: string): Promise<EmailClassification> {
  // Limits and ledger failures fall back to free regex without paid dispatch.
  if (isTruthy(Deno.env.get("EMAIL_CLASSIFY_DISABLED"))) {
    return classifyEmailRegex(email);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.log("[email-ingest] OPENAI_API_KEY not set, falling back to regex");
    return classifyEmailRegex(email);
  }

  const bodySnippet = (email.bodyText || "").slice(0, 2000);
  const attachmentList = email.attachments.map((a) => a.filename).join(", ");

  const userContent = [
    `Subject: ${email.subject || "(no subject)"}`,
    `From: ${email.senderName || ""} <${email.senderEmail}>`,
    `To: ${email.recipients.join(", ")}`,
    attachmentList ? `Attachments: ${attachmentList}` : null,
    ``,
    `Body:`,
    bodySnippet,
  ].filter(Boolean).join("\n");

  let reservation: Awaited<ReturnType<typeof reserveOperation>>;
  try {
    const fingerprint = await operationFingerprint({ prompt: EMAIL_CLASSIFY_PROMPT, userContent });
    // A provider Message-ID is preferred. Manual forwards lacking one use the
    // same content digest across retries; generateMessageId is not a retry key.
    const key = email.externalId.startsWith('manual-') ? fingerprint
      : await operationFingerprint({ externalId: email.externalId });
    reservation = await reserveOperation({ kind: 'email-classify', userId: null, projectId, key, fingerprint,
      countLimit: configuredLimit('EMAIL_CLASSIFY_DAILY_LIMIT', 200), reservedCost: .01944 });
    if (reservation.replay) return reservation.replay.result as EmailClassification;
  } catch {
    return classifyEmailRegex(email);
  }

  try {
    const t0 = performance.now();
    const resp = await fetchWithDeadline("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: EMAIL_CLASSIFY_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: 400,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    }, 20_000, 64 * 1024);

    const latencyMs = Math.round(performance.now() - t0);

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("[email-ingest] classifier_provider_failed", { status: resp.status });
      throw new Error("Classifier provider rejected request");
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Classifier provider returned no content");
    }

    const parsed = JSON.parse(text);
    const validTypes = ["rfi", "submittal", "transmittal", "change_order", "action_item", "general"];
    const type = validTypes.includes(parsed.type) ? parsed.type : "general";
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    const extracted: ExtractedFields = {
      rfi_number: parsed.rfi_number || null,
      submittal_number: parsed.submittal_number || null,
      drawing_refs: Array.isArray(parsed.drawing_refs) ? parsed.drawing_refs.filter((r: unknown) => typeof r === "string") : [],
      due_date: parsed.due_date || null,
      responsible_party: parsed.responsible_party || null,
      priority: ["critical", "high", "medium", "low"].includes(parsed.priority) ? parsed.priority : null,
      related_entities: Array.isArray(parsed.related_entities) ? parsed.related_entities.filter((r: unknown) => typeof r === "string") : [],
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 120) : null,
      action_required: typeof parsed.action_required === "string" ? parsed.action_required.slice(0, 120) : null,
    };

    const inputTokens = data?.usage?.prompt_tokens || null;
    const outputTokens = data?.usage?.completion_tokens || null;

    console.log("[email-ingest] classification_completed");

    // Best-effort telemetry
    await logClassifyTelemetry(inputTokens, outputTokens, latencyMs, true, null, projectId);
    const classification: EmailClassification = { type, confidence, extracted, classifier: 'ai' };
    await finishOperation(reservation.operationId, 'completed', classification, 200,
      computeCostUsd('openai', 'gpt-4o-mini', inputTokens, outputTokens));
    return classification;
  } catch (err) {
    console.error("[email-ingest] classifier_failed");
    await finishOperation(reservation.operationId, 'unknown').catch(() => {});
    return classifyEmailRegex(email);
  }
}

async function logClassifyTelemetry(
  inputTokens: number | null,
  outputTokens: number | null,
  latencyMs: number,
  success: boolean,
  errorKind: string | null,
  projectId: string | null = null,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return;

  const inTok = Number(inputTokens) || 0;
  const outTok = Number(outputTokens) || 0;
  const costUsd = (inTok * 0.15 + outTok * 0.60) / 1_000_000;

  try {
    await fetchWithDeadline(`${supabaseUrl}/rest/v1/llm_telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        use_case: "email-classify",
        provider: "openai",
        model: "gpt-4o-mini",
        user_id: null,
        project_id: projectId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: Math.round(costUsd * 1_000_000) / 1_000_000,
        latency_ms: latencyMs,
        success,
        error_kind: errorKind,
        metadata: { source: "email-ingest" },
      }),
    });
  } catch {
    // best-effort
  }
}

// ── Content Hash ───────────────────────────────────────────────────────────

async function hashContent(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Main Handler ───────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok");
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

  // Reject malformed ids before they ever reach a PostgREST filter, and avoid
  // the confusing 500 PostgREST returns for a non-UUID project_id.
  if (!UUID_RE.test(projectId)) {
    return json({ error: "Invalid project_id format" }, 400);
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

  // The shared webhook secret authorizes the *sender*, not the *target
  // project*. Confirm the project exists and is active so a leaked secret
  // can't inject email/attachments into arbitrary or bogus project ids.
  try {
    const projResp = await fetchWithDeadline(
      `${supabaseUrl}/rest/v1/projects?id=eq.${projectId}&is_deleted=eq.false&select=id&limit=1`,
      { headers: { "apikey": serviceKey, "Authorization": `Bearer ${serviceKey}` } },
    );
    const projRows = projResp.ok ? await projResp.json() : null;
    if (!Array.isArray(projRows) || projRows.length === 0) {
      return json({ error: "Unknown or inactive project" }, 404);
    }
  } catch (err) {
    console.error("[email-ingest] project_validation_failed");
    return json({ error: "Project validation failed" }, 500);
  }

  // Parse email based on content type
  const contentType = req.headers.get("content-type") || "";
  let email: ParsedEmail;

  try {
    req = await boundedRequest(req, 40 * 1024 * 1024);
    if (contentType.includes("multipart/form-data")) {
      email = await parseMultipartPayload(req);
    } else {
      const body = await req.json();
      email = await parseJsonPayload(body);
    }
  } catch (err) {
    console.error("[email-ingest] payload_invalid");
    return json({ error: "Invalid or oversized email payload" }, err instanceof EdgeBoundaryError ? err.status : 400);
  }

  if (!email.senderEmail) {
    return json({ error: "No sender email found in payload" }, 400);
  }

  const trustedDomains = resolveTrustedDomainsForProject(projectId);
  let mailboxAddresses: Set<string>;
  try {
    mailboxAddresses = await fetchVerifiedProjectMailboxAddresses(supabaseUrl, serviceKey, projectId);
  } catch (err) {
    console.error("[email-ingest] sender_trust_lookup_failed");
    return json({ error: "Failed to validate sender trust" }, 500);
  }
  if (mailboxAddresses.size === 0 && trustedDomains.size === 0) {
    console.error("[email-ingest] sender_trust_unconfigured");
    return json(
      {
        error: "Sender trust is not configured for this project",
        code: "sender_trust_unconfigured",
      },
      403,
    );
  }
  const senderTrust = evaluateSenderTrust(email.senderEmail, mailboxAddresses, trustedDomains);
  const untrustedAction = (Deno.env.get("EMAIL_INGEST_UNTRUSTED_ACTION") || "reject").toLowerCase();
  const shouldFlagUntrusted = untrustedAction === "flag";
  if (!senderTrust.trusted && !shouldFlagUntrusted) {
    console.warn("[email-ingest] sender_rejected");
    return json(
      {
        error: "Sender is not trusted for this project",
        code: "untrusted_sender",
      },
      403,
    );
  }

  // Quarantine mode retains reviewable text only. It cannot buy classification
  // or publish attachments for a sender outside the operator's trusted bindings.
  const suppliedAttachmentCount = email.attachments.length;
  if (!senderTrust.trusted) { email.attachments = []; email.bodyHtml = ''; }
  else {
    let admittedBytes = 0;
    email.attachments = email.attachments.slice(0, MAX_ATTACHMENT_COUNT).filter(att => {
      if (att.content.byteLength > MAX_ATTACHMENT_BYTES || admittedBytes + att.content.byteLength > MAX_ATTACHMENTS_TOTAL_BYTES) return false;
      const admission = classifyAttachmentContent({ filename: att.filename, contentType: att.contentType, bytes: att.content });
      if (!admission.allowed) return false;
      att.contentType = admission.contentType;
      att.sizeBytes = att.content.byteLength;
      admittedBytes += att.sizeBytes;
      return true;
    });
  }

  // Dedup check
  if (email.externalId && !email.externalId.startsWith("manual-")) {
    const dedupResp = await fetchWithDeadline(
      `${supabaseUrl}/rest/v1/email_messages?project_id=eq.${projectId}&external_id=eq.${encodeURIComponent(email.externalId)}&select=id&limit=1`,
      { headers: supabaseHeaders }
    );
    if (dedupResp.ok) {
      const existing = await dedupResp.json();
      if (Array.isArray(existing) && existing.length > 0) {
        console.log("[email-ingest] duplicate_skipped");
        return json({ status: "duplicate", message_id: existing[0].id });
      }
    }
  }

  const classification = senderTrust.trusted ? await classifyEmailWithAI(email, projectId) : classifyEmailRegex(email);

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
      classifier: classification.classifier ?? "regex",
      attachments_dropped: suppliedAttachmentCount - email.attachments.length,
      sender_trust: {
        trusted: senderTrust.trusted,
        trust_reason: senderTrust.trustReason,
        domain: senderTrust.senderDomain,
      },
      extracted: classification.extracted,
    }),
    import_status: senderTrust.trusted ? "pending" : "rejected",
  };

  const msgResp = await fetchWithDeadline(`${supabaseUrl}/rest/v1/email_messages`, {
    method: "POST",
    headers: supabaseHeaders,
    body: JSON.stringify(messageRow),
  });

  if (!msgResp.ok) {
    console.error("[email-ingest] message_record_failed", { status: msgResp.status });
    return json({ error: "Failed to store email message" }, 500);
  }

  const [insertedMsg] = await msgResp.json();
  const messageId = insertedMsg.id;

  // Store attachments (bounded + sanitized — see _shared/attachments.ts, #7).
  // External senders control both the filename and the payload, so cap the
  // count/size, drop dangerous extensions, and sanitize the name before it ever
  // enters a storage path (a name like "../x" or "a/b" would otherwise escape
  // the per-message prefix).
  if (email.attachments.length > MAX_ATTACHMENT_COUNT) {
    console.warn("[email-ingest] attachment_count_exceeded");
  }
  const incomingAttachments = email.attachments.slice(0, MAX_ATTACHMENT_COUNT);
  const storedAttachments: string[] = [];
  let attachmentBytesTotal = 0;
  for (const att of incomingAttachments) {
    try {
      if (att.sizeBytes > MAX_ATTACHMENT_BYTES) {
        console.warn("[email-ingest] attachment_size_exceeded");
        continue;
      }
      if (attachmentBytesTotal + att.sizeBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
        console.warn(`[email-ingest] per-message attachment total cap reached; remaining dropped`);
        break;
      }
      attachmentBytesTotal += att.sizeBytes;

      const safeName = sanitizeAttachmentName(att.filename);
      const contentHash = await hashContent(att.content);
      const storagePath = `${projectId}/${messageId}/${safeName}`;

      const uploadResp = await fetchWithDeadline(
        `${supabaseUrl}/storage/v1/object/email-attachments/${storagePath}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
            "Content-Type": att.contentType,
            "Content-Disposition": "attachment",
            "x-upsert": "true",
          },
          body: att.content,
        }
      );

      if (!uploadResp.ok) {
        const detail = await uploadResp.text();
        console.error("[email-ingest] attachment_upload_failed");
        continue;
      }

      const attRow = {
        message_id: messageId,
        project_id: projectId,
        filename: safeName,
        content_type: att.contentType,
        size_bytes: att.sizeBytes,
        content_hash: contentHash,
        storage_path: storagePath,
        storage_bucket: "email-attachments",
      };

      const attResp = await fetchWithDeadline(`${supabaseUrl}/rest/v1/email_attachments`, {
        method: "POST",
        headers: { ...supabaseHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify(attRow),
      });

      if (!attResp.ok) {
        const detail = await attResp.text();
        console.error("[email-ingest] attachment_record_failed");
      } else {
        storedAttachments.push(safeName);
      }
    } catch (err) {
      console.error("[email-ingest] attachment_failed");
    }
  }

  // Avoid logging sender address + subject (correspondence PII). Keep ids,
  // classification, and counts — enough to debug ingestion without leaking
  // who wrote what.
  console.log("[email-ingest] ingestion_completed");

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
    await reportError(err, "email-ingest", { unhandled: true });
    return json({ error: err instanceof EdgeBoundaryError ? err.message : "Email ingestion failed" }, err instanceof EdgeBoundaryError ? err.status : 500);
  }
});
