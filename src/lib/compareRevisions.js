/**
 * compareRevisions.js
 *
 * Phase 3 of the Drawing Analysis module — diff two uploaded drawing PDFs
 * (same project, different revisions) via one Claude call and persist the
 * change set as drawing_revision_deltas rows.
 *
 * Input contract: a drawing_revision_comparisons row already inserted with
 * compare_status='pending' and both from_analysis_id / to_analysis_id set.
 * Caller passes the row plus both drawing_analyses rows so we don't need
 * to re-fetch.
 *
 * Output: { summary, deltas } — same shape that gets persisted.
 */

import { supabase } from "@/lib/supabase";

const MAX_PDF_BYTES   = 32 * 1024 * 1024; // 32 MB per document (Anthropic cap)
const DEFAULT_MODEL   = "claude-sonnet-4-6";
const STORAGE_BUCKET  = "app-files";

// In lockstep with CHECK constraints on drawing_revision_deltas. Any AI
// output outside these sets is coerced to a safe fallback client-side so
// the insert can't ever fail the check.
const VALID_DELTA_TYPES = new Set([
  "sheet_added","sheet_removed",
  "grid_shift","connection_change","dimension_change",
  "detail_revised","callout_added","callout_removed",
  "material_change","elevation_change","other",
]);
const VALID_SEVERITIES = new Set(["critical","high","medium","low","info"]);

function normalizeDeltaType(raw) {
  if (!raw) return "other";
  const norm = String(raw).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (VALID_DELTA_TYPES.has(norm)) return norm;
  if (norm.includes("added") && norm.includes("sheet"))    return "sheet_added";
  if (norm.includes("removed") && norm.includes("sheet"))  return "sheet_removed";
  if (norm.includes("grid"))                                return "grid_shift";
  if (norm.includes("connect"))                             return "connection_change";
  if (norm.includes("dim"))                                 return "dimension_change";
  if (norm.includes("detail"))                              return "detail_revised";
  if (norm.includes("callout") && norm.includes("add"))    return "callout_added";
  if (norm.includes("callout"))                             return "callout_removed";
  if (norm.includes("material"))                            return "material_change";
  if (norm.includes("elev"))                                return "elevation_change";
  return "other";
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

const SYSTEM_PROMPT = `You are a senior structural steel project manager comparing two revisions
of a structural steel drawing set. Call submit_revision_diff with the
changes that matter to a fabrication / field team.

Two documents will be attached in the message:
  Document 1: FROM (prior revision)
  Document 2: TO   (current revision)

For every meaningful change, return one delta. Be ruthless about
significance — minor text tweaks, layer-cleanup renames, and title-block
metadata changes are noise; do not report them unless they carry
fabrication impact.

Delta types:
  - sheet_added         sheet present in TO but not FROM
  - sheet_removed       sheet present in FROM but not TO
  - grid_shift          column-line / gridline coordinates moved
  - connection_change   shear tab → bolted clip, moment vs gravity, etc.
  - dimension_change    overall or detail dimensions changed
  - detail_revised      a callout detail drawing was modified
  - callout_added       a new call-out / annotation appeared
  - callout_removed     a call-out / annotation was deleted
  - material_change     section / grade / coating spec changed
  - elevation_change    top-of-steel / top-of-concrete elevation moved
  - other               anything else that impacts fabrication or install

Severity guidance:
  critical = blocks fab (pieces already cut no longer match)
  high     = requires re-detailing or an RFI
  medium   = coordination / procurement impact
  low      = annotation cleanup
  info     = observation, no action

Every description must cite a sheet number from the TO (current) set
plus the grid line or detail mark so the change can be found in the
drawing. If the change is a sheet_added or sheet_removed, cite the
sheet number of the added/removed sheet.`;

const COMPARE_TOOL = {
  name: "submit_revision_diff",
  description: "Return the structured revision-comparison result.",
  input_schema: {
    type: "object",
    required: ["summary", "deltas"],
    properties: {
      summary: {
        type: "string",
        description: "2–4 sentence overview of what materially changed.",
      },
      deltas: {
        type: "array",
        items: {
          type: "object",
          required: ["sheet_number", "delta_type", "severity", "description"],
          properties: {
            sheet_number:       { type: "string" },
            delta_type:         { type: "string", enum: [
              "sheet_added","sheet_removed",
              "grid_shift","connection_change","dimension_change",
              "detail_revised","callout_added","callout_removed",
              "material_change","elevation_change","other",
            ]},
            severity:           { type: "string", enum: ["critical","high","medium","low","info"] },
            description:        { type: "string" },
            recommended_action: { type: "string" },
          },
        },
      },
    },
  },
};

async function fetchPdfBase64(analysis) {
  const path = analysis?.storage_path || analysis?.file_url;
  if (!path) throw new Error(`Analysis ${analysis?.id} has no storage path.`);
  if (/^https?:\/\//i.test(path)) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`PDF fetch failed (${resp.status}).`);
    const buf = await resp.arrayBuffer();
    checkSize(buf, analysis);
    return arrayBufferToBase64(buf);
  }
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
  if (error) throw new Error(`Storage download (${STORAGE_BUCKET}/${path}): ${error.message}`);
  const buf = await data.arrayBuffer();
  checkSize(buf, analysis);
  return arrayBufferToBase64(buf);
}

function checkSize(buf, analysis) {
  if (buf.byteLength > MAX_PDF_BYTES) {
    throw new Error(`${analysis?.file_name || "PDF"} is ${(buf.byteLength / 1e6).toFixed(1)} MB, limit is 32 MB.`);
  }
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
 * Run the comparison. The caller is responsible for inserting the
 * drawing_revision_comparisons row as 'pending'. This function flips it
 * to 'processing', runs the Claude call, writes drawing_revision_deltas
 * rows, and lands the parent on 'complete' or 'error'.
 */
export async function compareRevisions(comparison, fromAnalysis, toAnalysis, { model = DEFAULT_MODEL } = {}) {
  const cid = comparison.id;

  const markError = async (msg) => {
    await supabase
      .from("drawing_revision_comparisons")
      .update({ compare_status: "error", error_message: String(msg).slice(0, 500) })
      .eq("id", cid);
  };

  try {
    await supabase
      .from("drawing_revision_comparisons")
      .update({ compare_status: "processing" })
      .eq("id", cid);

    // Retry idempotency — clear partial delta rows from a prior failed run.
    await supabase.from("drawing_revision_deltas").delete().eq("comparison_id", cid);

    const [fromB64, toB64] = await Promise.all([
      fetchPdfBase64(fromAnalysis),
      fetchPdfBase64(toAnalysis),
    ]);

    const { data, error } = await supabase.functions.invoke("llm-proxy", {
      body: {
        model,
        maxTokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [COMPARE_TOOL],
        tool_choice: { type: "tool", name: "submit_revision_diff" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: `Document 1 — FROM (prior revision): ${fromAnalysis.file_name}${fromAnalysis.revision ? ` · Rev ${fromAnalysis.revision}` : ""}${fromAnalysis.drawing_stage ? ` · ${fromAnalysis.drawing_stage}` : ""}` },
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: fromB64 } },
              { type: "text", text: `Document 2 — TO (current revision): ${toAnalysis.file_name}${toAnalysis.revision ? ` · Rev ${toAnalysis.revision}` : ""}${toAnalysis.drawing_stage ? ` · ${toAnalysis.drawing_stage}` : ""}` },
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: toB64 } },
              { type: "text", text: "Call submit_revision_diff with every materially significant change from FROM → TO." },
            ],
          },
        ],
      },
    });

    if (error) throw new Error(error.message || "llm-proxy invocation failed");
    if (data?.error) throw new Error(data.error);

    const toolInput = data?.tool_use?.input;
    if (!toolInput || typeof toolInput !== "object") {
      throw new Error("AI did not return a tool_use payload. See raw_ai_response.");
    }

    const deltas = Array.isArray(toolInput.deltas) ? toolInput.deltas : [];
    const summary = typeof toolInput.summary === "string" ? toolInput.summary : null;

    if (deltas.length) {
      const rows = deltas
        .filter(d => d && String(d.description || "").trim().length > 0)
        .map(d => ({
          comparison_id:      cid,
          sheet_number:       d.sheet_number ? String(d.sheet_number).slice(0, 64) : null,
          delta_type:         normalizeDeltaType(d.delta_type),
          severity:           normalizeSeverity(d.severity),
          description:        String(d.description).slice(0, 2000),
          recommended_action: d.recommended_action ? String(d.recommended_action).slice(0, 1000) : null,
        }));
      if (rows.length) {
        const { error: dErr } = await supabase.from("drawing_revision_deltas").insert(rows);
        if (dErr) throw new Error(`Delta insert failed: ${dErr.message}`);
      }
    }

    await supabase
      .from("drawing_revision_comparisons")
      .update({
        compare_status:  "complete",
        ai_summary:      summary,
        delta_count:     deltas.length,
        model,
        raw_ai_response: data?.raw ?? null,
        error_message:   null,
      })
      .eq("id", cid);

    return { summary, deltas };
  } catch (err) {
    await markError(err?.message || String(err));
    throw err;
  }
}
