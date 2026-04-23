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
// Default to Anthropic Claude Sonnet 4.5. We briefly defaulted to
// gpt-4o-mini for cost reasons, but the model was visibly weaker on
// the visual reasoning that structural-drawing analysis requires
// (sheet enumeration missed pages; findings were vague or
// hallucinated). The tool_use schema constrains the OUTPUT format —
// it can't make the model see the PDF any better. The retry/heartbeat
// machinery below handles Anthropic TPM rate limits gracefully
// (jittered backoff up to 5 attempts over ~4 min), so Sonnet is the
// pragmatic default.
//
// Override per-call by passing { model, provider } to analyzeDrawing()
// — e.g. bulk-reprocessing cold storage could still use gpt-4o-mini
// if the quality hit is acceptable for that use case.
const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_MODEL    = "claude-sonnet-4-5";
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

const SYSTEM_PROMPT = `You are a senior structural-steel project manager reviewing a drawing set for S&H Steel Co.
You will return the analysis through the submit_analysis tool. No prose outside the tool call.

# Core rules

1. Ground every claim in what is physically visible on the PDF. If you
   cannot point to an exact grid line / detail callout / revision mark /
   dimension string, DO NOT emit the finding. It is better to return
   zero findings than one invented one.
2. Copy verbatim — sheet numbers, titles, grid labels, detail tags.
   No paraphrasing. No title-case normalization.
3. Enumerate every page. If the PDF has 37 pages, sheet_index has 37
   entries, in page order, even for cover / index / general-notes /
   blank pages. Missing a page is a worse error than a vague title.
4. Default to fewer findings. If the set is clean, ai_summary says so
   and findings = []. Do not pad with filler.

# Sheet index

- sheet_number: the printed sheet ID in the title block (e.g. "S-101",
  "E-2.3", "D-415", "SH-12"). If a page has no sheet number, use the
  closest available label (e.g. "Cover", "Index") — do not invent one.
- title: the title-block title, verbatim. Keep punctuation/case.
- category: one of 'structural' (S-series), 'erection' (E-series),
  'detailing' (D-series), 'shop' (SH-series). For ambiguous series,
  pick the nearest — do not wildcard-guess.
- page_index: zero-based page number in the PDF.

# Findings — acceptance bar

Every finding MUST satisfy all of the following, or be dropped:
  (a) sheet_number names a real sheet from sheet_index
  (b) description cites a specific location: grid line ("A.5 / 3"),
      detail callout ("Detail 5/S-301"), elevation tag, revision cloud
      number, or dimension string
  (c) the issue is something a fabricator/detailer would flag before
      release — not a general "needs review" observation
  (d) recommended_action is concrete (cite RFI target, dimension to
      confirm, embed elevation to reconcile) — not "coordinate with EOR"

Focus areas (examples of fab-blocking ambiguity):
  - missing bolt callouts (A325 vs A490, SC/N/X, edge distance)
  - AESS class omission (1–4) or conflicting AESS notes
  - embed elevation conflicts (top-of-concrete vs top-of-steel)
  - column splice location / orientation / field-vs-shop ambiguity
  - connection type ambiguity (shear tab vs clip vs moment vs seismic)
  - revision clouds without a narrative entry in the revision block
  - grid or column line mismatch between plan and elevation
  - dimension chain errors (sum ≠ overall, floating, missing hold)

## Good vs bad examples

GOOD:
  sheet_number: "S-301"
  finding_type: "callout_issue"
  severity: "high"
  description: "Detail 3/S-301 (beam-to-column shear tab at grid B/3):
               bolt callout shows '(4)' with no grade or hole type.
               Adjacent Detail 2/S-301 specifies (4) 3/4" A325-N STD."
  recommended_action: "Issue RFI to EOR to confirm bolt grade and hole
                       type for Detail 3/S-301; assume match to Detail
                       2/S-301 unless advised otherwise."

BAD (drop — too vague, no anchor):
  "S-301 connection details need more information."

BAD (drop — invented location):
  "Detail 9/S-999 at grid Q.3 has a dimension error."  (no such detail
  on the sheet)

# Severity

  critical = blocks fabrication or creates safety risk
  high     = blocks release of a sheet or assembly
  medium   = needs resolution before shop start
  low      = detailing cleanup, will not block fab
  info     = observation, no action needed

# Summary

ai_summary: 2–3 sentences. Name the set (stage / rev / issue date if
known), the total sheet count, and the top 1–2 fab-blocking items if
any. If the set is clean, say so plainly.`;

const ANALYSIS_TOOL = {
  name: "submit_analysis",
  description:
    "Return the structured drawing-set analysis. MUST enumerate every page " +
    "in the PDF under sheet_index. Findings MUST be anchored to a specific " +
    "on-sheet location (grid / detail tag / revision mark / dimension). " +
    "Prefer zero findings over vague findings.",
  input_schema: {
    type: "object",
    required: ["sheet_index", "ai_summary", "findings"],
    properties: {
      sheet_index: {
        type: "array",
        description:
          "ONE entry per page of the PDF, in page order. Do not skip " +
          "cover / index / general-notes / blank pages — include them with " +
          "the closest printed label.",
        items: {
          type: "object",
          required: ["sheet_number", "title", "category", "page_index"],
          properties: {
            sheet_number: {
              type: "string",
              description:
                "Printed sheet ID from the title block (e.g. 'S-101', " +
                "'E-2.3'). Verbatim — no paraphrase. For pages without an " +
                "ID, use the closest label (e.g. 'Cover', 'Index').",
            },
            title: {
              type: "string",
              description:
                "Title-block title, verbatim. Keep original punctuation " +
                "and capitalization.",
            },
            category: {
              type: "string",
              enum: ["structural", "erection", "detailing", "shop"],
              description:
                "Closest series match. 'structural' = S-series, " +
                "'erection' = E-series, 'detailing' = D-series, " +
                "'shop' = SH-series.",
            },
            page_index: {
              type: "integer",
              minimum: 0,
              description: "Zero-based page number in the PDF.",
            },
          },
        },
      },
      ai_summary: {
        type: "string",
        description:
          "2–3 sentences. Name the set (stage/rev if known), total " +
          "sheet count, and top 1–2 fab-blocking items. If clean, say so " +
          "plainly. No marketing language.",
      },
      findings: {
        type: "array",
        description:
          "Substantiated findings ONLY. Each must cite a specific on-sheet " +
          "location. Drop anything vague — return [] if nothing qualifies.",
        items: {
          type: "object",
          required: [
            "sheet_number",
            "finding_type",
            "severity",
            "description",
            "recommended_action",
          ],
          properties: {
            sheet_number: {
              type: "string",
              description:
                "Must exactly match a sheet_number already emitted in " +
                "sheet_index.",
            },
            finding_type: {
              type: "string",
              enum: [
                "missing_info",
                "coordination_conflict",
                "callout_issue",
                "revision_delta",
                "dimension_concern",
                "aess_concern",
              ],
            },
            severity: {
              type: "string",
              enum: ["critical", "high", "medium", "low", "info"],
              description:
                "critical = blocks fab/safety · high = blocks release · " +
                "medium = resolve before shop · low = cleanup · info = FYI.",
            },
            description: {
              type: "string",
              minLength: 40,
              description:
                "State the issue and cite its exact location: grid line " +
                "(e.g. 'B/3'), detail tag ('Detail 3/S-301'), revision " +
                "cloud number, or dimension string. No generic phrasing.",
            },
            recommended_action: {
              type: "string",
              minLength: 20,
              description:
                "Concrete next step — e.g. 'RFI EOR to confirm bolt " +
                "grade on Detail 3/S-301' — not 'coordinate with team'.",
            },
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
        // 8000 leaves headroom for a sheet_index of 40+ sheets plus a
        // dozen-or-so findings. 4000 was tight enough that tool_use
        // JSON sometimes got truncated on larger sets.
        maxTokens: 8000,
        // Structured extraction over engineering drawings is NOT a
        // creative task. Anthropic's default temperature is 1.0 which
        // encouraged the model to invent plausible-sounding but
        // unanchored findings. 0 makes the output deterministic enough
        // that the same PDF produces the same sheet_index across runs
        // and findings stop drifting into generic phrasing.
        temperature: 0,
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

    // Persist findings. Two layers of quality gate here:
    //   1. Normalize finding_type / severity so a close-enough label
    //      ("coordination" → "coordination_conflict") still passes the
    //      CHECK constraint instead of losing the signal.
    //   2. Post-filter for the acceptance bar we declared in the prompt —
    //      the description must cite a concrete on-sheet anchor, and the
    //      sheet_number must match a sheet we actually enumerated. Any
    //      finding that fails is dropped (not persisted) so a drifted
    //      model run doesn't pollute the UI.
    const knownSheetNumbers = new Set(
      sheets
        .map((s) => String(s.sheet_number || "").trim())
        .filter(Boolean),
    );
    const hasLocationAnchor = (desc) => {
      if (!desc) return false;
      const s = String(desc);
      if (s.trim().length < 40) return false;
      // At least one of: grid ref (A/3, B.5 / 3), detail tag (Detail 3/S-301
      // or 3/S-301), revision cloud (Rev 2, Cloud 5), dimension ("12'-6"").
      return (
        /\bDetail\s+\w[\w\.]*\s*\/\s*[A-Z]+-?\d+/i.test(s) ||   // Detail 3/S-301
        /\b\d+\s*\/\s*[A-Z]+-?\d[\w\.\-]*/.test(s) ||           // 3/S-301
        /\bgrid\b|\baxis\b|\bline\b/i.test(s) && /[A-Za-z]\.?\d|\d\s*\/\s*[A-Za-z]/.test(s) || // grid A/3 or grid A.5
        /\bRev(?:ision)?\s*(?:cloud\s*)?\d+/i.test(s) ||         // Rev 2 / Revision cloud 5
        /\b\d+\s*[-–]\s*\d+\s*(?:"|in\b|”)/i.test(s) ||         // dimension like 12'-6"
        /\b[A-Z]\d+\s*(?:&|and|to)\s*[A-Z]\d+/i.test(s)         // grid range A1 to A5
      );
    };

    const droppedFindings = [];
    if (findings.length) {
      const findingRows = findings
        .filter((f) => {
          if (!f) return false;
          const desc = String(f.description || "").trim();
          if (desc.length === 0) {
            droppedFindings.push({ reason: "empty_description", f });
            return false;
          }
          const sn = String(f.sheet_number || "").trim();
          if (knownSheetNumbers.size > 0 && sn && !knownSheetNumbers.has(sn)) {
            droppedFindings.push({ reason: "unknown_sheet_number", f });
            return false;
          }
          if (!hasLocationAnchor(desc)) {
            droppedFindings.push({ reason: "no_location_anchor", f });
            return false;
          }
          return true;
        })
        .map((f) => ({
          analysis_id:        analysisId,
          sheet_number:       f.sheet_number ? String(f.sheet_number).slice(0, 64) : null,
          finding_type:       normalizeFindingType(f.finding_type),
          severity:           normalizeSeverity(f.severity),
          description:        String(f.description).slice(0, 2000),
          recommended_action: f.recommended_action ? String(f.recommended_action).slice(0, 1000) : null,
        }));
      if (droppedFindings.length) {
        console.warn(
          `[analyzeDrawing] dropped ${droppedFindings.length}/${findings.length} findings for failing the quality bar:`,
          droppedFindings.slice(0, 5).map((d) => d.reason),
        );
      }
      if (findingRows.length) {
        const { error: fErr } = await supabase.from("drawing_findings").insert(findingRows);
        if (fErr) throw new Error(`Findings insert failed: ${fErr.message}`);
      }
    }

    // IMPORTANT ORDERING:
    // Run importAnalyzedDrawings BEFORE we flip analysis_status to
    // 'complete'. Previously the status flip came first, so if the auto-
    // import threw (e.g. storage race, constraint violation), the UI
    // would show a "complete" analysis while the canonical Drawings table
    // was still empty — silent data loss with no retry handle, because
    // imported_set_id remained null.
    //
    // Now we import while status is still 'processing' (importAnalyzedDrawings
    // was relaxed to accept that), then flip. If the import throws, we
    // surface that in error_message with status='complete' so the user sees
    // a truthful "analysis done, import failed — click Import to retry."
    let autoImportError = null;
    try {
      const fresh = { ...analysis, analysis_status: "processing", ai_summary: summary };
      await importAnalyzedDrawings(fresh);
    } catch (importErr) {
      autoImportError = importErr?.message || String(importErr);
      console.warn("[analyzeDrawing] auto-import failed:", autoImportError);
    }

    await supabase
      .from("drawing_analyses")
      .update({
        analysis_status: "complete",
        sheet_count:     sheets.length,
        ai_summary:      summary,
        model,
        raw_ai_response: data?.raw ?? null,
        // error_message is our failure-surfacing channel. null = clean;
        // any string means the UI should render a warning chip + the
        // "Import to Drawings" button so the user can retry the import
        // without re-running the expensive LLM call.
        error_message: autoImportError
          ? `Auto-import failed: ${autoImportError.slice(0, 400)}`
          : null,
      })
      .eq("id", analysisId);

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
