/**
 * importRfiLog.js
 *
 * Extract-and-persist pipeline for an RFI log PDF (the format GCs and
 * shops commonly share — header row with Job # + location, then a
 * table of RFI #, date, To, subject, req date, ans date).
 *
 * Pattern mirrors importShippingTicket.js:
 *   uploadRfiLog(file)          — upload via base44.integrations.Core
 *   extractRfiLog({...})        — download base64 + gpt-4o-mini tool_use
 *   resolveProjectForRfiLog(#)  — match job_number → projects row
 *   commitRfiLog({...})         — insert new rfis rows with dedup
 */

import { supabase } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";
import { normalizeRfiNumber, rfiNumberDedupKey } from "@/lib/rfiImportUtils";

const STORAGE_BUCKET  = "app-files";
const MAX_PDF_BYTES   = 32 * 1024 * 1024;
// Anthropic Claude natively ingests PDFs and reliably emits tool_use
// blocks — the previous gpt-4o-mini default was silently returning plain
// text on multi-page RFI logs, which tripped the "AI did not return
// structured data" error downstream. Sonnet 4.5 handles 100+ RFI rows
// without drifting; swap to haiku-4-5 if cost becomes a concern.
const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL    = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are parsing a structural-steel RFI log PDF. The header has a
job number + project name + location. The body is a table of RFIs,
one row per RFI. Call the submit_rfi_log tool with what you extract.

Rules:
  - job_number: digits only from the header "Job #: NNNNN".
  - For each RFI row: rfi_number is the numeric part only (1, 2, 3…) —
    don't include "RFI #" prefix. The client adds that.
  - date_submitted is the first date column ("Date" or "Submitted");
    keep the raw MM/DD/YYYY string and also provide a normalized
    YYYY-MM-DD in iso_submitted.
  - date_required / date_answered: same treatment for the "Req Date" /
    "Ans Date" columns. If blank on the row, leave null.
  - "To" is the assignee (name + firm). Put the full string in
    assigned_to. Don't split it apart.
  - "Subject" goes into title. If the subject wraps onto a second
    line on the page, merge into one string.
  - Never invent data. If a column is empty for a row, leave the
    field null.`;

const RFI_TOOL = {
  name: "submit_rfi_log",
  description: "Parsed RFI log: header + every row.",
  input_schema: {
    type: "object",
    required: ["header", "rfis"],
    properties: {
      header: {
        type: "object",
        properties: {
          job_number:   { type: "string", description: "Digits only, e.g. \"24463\"" },
          job_name:     { type: "string" },
          job_location: { type: "string" },
          log_date:     { type: "string" },
        },
      },
      rfis: {
        type: "array",
        items: {
          type: "object",
          required: ["rfi_number", "title"],
          properties: {
            rfi_number:     { type: "string", description: "Digits only, e.g. \"1\", \"2\"" },
            title:          { type: "string" },
            assigned_to:    { type: "string" },
            date_submitted: { type: "string" },
            iso_submitted:  { type: "string", description: "YYYY-MM-DD" },
            date_required:  { type: "string" },
            iso_required:   { type: "string", description: "YYYY-MM-DD" },
            date_answered:  { type: "string" },
            iso_answered:   { type: "string", description: "YYYY-MM-DD" },
          },
        },
      },
    },
  },
};

async function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Mirror of uploadShippingTicket — same storage path, same guards. */
export async function uploadRfiLog(file) {
  if (!file) throw new Error("No file provided.");
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    throw new Error("RFI log must be a PDF.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(`PDF exceeds 32 MB (${(file.size / 1e6).toFixed(1)} MB).`);
  }
  const { file_url, path } = await base44.integrations.Core.UploadFile({ file });
  return { file_url, storage_path: path || "", file_name: file.name };
}

async function invokeProxyWithDetail(body) {
  const { data, error } = await supabase.functions.invoke("llm-proxy", { body });
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
          try { const parsed = JSON.parse(text); if (parsed?.error) detail = parsed.error; }
          catch { /* keep detail */ }
        }
      }
    }
  } catch { /* ignore */ }
  const prefix = status ? `Upstream ${status}` : "Upstream";
  throw new Error(`${prefix}: ${detail}`);
}

export async function extractRfiLog({
  storage_path,
  file_url,
  model    = DEFAULT_MODEL,
  provider = DEFAULT_PROVIDER,
  // Optional, for telemetry only.
  project_id,
}) {
  const path = storage_path || file_url;
  if (!path) throw new Error("Missing storage path.");
  let buf;
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
    useCase: "rfi-log-import",
    project_id: project_id || undefined,
    provider,
    model,
    // RFI logs can have 100+ rows; 4k tokens was easily hitting ceiling
    // on real-world logs and causing truncated/invalid tool output. 8k
    // comfortably covers a typical construction-project log.
    maxTokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [RFI_TOOL],
    tool_choice: { type: "tool", name: "submit_rfi_log" },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: "Parse this RFI log. Call submit_rfi_log with the header + every RFI row." },
        ],
      },
    ],
  });

  const tool = data?.tool_use?.input;
  if (!tool || typeof tool !== "object") {
    // Surface whatever the model actually said so the user can triage —
    // "did not return structured data" alone is a dead-end message.
    // Common culprits: scanned PDF without OCR (model sees blank page),
    // password-protected PDF, or the tool output hit the token ceiling
    // mid-stream and was dropped.
    const hint = (data?.text || "").trim().slice(0, 280);
    const detail = hint
      ? ` Model said: "${hint}${hint.length >= 280 ? "…" : ""}"`
      : " Model returned no text or tool output (likely a scanned / image-only PDF that would need OCR first).";
    throw new Error(
      `AI did not return structured data from this PDF.${detail} ` +
      `Check the file is a text-readable RFI log, not a scanned image.`
    );
  }
  return {
    header: tool.header || {},
    rfis:   Array.isArray(tool.rfis) ? tool.rfis : [],
    raw:    data?.raw ?? null,
  };
}

export async function resolveProjectForRfiLog(jobNumber) {
  if (!jobNumber) return null;
  const cleaned = String(jobNumber).trim();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, project_number")
    .or(`project_number.eq.${cleaned},project_number.ilike.%${cleaned}%`)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0];
}

/**
 * Insert the new RFIs after the user confirms the preview. Dedupes on
 * (project_id, rfi_number) — existing rows are left untouched so the
 * user can safely re-run the import without creating duplicates. The
 * return value tells the caller how many rows landed vs were skipped.
 */
export async function commitRfiLog({
  header, rfis, projectId, projectName,
}) {
  if (!projectId) throw new Error("Select a project before importing.");
  if (rfis.length === 0) return { created: 0, skipped: 0 };

  // Look up existing RFI numbers for this project so we don't double-insert.
  const existing = await supabase
    .from("rfis")
    .select("rfi_number")
    .eq("project_id", projectId);
  const existingNumbers = new Set(
    (existing.data || [])
      .map((r) => rfiNumberDedupKey(r.rfi_number))
      .filter(Boolean),
  );

  const { rows, skipped } = buildRfiImportRows({ rfis, projectId, projectName, existingNumbers });

  if (rows.length === 0) return { created: 0, skipped };

  const { error } = await supabase.from("rfis").insert(rows);
  if (error) throw new Error(`rfis insert failed: ${error.message}`);
  return { created: rows.length, skipped };
}

export function buildRfiImportRows({ rfis = [], projectId, projectName, existingNumbers = new Set() }) {
  const rows = [];
  const seenNumbers = new Set(existingNumbers);
  let skipped = 0;

  for (const r of rfis) {
    const dedupKey = rfiNumberDedupKey(r.rfi_number);
    if (!dedupKey) continue;
    if (seenNumbers.has(dedupKey)) { skipped++; continue; }
    seenNumbers.add(dedupKey);

    const submitted = normalizeDate(r.iso_submitted || r.date_submitted);
    const required  = normalizeDate(r.iso_required  || r.date_required);
    const answered  = normalizeDate(r.iso_answered  || r.date_answered);

    rows.push({
      project_id:     projectId,
      project_name:   projectName || null,
      rfi_number:     normalizeRfiNumber(r.rfi_number),
      title:          (r.title || "").slice(0, 200),
      question:       (r.title || "").slice(0, 4000),
      assigned_to:    (r.assigned_to || "").slice(0, 200) || null,
      submitted_date: submitted,
      date_required:  required,
      date_answered:  answered,
      status:         answered ? "Closed" : "Open",
      priority:       "Medium",
      ball_in_court:  answered ? "Contractor" : (r.assigned_to || "Engineer"),
    });
  }

  return { rows, skipped };
}

function normalizeDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}
