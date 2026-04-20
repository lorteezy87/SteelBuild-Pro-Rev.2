/**
 * analyzeDrawing.js
 *
 * Runs Anthropic PDF analysis on a drawing PDF via the llm-proxy Supabase
 * Edge Function. Persists the result to the drawing_analyses /
 * drawing_sheets / drawing_findings tables.
 *
 * Input contract — `analysis` row already inserted with status='pending':
 *   { id, file_url, storage_path, file_name, project_id, drawing_stage, ... }
 *
 * Output: { sheets, findings, aiSummary } — same shape that gets persisted.
 */

import { supabase } from "@/lib/supabase";
import { importAnalyzedDrawings } from "@/lib/importAnalyzedDrawings";

/**
 * Invoke llm-proxy with automatic retry on any transient upstream failure.
 *
 * `supabase.functions.invoke` returns a generic "Edge Function returned a
 * non-2xx status code" when the upstream is 429 — too vague to decide
 * retry on. So we retry ALL errors (not just detected 429s) with
 * jittered exponential backoff. The long backoff covers Anthropic's
 * rolling 60-second TPM window; transient Supabase/network errors get a
 * free retry as a bonus.
 *
 * The optional `onRetry` callback is awaited between attempts so the
 * caller can update row.error_message (e.g. "Retry 2/5 after 429, waiting 24s…")
 * so the user sees progress on the UI without refreshing.
 */
async function invokeLlmProxy(body, { maxAttempts = 5, onRetry } = {}) {
  let lastStatus = 0;
  let lastDetail = "Upstream request failed";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke("llm-proxy", { body });
      if (!error && !data?.error) return { data };

      // Try to extract the real status + Anthropic error text from the
      // raw Response on error.context. If any of this throws, we still
      // retry — we just won't be able to show a precise status.
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
      } catch { /* ignore — we'll retry anyway */ }

      lastStatus = status;
      lastDetail = detail;
    } catch (thrown) {
      lastDetail = thrown?.message || String(thrown);
    }

    if (attempt < maxAttempts) {
      const base = 15000 * Math.pow(2, attempt - 1); // 15s, 30s, 60s, 120s
      const delay = base + Math.floor(Math.random() * 3000);
      if (typeof onRetry === "function") {
        try {
          await onRetry({ attempt, maxAttempts, delay, status: lastStatus, detail: lastDetail });
        } catch { /* onRetry is best-effort */ }
      }
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
  }
  const prefix = lastStatus ? `Upstream ${lastStatus}` : "Upstream";
  throw new Error(`${prefix}: ${lastDetail} (gave up after ${maxAttempts} attempts)`);
}

// Hard caps for document blocks (so we fail fast with a useful message
// instead of a generic 400).
const MAX_PDF_BYTES = 32 * 1024 * 1024; // 32 MB (Anthropic), tighter on OpenAI
// Default to OpenAI GPT-4o-mini — roughly 20× cheaper than Sonnet 4.6
// for the structured sheet-index + findings extraction we do here. Quality
// tradeoff is small because output goes through a forced tool_use schema.
// Override per-call by passing { model, provider } to analyzeDrawing().
const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL    = "gpt-4o-mini";
const STORAGE_BUCKET   = "app-files";

// Kept in lockstep with the CHECK constraint on drawing_findings.finding_type
// + drawing_findings.severity. Any AI output outside these sets is coerced
// to a safe fallback on the client so the insert never fails the check.
const VALID_FINDING_TYPES = new Set([
  "missing_info","coordination_conflict","callout_issue",
  "revision_delta","dimension_concern","aess_concern",
]);
const VALID_SEVERITIES = new Set(["critical","high","medium","low","info"]);
const VALID_SHEET_CATEGORIES = new Set(["structural","erection","detailing","shop"]);

function normalizeFindingType(raw) {
  if (!raw) return "missing_info";
  const norm = String(raw).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (VALID_FINDING_TYPES.has(norm)) return norm;
  // Near-match heuristics so we keep as much of the signal as possible.
  if (norm.includes("coord"))       return "coordination_conflict";
  if (norm.includes("callout"))     return "callout_issue";
  if (norm.includes("aess"))        return "aess_concern";
  if (norm.includes("dim"))         return "dimension_concern";
  if (norm.includes("revision") ||
      norm.includes("delta"))        return "revision_delta";
  return "missing_info";
}

function normalizeSeverity(raw) {
  if (!raw) return "info";
  const norm = String(raw).trim().toLowerCase();
  if (VALID_SEVERITIES.has(norm)) return norm;
  if (norm.startsWith("crit")) return "critical";
  if (norm.startsWith("hi"))   return "high";
  if (norm.startsWith("med"))  return "medium";
  if (norm.startsWith("lo"))   return "low";
  return "info";
}

function normalizeCategory(raw) {
  if (!raw) return null;
  const norm = String(raw).trim().toLowerCase();
  if (VALID_SHEET_CATEGORIES.has(norm)) return norm;
  if (norm.includes("struct"))   return "structural";
  if (norm.includes("erect"))    return "erection";
  if (norm.includes("detail"))   return "detailing";
  if (norm.includes("shop"))     return "shop";
  return null; // column is nullable — OK to drop unknown
}

const SYSTEM_PROMPT = `You are a senior structural steel project manager analyzing a drawing set.
Return your analysis through the submit_analysis tool. All fields are required.

Focus on issues a PM/detailer would flag before fab release:
  - missing bolt callouts (A325/A490, SC/N/X, edge distance)
  - AESS class omissions (1–4) or conflicting AESS requirements
  - embed elevation conflicts (top-of-concrete vs. top-of-steel ambiguity)
  - column splice location clarity (elevation, orientation, field vs shop)
  - connection type ambiguity (shear tab vs bolted clip vs moment vs seismic)
  - revision clouds without narrative description in the revision block
  - grid or column line mismatches between plan and elevation
  - dimension chain errors (sum ≠ overall, floating dimensions, missing hold)

Sheet categories: 'structural' (S-series), 'erection' (E-series),
'detailing' (D-series), 'shop' (SH-series). Return the literal lowercase
string.

Severity guidance:
  critical = blocks fabrication or creates safety risk
  high     = blocks release of a sheet or assembly
  medium   = needs resolution before shop start
  low      = detailing cleanup, will not block fab
  info     = observation, no action needed

Be specific: every description must cite a sheet number and a location
on the sheet (grid line, detail callout, elevation). Generic findings
are not useful.`;

const ANALYSIS_TOOL = {
  name: "submit_analysis",
  description: "Return the structured drawing-set analysis.",
  input_schema: {
    type: "object",
    required: ["sheet_index", "ai_summary", "findings"],
    properties: {
      sheet_index: {
        type: "array",
        description: "Every sheet extracted from the PDF, in page order.",
        items: {
          type: "object",
          required: ["sheet_number", "title", "category"],
          properties: {
            sheet_number: { type: "string" },
            title:        { type: "string" },
            category:     { type: "string", enum: ["structural", "erection", "detailing", "shop"] },
            page_index:   { type: "integer" },
          },
        },
      },
      ai_summary: {
        type: "string",
        description: "2–3 sentence overview of the set and top risks.",
      },
      findings: {
        type: "array",
        items: {
          type: "object",
          required: ["sheet_number", "finding_type", "severity", "description", "recommended_action"],
          properties: {
            sheet_number:       { type: "string" },
            finding_type:       { type: "string", enum: ["missing_info","coordination_conflict","callout_issue","revision_delta","dimension_concern","aess_concern"] },
            severity:           { type: "string", enum: ["critical","high","medium","low","info"] },
            description:        { type: "string" },
            recommended_action: { type: "string" },
          },
        },
      },
    },
  },
};

/**
 * Download the PDF from storage, base64-encode, and POST to llm-proxy.
 * The edge function forwards messages untouched to Anthropic, so we can
 * use Claude's native document block format here.
 */
async function fetchPdfBase64(storagePath, fileUrl) {
  // The private `app-files` bucket stores everything under a pathname (e.g.
  // `uploads/1761-a7b3f9.pdf`). UploadFile() returns that same pathname in
  // BOTH file_url and path fields, so our primary strategy is always a
  // direct storage.download() call — no signed URL needed.
  const pathToTry = storagePath || fileUrl;
  if (pathToTry && !/^https?:\/\//i.test(pathToTry)) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(pathToTry);
    if (error) throw new Error(`Storage download failed (${STORAGE_BUCKET}/${pathToTry}): ${error.message}`);
    const buf = await data.arrayBuffer();
    if (buf.byteLength > MAX_PDF_BYTES) {
      throw new Error(`PDF is ${(buf.byteLength / 1e6).toFixed(1)} MB, limit is 32 MB.`);
    }
    return arrayBufferToBase64(buf);
  }
  // Fallback: value is an actual http(s) URL — fetch it.
  const resp = await fetch(fileUrl);
  if (!resp.ok) throw new Error(`Could not fetch PDF (${resp.status}).`);
  const buf = await resp.arrayBuffer();
  if (buf.byteLength > MAX_PDF_BYTES) {
    throw new Error(`PDF is ${(buf.byteLength / 1e6).toFixed(1)} MB, limit is 32 MB.`);
  }
  return arrayBufferToBase64(buf);
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Runs the full analysis pipeline. Caller is responsible for having
 * already inserted the drawing_analyses row with status='pending'.
 *
 * Updates the row to 'processing' → 'complete' (or 'error') and writes
 * child rows. Returns the parsed analysis on success; throws on failure
 * (the caller may surface the error and the row will carry error_message).
 */
export async function analyzeDrawing(analysis, {
  model = DEFAULT_MODEL,
  provider = DEFAULT_PROVIDER,
} = {}) {
  const analysisId = analysis.id;

  const markError = async (message) => {
    await supabase
      .from("drawing_analyses")
      .update({ analysis_status: "error", error_message: String(message).slice(0, 500) })
      .eq("id", analysisId);
  };

  try {
    await supabase
      .from("drawing_analyses")
      .update({ analysis_status: "processing" })
      .eq("id", analysisId);

    // Retry idempotency: if a prior attempt inserted some sheets / findings
    // before failing on the check constraint, clear them so we don't double
    // up when this run re-inserts.
    await supabase.from("drawing_sheets").delete().eq("analysis_id", analysisId);
    await supabase.from("drawing_findings").delete().eq("analysis_id", analysisId);

    const pdfBase64 = await fetchPdfBase64(analysis.storage_path, analysis.file_url);

    // Heartbeat: while the Anthropic call is in flight, bump updated_at
    // every 45s so the self-heal sweep in DrawingAnalysis.jsx doesn't
    // falsely reap this row as "stuck". Claude can legitimately take
    // 2–3 minutes on a large PDF. setInterval returns a handle we clear
    // in finally{} so we never leak a timer into a next run.
    const heartbeat = setInterval(() => {
      supabase
        .from("drawing_analyses")
        .update({ analysis_status: "processing" })  // no-op that trips the updated_at trigger
        .eq("id", analysisId)
        .then(() => {}, () => {});
    }, 45_000);

    let data;
    try {
      const res = await invokeLlmProxy({
        provider,
        model,
        maxTokens: 4000,
        system: SYSTEM_PROMPT,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "tool", name: "submit_analysis" },
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
              { type: "text", text: contextPrompt(analysis) },
            ],
          },
        ],
      }, {
        onRetry: async ({ attempt, maxAttempts, delay, status, detail }) => {
          const secs = Math.round(delay / 1000);
          const statusBit = status ? ` (Upstream ${status})` : "";
          const msg = `Retry ${attempt}/${maxAttempts - 1}${statusBit} — waiting ${secs}s before next attempt. ${(detail || "").slice(0, 200)}`;
          await supabase
            .from("drawing_analyses")
            .update({ error_message: msg.slice(0, 500) })
            .eq("id", analysisId);
        },
      });
      data = res.data;
    } finally {
      clearInterval(heartbeat);
    }

    const toolInput = data?.tool_use?.input;
    if (!toolInput || typeof toolInput !== "object") {
      throw new Error("AI did not return a tool_use payload. See raw_ai_response.");
    }

    const sheets   = Array.isArray(toolInput.sheet_index) ? toolInput.sheet_index : [];
    const findings = Array.isArray(toolInput.findings)    ? toolInput.findings    : [];
    const summary  = typeof toolInput.ai_summary === "string" ? toolInput.ai_summary : null;

    // Persist sheet index. Category is coerced to a valid enum or null so
    // we never break the check constraint on a misspelled AI value.
    if (sheets.length) {
      const sheetRows = sheets.map((s, i) => ({
        analysis_id:    analysisId,
        sheet_number:   String(s.sheet_number || "").trim().slice(0, 64) || `Sheet ${i + 1}`,
        sheet_title:    s.title ? String(s.title).slice(0, 500) : null,
        sheet_category: normalizeCategory(s.category),
        page_index:     Number.isInteger(s.page_index) ? s.page_index : i,
      }));
      const { error: sheetsErr } = await supabase.from("drawing_sheets").insert(sheetRows);
      if (sheetsErr) throw new Error(`Sheet insert failed: ${sheetsErr.message}`);
    }

    // Persist findings. Each finding_type / severity passes through a
    // normalizer so Claude can return a close-enough label (e.g.
    // "coordination" vs "coordination_conflict") without breaking the
    // CHECK constraint. Description is required, so drop rows where the
    // model returned an empty string.
    if (findings.length) {
      const findingRows = findings
        .filter(f => f && String(f.description || "").trim().length > 0)
        .map(f => ({
          analysis_id:        analysisId,
          sheet_number:       f.sheet_number ? String(f.sheet_number).slice(0, 64) : null,
          finding_type:       normalizeFindingType(f.finding_type),
          severity:           normalizeSeverity(f.severity),
          description:        String(f.description).slice(0, 2000),
          recommended_action: f.recommended_action ? String(f.recommended_action).slice(0, 1000) : null,
        }));
      if (findingRows.length) {
        const { error: fErr } = await supabase.from("drawing_findings").insert(findingRows);
        if (fErr) throw new Error(`Findings insert failed: ${fErr.message}`);
      }
    }

    await supabase
      .from("drawing_analyses")
      .update({
        analysis_status: "complete",
        sheet_count:     sheets.length,
        ai_summary:      summary,
        model,
        raw_ai_response: data?.raw ?? null,
        error_message:   null,
      })
      .eq("id", analysisId);

    // Auto-import the analyzed sheets into the canonical Drawings workflow
    // so they participate in KPIs / due-date alerts / stage advancement.
    // Idempotent via drawing_analyses.imported_set_id — a later re-analysis
    // won't overwrite manual edits on the target set / sheets.
    try {
      const fresh = { ...analysis, analysis_status: "complete", ai_summary: summary };
      await importAnalyzedDrawings(fresh);
    } catch (importErr) {
      // Import is best-effort — the analysis itself succeeded, so we don't
      // flip the parent row to 'error'. The user can retry via the "Import
      // to Drawings" button on the detail modal.
      console.warn("[analyzeDrawing] auto-import failed:", importErr?.message || importErr);
    }

    return { sheets, findings, aiSummary: summary };
  } catch (err) {
    await markError(err?.message || String(err));
    throw err;
  }
}

function contextPrompt(a) {
  const bits = [];
  if (a.drawing_stage) bits.push(`Stage: ${a.drawing_stage}`);
  if (a.revision)      bits.push(`Revision: ${a.revision}`);
  if (a.issue_date)    bits.push(`Issue date: ${a.issue_date}`);
  if (a.file_name)     bits.push(`File: ${a.file_name}`);
  const ctx = bits.length ? `\n\nContext:\n${bits.join("\n")}` : "";
  return `Analyze this structural steel drawing set. Call submit_analysis with the sheet index, a short summary, and any findings you can substantiate from the PDF.${ctx}`;
}
