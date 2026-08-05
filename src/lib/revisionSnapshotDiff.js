/**
 * revisionSnapshotDiff.js — AI "Revision Impact Report" for one sheet.
 *
 * Diffs two revision snapshots of a SINGLE drawing sheet (each already
 * rendered to a PNG by the caller) via one llm-proxy vision call, and
 * persists the change set as drawing_revision_deltas rows under a
 * revision-keyed drawing_revision_comparisons parent.
 *
 * Revived from the deleted Drawing-Analysis-era compareRevisions.js, repointed
 * off the (removed) drawing_analyses pathway and onto the live
 * drawing_revisions snapshot model. Review-only: nothing here mutates RFIs,
 * change orders, or fab-hold — it stages AI findings for a human.
 *
 * The pure helpers (no I/O) are exported for unit testing:
 *   normalizeDeltaType, normalizeSeverity, coerceDeltas,
 *   buildDiffMessages, sortDeltasBySeverity.
 *
 * Routing: the call passes an explicit provider/model override, so it uses
 * the deployed llm-proxy as-is — no router change / edge-function redeploy.
 */

import { supabase } from "@/lib/supabase";

const DEFAULT_PROVIDER = "openai";
// Full gpt-4o (not -mini): this is the product differentiator, it's on-demand
// and low-volume (one button click per sheet pair), so read quality wins over
// a few cents. Flip both back to anthropic/claude when credits are restored.
const DEFAULT_MODEL = "gpt-4o";
const MAX_OUTPUT_TOKENS = 4000;

// In lockstep with the CHECK constraints on drawing_revision_deltas. Any AI
// output outside these sets is coerced to a safe fallback client-side so the
// insert can never fail the check.
const VALID_DELTA_TYPES = new Set([
  "sheet_added", "sheet_removed",
  "grid_shift", "connection_change", "dimension_change",
  "detail_revised", "callout_added", "callout_removed",
  "material_change", "elevation_change", "other",
]);
const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function normalizeDeltaType(raw) {
  if (!raw) return "other";
  const norm = String(raw).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (VALID_DELTA_TYPES.has(norm)) return norm;
  if (norm.includes("added") && norm.includes("sheet")) return "sheet_added";
  if (norm.includes("removed") && norm.includes("sheet")) return "sheet_removed";
  if (norm.includes("grid")) return "grid_shift";
  if (norm.includes("connect")) return "connection_change";
  if (norm.includes("dim")) return "dimension_change";
  if (norm.includes("detail")) return "detail_revised";
  if (norm.includes("callout") && norm.includes("add")) return "callout_added";
  if (norm.includes("callout")) return "callout_removed";
  if (norm.includes("material")) return "material_change";
  if (norm.includes("elev")) return "elevation_change";
  return "other";
}

export function normalizeSeverity(raw) {
  if (!raw) return "info";
  const norm = String(raw).trim().toLowerCase();
  if (VALID_SEVERITIES.has(norm)) return norm;
  if (norm.startsWith("crit")) return "critical";
  if (norm.startsWith("hi")) return "high";
  if (norm.startsWith("med")) return "medium";
  if (norm.startsWith("lo")) return "low";
  return "info";
}

/** Stable severity-ranked sort (critical → info), ties broken by insertion order. */
export function sortDeltasBySeverity(deltas = []) {
  return [...(deltas || [])].sort((a, b) => {
    const ra = SEVERITY_RANK[a?.severity] ?? 99;
    const rb = SEVERITY_RANK[b?.severity] ?? 99;
    if (ra !== rb) return ra - rb;
    return String(a?.created_at || "").localeCompare(String(b?.created_at || ""));
  });
}

/**
 * Tool output → delta rows (WITHOUT comparison_id — the caller stamps it).
 * Drops empty-description deltas, normalizes type/severity, clamps lengths to
 * the column budgets. Pure.
 */
export function coerceDeltas(toolInput) {
  const deltas = Array.isArray(toolInput?.deltas) ? toolInput.deltas : [];
  return deltas
    .filter((d) => d && String(d.description || "").trim().length > 0)
    .map((d) => ({
      sheet_number: d.sheet_number ? String(d.sheet_number).slice(0, 64) : null,
      delta_type: normalizeDeltaType(d.delta_type),
      severity: normalizeSeverity(d.severity),
      description: String(d.description).slice(0, 2000),
      recommended_action: d.recommended_action ? String(d.recommended_action).slice(0, 1000) : null,
    }));
}

const SYSTEM_PROMPT = `You are a senior structural steel project manager comparing two revisions
of THE SAME structural steel drawing sheet. Two images are attached:
  Image 1: FROM (the prior revision)
  Image 2: TO   (the current revision)
Both show the same sheet. Identify what materially changed from FROM → TO and
call submit_revision_diff with one delta per change.

Be ruthless about significance. Title-block / revision-cloud metadata, layer
cleanup, and cosmetic re-lettering are noise — report them only if they carry
fabrication or field impact.

Delta types:
  grid_shift          a column-line / gridline coordinate moved
  connection_change   a connection type or size changed (shear tab ↔ moment,
                      bolted ↔ welded, clip angle, stiffeners, etc.)
  dimension_change    an overall or detail dimension changed
  detail_revised      a callout / detail view was modified
  callout_added       a new callout / annotation / weld symbol appeared
  callout_removed     a callout / annotation was deleted
  material_change     a section size, grade, or coating spec changed
                      (e.g. W24x76 → W24x94, A992 → A572-50, galv → painted)
  elevation_change    a top-of-steel / top-of-concrete elevation moved
  sheet_added / sheet_removed   a whole detail view was added or removed
  other               any other change with fabrication or install impact

Severity:
  critical = pieces already fabricated to FROM no longer match TO
  high     = requires re-detailing or an RFI before fabrication
  medium   = coordination / procurement impact
  low      = annotation cleanup
  info     = observation, no action

Every description must cite the grid line, piece mark, or detail mark where the
change is, so a detailer can find it. Quote the FROM → TO values whenever you
can read them, e.g. "Beam at grid B/2: W24x76 → W24x94".`;

const COMPARE_TOOL = {
  name: "submit_revision_diff",
  description: "Return the structured revision-comparison result.",
  input_schema: {
    type: "object",
    required: ["summary", "deltas"],
    properties: {
      summary: {
        type: "string",
        description: "2–4 sentence overview of what materially changed FROM → TO.",
      },
      deltas: {
        type: "array",
        items: {
          type: "object",
          required: ["sheet_number", "delta_type", "severity", "description"],
          properties: {
            sheet_number: { type: "string" },
            delta_type: {
              type: "string",
              enum: [
                "sheet_added", "sheet_removed",
                "grid_shift", "connection_change", "dimension_change",
                "detail_revised", "callout_added", "callout_removed",
                "material_change", "elevation_change", "other",
              ],
            },
            severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
            description: { type: "string" },
            recommended_action: { type: "string" },
          },
        },
      },
    },
  },
};

/**
 * Build the llm-proxy message payload: two PNG image blocks (FROM, TO) framed
 * with text. Anthropic-style blocks — the gateway's OpenAI adapter converts
 * `image` blocks to vision `image_url`. Pure.
 */
export function buildDiffMessages({ fromImageB64, toImageB64, fromLabel, toLabel, sheetNumber }) {
  return [
    {
      role: "user",
      content: [
        { type: "text", text: `Sheet ${sheetNumber || "—"}. Image 1 — FROM (prior revision${fromLabel ? `: ${fromLabel}` : ""}).` },
        { type: "image", source: { type: "base64", media_type: "image/png", data: fromImageB64 } },
        { type: "text", text: `Image 2 — TO (current revision${toLabel ? `: ${toLabel}` : ""}).` },
        { type: "image", source: { type: "base64", media_type: "image/png", data: toImageB64 } },
        { type: "text", text: "Call submit_revision_diff with every materially significant change from FROM → TO." },
      ],
    },
  ];
}

// ── llm-proxy invocation with short interactive backoff ───────────────────
async function invokeLlmProxy(body, { maxAttempts = 3, onRetry } = {}) {
  let lastStatus = 0;
  let lastDetail = "Upstream request failed";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
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
              try { const parsed = JSON.parse(text); if (parsed?.error) detail = parsed.error; } catch { /* keep detail */ }
            }
          }
        }
      } catch { /* ignore */ }
      lastStatus = status;
      lastDetail = detail;
    } catch (thrown) {
      lastDetail = thrown?.message || String(thrown);
    }
    if (attempt < maxAttempts) {
      const delay = 4000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1500);
      if (typeof onRetry === "function") {
        try { await onRetry({ attempt, maxAttempts, delay, status: lastStatus, detail: lastDetail }); } catch { /* best-effort */ }
      }
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
  }
  const prefix = lastStatus ? `Upstream ${lastStatus}` : "Upstream";
  throw new Error(`${prefix}: ${lastDetail} (gave up after ${maxAttempts} attempts)`);
}

async function fetchDeltas(comparisonId) {
  const { data } = await supabase
    .from("drawing_revision_deltas")
    .select("*")
    .eq("comparison_id", comparisonId)
    .order("created_at", { ascending: true });
  return sortDeltasBySeverity(data || []);
}

/**
 * Find (or create) the revision-keyed comparison row for one sheet pair.
 * Idempotent against the ux_revision_comparison_pair unique index — a
 * concurrent click that loses the insert race re-reads the winner's row.
 */
export async function findOrCreateComparison({ projectId, drawingId, fromRevisionId, toRevisionId, requestedBy }) {
  const matchPair = (q) =>
    q.eq("source", "revision")
      .eq("drawing_id", drawingId)
      .eq("from_revision_id", fromRevisionId)
      .eq("to_revision_id", toRevisionId);

  const { data: existing, error } = await matchPair(
    supabase.from("drawing_revision_comparisons").select("*"),
  ).maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  if (existing) return existing;

  const { data: created, error: insErr } = await supabase
    .from("drawing_revision_comparisons")
    .insert({
      project_id: projectId || null,
      drawing_id: drawingId,
      from_revision_id: fromRevisionId,
      to_revision_id: toRevisionId,
      source: "revision",
      compare_status: "pending",
      requested_by: requestedBy || null,
    })
    .select()
    .single();
  if (insErr) {
    if (insErr.code === "23505") {
      const { data: raced } = await matchPair(
        supabase.from("drawing_revision_comparisons").select("*"),
      ).maybeSingle();
      if (raced) return raced;
    }
    throw insErr;
  }
  return created;
}

/** Load a persisted comparison + its deltas for a sheet pair (reopen path). */
export async function loadComparisonWithDeltas({ drawingId, fromRevisionId, toRevisionId }) {
  const { data: comparison } = await supabase
    .from("drawing_revision_comparisons")
    .select("*")
    .eq("source", "revision")
    .eq("drawing_id", drawingId)
    .eq("from_revision_id", fromRevisionId)
    .eq("to_revision_id", toRevisionId)
    .maybeSingle();
  if (!comparison) return { comparison: null, deltas: [] };
  return { comparison, deltas: await fetchDeltas(comparison.id) };
}

/** Toggle the dismissed flag on one delta (keep/dismiss in the report UI). */
export async function setDeltaDismissed({ deltaId, dismissed, userId }) {
  const patch = dismissed
    ? { dismissed: true, dismissed_at: new Date().toISOString(), dismissed_by: userId || null }
    : { dismissed: false, dismissed_at: null, dismissed_by: null };
  const { error } = await supabase.from("drawing_revision_deltas").update(patch).eq("id", deltaId);
  if (error) throw error;
}

/**
 * Generate (or return the cached) AI revision diff for one sheet pair.
 *
 * Idempotent: a previously-`complete` comparison is returned without spending
 * another AI call unless `force` is set. On a fresh/forced run the two rendered
 * page images are required.
 *
 * Returns { comparison, deltas, cached }.
 */
export async function generateRevisionDiff({
  projectId,
  drawingId,
  fromRevisionId,
  toRevisionId,
  fromImageB64,
  toImageB64,
  fromLabel,
  toLabel,
  sheetNumber,
  requestedBy,
  model = DEFAULT_MODEL,
  provider = DEFAULT_PROVIDER,
  onRetry,
  force = false,
}) {
  if (!drawingId || !fromRevisionId || !toRevisionId) {
    throw new Error("generateRevisionDiff: drawingId + fromRevisionId + toRevisionId are required.");
  }
  if (fromRevisionId === toRevisionId) {
    throw new Error("Pick two different revisions to compare.");
  }

  const comparison = await findOrCreateComparison({
    projectId, drawingId, fromRevisionId, toRevisionId, requestedBy,
  });

  if (!force && comparison.compare_status === "complete") {
    return { comparison, deltas: await fetchDeltas(comparison.id), cached: true };
  }

  if (!fromImageB64 || !toImageB64) {
    throw new Error("generateRevisionDiff: both rendered page images are required to run the diff.");
  }

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
      .update({ compare_status: "processing", error_message: null })
      .eq("id", cid);
    // Clear any partial deltas from a prior failed / forced run before re-inserting.
    await supabase.from("drawing_revision_deltas").delete().eq("comparison_id", cid);

    const { data } = await invokeLlmProxy(
      {
        useCase: "revision-compare",
        project_id: projectId || undefined,
        provider,
        model,
        maxTokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [COMPARE_TOOL],
        tool_choice: { type: "tool", name: "submit_revision_diff" },
        messages: buildDiffMessages({ fromImageB64, toImageB64, fromLabel, toLabel, sheetNumber }),
      },
      { onRetry },
    );

    const toolInput = data?.tool_use?.input;
    if (!toolInput || typeof toolInput !== "object") {
      throw new Error("AI did not return a structured diff. Try again.");
    }

    const rows = coerceDeltas(toolInput).map((r) => ({ ...r, comparison_id: cid }));
    if (rows.length) {
      const { error: dErr } = await supabase.from("drawing_revision_deltas").insert(rows);
      if (dErr) throw new Error(`Delta insert failed: ${dErr.message}`);
    }

    const summary = typeof toolInput.summary === "string" ? toolInput.summary : null;
    await supabase
      .from("drawing_revision_comparisons")
      .update({
        compare_status: "complete",
        ai_summary: summary,
        delta_count: rows.length,
        model,
        raw_ai_response: data?.raw ?? null,
        error_message: null,
      })
      .eq("id", cid);

    return {
      comparison: { ...comparison, compare_status: "complete", ai_summary: summary, delta_count: rows.length },
      deltas: await fetchDeltas(cid),
      cached: false,
    };
  } catch (err) {
    await markError(err?.message || String(err));
    throw err;
  }
}
