/**
 * importShippingTicket.ts
 *
 * Extract-and-persist pipeline for a Tekla / fab-shop shipping ticket PDF.
 * Uploads the PDF, asks gpt-4o-mini to pull the header + line items via
 * tool_use (schema-locked so the response can't drift), and returns the
 * structured result to the caller for a preview step. The caller is the
 * one that actually inserts rows — this keeps the AI step idempotent and
 * lets the user review the match before committing.
 *
 * The shape returned here maps 1:1 to the 041 schema. A follow-on
 * `commitShippingTicket()` records one delivery + its N delivery_items
 * through create_delivery(). Both live in this module so the Deliveries UI
 * only imports one helper.
 */

import { supabase } from "@/lib/supabase";
import { integrations } from "@/api/supabaseClient";
import {
  createDeliveryWithItems,
  importedDeliveryTitle,
  loadTotalsFollowUp,
  parseLbs,
  toDeliveryItemPayload,
  wholeOrNull,
} from "@/lib/deliveries/createDeliveryWithItems";

/** Ticket header as the model returns it — every field optional, loosely typed. */
export interface ShippingTicketHeader {
  job_number?: string | null;
  job_name?: string | null;
  load_number?: string | null;
  load_category?: string | null;
  trailer?: string | null;
  carrier?: string | null;
  capacity_lbs?: number | string | null;
  weight_loaded_lbs?: number | string | null;
  assembly_quantity?: number | string | null;
  date_shipped?: string | null;
  sold_to?: string | null;
  ship_to?: string | null;
}

/** One ticket line as the model returns it. */
export interface ShippingTicketItem {
  qty?: number | string | null;
  assembly_mark?: string | null;
  sequence?: string | null;
  profile?: string | null;
  length_text?: string | null;
  length_inches?: number | string | null;
  grade?: string | null;
  finish?: string | null;
  weight_lbs?: number | string | null;
}

export interface ShippingTicketExtraction {
  header: ShippingTicketHeader;
  items: ShippingTicketItem[];
  raw: unknown;
}

export interface UploadedShippingTicket {
  file_url: string;
  storage_path: string;
  file_name: string;
}

export interface ExtractShippingTicketArgs {
  storage_path?: string | null;
  file_url?: string | null;
  model?: string;
  provider?: string;
  project_id?: string | null;
}

export interface TicketProjectMatch {
  id: string;
  name: string | null;
  project_number: string | null;
}

export interface CommitShippingTicketArgs {
  header: ShippingTicketHeader;
  items: ShippingTicketItem[];
  projectId: string | null | undefined;
  projectName?: string | null;
  file_url?: string | null;
  storage_path?: string | null;
  file_name?: string | null;
}

/** llm-proxy response fields this module reads. */
interface LlmProxyResponse {
  error?: string;
  text?: string;
  raw?: unknown;
  tool_use?: { input?: { header?: ShippingTicketHeader; items?: unknown } | null } | null;
}

/**
 * Call llm-proxy with proper error detail extraction. supabase-js returns
 * a generic "Edge Function returned a non-2xx status code" on any upstream
 * error — useless for diagnosing what actually broke. We pull the real
 * status + body from error.context so the UI sees the actual reason
 * (missing OPENAI_API_KEY, rate limit, payload too large, etc.).
 */
async function invokeProxyWithDetail(body: Record<string, unknown>): Promise<{ data: LlmProxyResponse | null }> {
  const { data, error } = await supabase.functions.invoke<LlmProxyResponse>("llm-proxy", { body });
  if (!error && !data?.error) return { data };

  let status = 0;
  let detail = error?.message || data?.error || "llm-proxy invocation failed";
  try {
    const resp = error?.context;
    if (resp) {
      status = resp.status || 0;
      if (typeof resp.text === "function") {
        const text = await resp.text();
        if (text) {
          try {
            const parsed = JSON.parse(text);
            if (parsed?.error) detail = parsed.error;
          } catch { /* keep detail */ }
        }
      }
    }
  } catch { /* ignore */ }
  const prefix = status ? `Upstream ${status}` : "Upstream";
  throw new Error(`${prefix}: ${detail}`);
}

const STORAGE_BUCKET = "app-files";
const MAX_PDF_BYTES  = 32 * 1024 * 1024;
// Was Anthropic Sonnet 4.5 (reliable PDF + tool_use on multi-page
// tickets). Switched to OpenAI gpt-4o (May 2026) after Anthropic
// credit balance exhausted. gpt-4o handles the structured extraction
// well; revert to anthropic/claude-sonnet-4-5 when credits are restored.
const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL    = "gpt-4o";

const SYSTEM_PROMPT = `You are parsing a structural-steel shipping ticket (also called a load list
or bill of lading). Every ticket has a header block with load-level
metadata and a table of line items, one per piece mark. Call the
submit_ticket tool with the data you extract.

Rules:
  - job_number is the numeric part of "Job: NNNNN - <name>". Use only
    the digits.
  - weight_loaded_lbs is the "Weight Loaded" value in pounds (strip
    units like "#" or "lbs").
  - capacity_lbs is the trailer capacity in pounds, same formatting.
  - For each line: weight_lbs is the TOTAL line weight (qty × unit
    weight) exactly as printed. Don't recompute.
  - length_text keeps the original Imperial string ("7'-8 3/4"). Also
    populate length_inches with your best numeric conversion.
  - If a field isn't on the ticket, leave it null — do not guess.`;

const TICKET_TOOL = {
  name: "submit_ticket",
  description: "Return the parsed shipping ticket.",
  input_schema: {
    type: "object",
    required: ["header", "items"],
    properties: {
      header: {
        type: "object",
        properties: {
          job_number:         { type: "string", description: "Digits only, e.g. \"25395\"" },
          job_name:           { type: "string" },
          load_number:        { type: "string" },
          load_category:      { type: "string" },
          trailer:            { type: "string" },
          carrier:            { type: "string" },
          capacity_lbs:       { type: "number" },
          weight_loaded_lbs:  { type: "number" },
          assembly_quantity:  { type: "number" },
          date_shipped:       { type: "string", description: "YYYY-MM-DD" },
          sold_to:            { type: "string" },
          ship_to:            { type: "string" },
        },
      },
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["qty", "assembly_mark"],
          properties: {
            qty:           { type: "integer" },
            assembly_mark: { type: "string" },
            sequence:      { type: "string" },
            profile:       { type: "string", description: "e.g. HSS 8 x 8 x 1/2, W12x26" },
            length_text:   { type: "string" },
            length_inches: { type: "number" },
            grade:         { type: "string", description: "e.g. A500-C, A992" },
            finish:        { type: "string", description: "e.g. P, GALV, Paint" },
            weight_lbs:    { type: "number", description: "Line total, qty × unit" },
          },
        },
      },
    },
  },
};

async function arrayBufferToBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Upload the PDF to storage and return { file_url, storage_path, file_name }.
 */
export async function uploadShippingTicket(file: File | null | undefined): Promise<UploadedShippingTicket> {
  if (!file) throw new Error("No file provided.");
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    throw new Error("Shipping ticket must be a PDF.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(`PDF exceeds 32 MB (${(file.size / 1e6).toFixed(1)} MB).`);
  }
  const { file_url, path } = await integrations.Core.UploadFile({ file, workflow: "attachment" });
  return { file_url, storage_path: path || "", file_name: file.name };
}

/**
 * Run AI extraction on an uploaded ticket. Returns { header, items, raw }.
 * Throws with a readable error on invalid/unparseable PDFs.
 */
export async function extractShippingTicket({
  storage_path,
  file_url,
  model    = DEFAULT_MODEL,
  provider = DEFAULT_PROVIDER,
  // Optional, for telemetry only — when the caller knows the project,
  // pass it through so per-project AI spend rolls up correctly.
  project_id,
}: ExtractShippingTicketArgs): Promise<ShippingTicketExtraction> {
  // Download the file from storage, base64 it.
  const path = storage_path || file_url;
  if (!path) throw new Error("Missing storage path.");
  let buf: ArrayBuffer;
  if (/^https?:\/\//i.test(path)) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`PDF fetch failed (${resp.status}).`);
    buf = await resp.arrayBuffer();
  } else {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
    if (error) throw new Error(`Storage download failed: ${error.message}`);
    buf = await data.arrayBuffer();
  }
  if (buf.byteLength > MAX_PDF_BYTES) {
    throw new Error(`PDF is ${(buf.byteLength / 1e6).toFixed(1)} MB, limit is 32 MB.`);
  }
  const pdfBase64 = await arrayBufferToBase64(buf);

  const { data } = await invokeProxyWithDetail({
    useCase: "shipping-ticket-import",
    project_id: project_id || undefined,
    provider,
    model,
    maxTokens: 4000,
    system: SYSTEM_PROMPT,
    tools: [TICKET_TOOL],
    tool_choice: { type: "tool", name: "submit_ticket" },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: "Parse this shipping ticket. Call submit_ticket with the header + every line item." },
        ],
      },
    ],
  });

  const tool = data?.tool_use?.input;
  if (!tool || typeof tool !== "object") {
    // Same diagnostic treatment as importRfiLog — bubble up what the
    // model actually said so the user can tell the difference between
    // "scanned PDF, needs OCR" and "wrong document type".
    const hint = (data?.text || "").trim().slice(0, 280);
    const detail = hint
      ? ` Model said: "${hint}${hint.length >= 280 ? "…" : ""}"`
      : " Model returned no text or tool output (likely a scanned / image-only PDF that would need OCR first).";
    throw new Error(
      `AI did not return structured data from this PDF.${detail} ` +
      `Check the file is a text-readable shipping ticket, not a scanned image.`
    );
  }
  return {
    header: tool.header || {},
    items:  Array.isArray(tool.items) ? tool.items : [],
    raw:    data?.raw ?? null,
  };
}

/**
 * Resolve a ticket's job_number → projects.id. Tries exact match first,
 * then fuzzy on project_number. Returns null if no match.
 */
export async function resolveProjectForTicket(jobNumber: unknown): Promise<TicketProjectMatch | null> {
  if (!jobNumber) return null;
  // Strip to digits before interpolating into the PostgREST .or() filter.
  // jobNumber is AI-extracted (untrusted); raw values could carry commas /
  // parens / dots that break out of the filter and alter the query. Digits-only
  // matches the CSV importers, and the ilike fallback still hits alphanumeric
  // stored project_numbers (e.g. "24426A").
  const cleaned = String(jobNumber).replace(/\D+/g, "");
  if (!cleaned) return null;
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, project_number")
    .or(`project_number.eq.${cleaned},project_number.ilike.%${cleaned}%`)
    .eq("is_deleted", false)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0];
}

/**
 * Record the ticket as one delivery + its delivery_items after the user
 * confirms the preview. Returns the created delivery row.
 *
 * Goes through create_delivery() (createDeliveryWithItems), which mints the
 * DEL number and inserts the delivery and its lines in one transaction —
 * production refuses a direct `deliveries` insert and any hard delete, so the
 * old insert-then-insert-then-delete-on-failure sequence could not import a
 * ticket at all.
 */
export async function commitShippingTicket({
  header, items, projectId,
  file_url, storage_path, file_name,
}: CommitShippingTicketArgs) {
  if (!projectId) throw new Error("Select a project before importing.");

  // Figure out which date field to use. If date_shipped is in the past (or
  // today), store as actual_date. If it's in the future, store as
  // scheduled_date so the delivery shows up on upcoming-delivery KPIs.
  const dateShipped = normalizeDate(header.date_shipped);
  const today = new Date(); today.setHours(0,0,0,0);
  const shippedDate = dateShipped ? new Date(dateShipped) : null;
  const isHistorical = shippedDate && shippedDate.getTime() <= today.getTime();

  const lines = items.map(toDeliveryItemPayload);
  const description = header.job_name ? `${header.job_name} — Load ${header.load_number ?? "?"}` : null;

  // project_name is looked up by the RPC itself; the caller's copy is not sent.
  return createDeliveryWithItems({
    projectId,
    delivery: {
      delivery_title: importedDeliveryTitle(header.load_number, description, file_name && `Shipping ticket ${file_name}`),
      load_number:    header.load_number || null,
      load_category:  header.load_category || null,
      carrier:        header.trailer || header.carrier || null,
      description,
      status:         isHistorical ? "Delivered" : "Scheduled",
      scheduled_date: isHistorical ? null : dateShipped,
    },
    items: lines,
    followUp: {
      actual_date:          isHistorical ? dateShipped : undefined,
      // Parse weights so the columns are numeric, not "48,000#" strings.
      capacity_lbs:         wholeOrNull(parseLbs(header.capacity_lbs)) ?? undefined,
      shipping_ticket_url:  file_url || undefined,
      shipping_ticket_path: storage_path || undefined,
      shipping_ticket_name: file_name || undefined,
      ...loadTotalsFollowUp(header.assembly_quantity, header.weight_loaded_lbs, lines),
    },
  });
}

// ─── helpers ────────────────────────────────────────────────────────

function normalizeDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // Pass through YYYY-MM-DD, parse MM/DD/YYYY.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [_, mo, d, y] = m;
    return `${y}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}
