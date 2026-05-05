/**
 * drawingHub/aiSuggest.js — LLM-backed candidate-link suggestions.
 *
 * Extracted from src/lib/drawingHub.js. Behavior + edge-function
 * invocation + filter logic are byte-identical to the original.
 */

import { supabase } from "@/lib/supabase";

// ────────────────────────────────────────────────────────────────────
// AI-suggested links (V1.5)
//
// Given a zone + a bucket of open project records (RFIs, work
// packages, deliveries, change orders), ask an LLM to pick the
// records most likely to belong to the zone based on textual and
// contextual signals (sheet refs, grid / level / detail callouts,
// drawing_reference strings, subject/title overlap).
//
// Uses the app's llm-proxy edge function (Anthropic-compatible
// envelope + tool_use) with `provider: "openai"` + `gpt-4o-mini` —
// cheap enough to run on-demand per zone, and the proxy already
// handles transforming tool schemas and document/image content
// blocks for the OpenAI path.
//
// Suggestions persist as drawing_links with link_source = "ai_suggested"
// and is_confirmed = false, so the rule engine ignores them until a
// human confirms. Confidence score from the model is stored on the
// link row so the UI can order by it.
// ────────────────────────────────────────────────────────────────────

const SUGGEST_TOOL = {
  name: "propose_zone_links",
  description: "Return ranked candidate records that likely belong to the selected drawing zone.",
  input_schema: {
    type: "object",
    required: ["suggestions"],
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          required: ["record_type", "record_id", "confidence"],
          properties: {
            record_type:  { type: "string", enum: ["rfi", "work_package", "delivery", "change_order"] },
            record_id:    { type: "string", description: "UUID of the candidate record." },
            confidence:   { type: "number", description: "0..1 confidence that this record belongs to the zone." },
            rationale:    { type: "string", description: "One-sentence reason anchored in visible signals (sheet ref, grid, wording)." },
          },
        },
      },
    },
  },
};

const SUGGEST_SYSTEM_PROMPT = `You are helping a steel-construction PM attach operational records
(RFIs, work packages, deliveries, change orders) to a rectangular
zone on a drawing sheet. A "zone" is a spatial anchor — think "Level 2 /
Grid C-5" or "Stair 2 / Detail 7".

Rules:
- Only propose records where the signals clearly point to this zone
  (sheet number + grid or level match, drawing_reference mentions the
  zone's detail or grid, subject/description names the same scope,
  etc.). If signals are weak, DO NOT propose — the user would rather
  have zero suggestions than wrong ones.
- confidence must reflect how well the signals line up: 0.95 when
  sheet + grid + detail all match and the title echoes the zone
  label; 0.70 when two strong signals line up; below 0.50 suggests
  the link is speculative and should be omitted.
- rationale must cite specific textual evidence ("drawing_reference
  says 'S-402 Det 7'", not "looks related").
- At most 8 suggestions per call.
- Ignore records whose status is terminal (Answered, Closed, Void,
  Delivered, Received, Approved/Rejected) — those don't need zone
  attachment.`;

/**
 * Ask the LLM for candidate link suggestions. `records` is the
 * already-filtered universe of open project records to consider —
 * caller is responsible for scoping to the project + excluding
 * records already linked.
 */
export async function suggestLinksForZone(zone, records, {
  model = "gpt-4o-mini",
  provider = "openai",
  maxRecords = 80,
} = {}) {
  if (!zone) throw new Error("suggestLinksForZone: zone required");
  if (!Array.isArray(records) || records.length === 0) return [];

  // Shrink the candidate set to something the model can scan without
  // wasting tokens. Prefer records whose existing `drawing_reference`
  // or title contains the zone's sheet / grid / detail strings; fall
  // back to the full list truncated to maxRecords.
  const narrow = narrowCandidates(zone, records, maxRecords);

  const zoneContext = {
    zone_key: zone.zone_key,
    label: zone.label,
    description: zone.description,
    sheet_number: zone.__sheet_number || null,
    sheet_title:  zone.__sheet_title || null,
    level_ref: zone.level_ref,
    grid_ref:  zone.grid_ref,
    detail_ref: zone.detail_ref,
    discipline_code: zone.discipline_code,
    sequence_ref:    zone.sequence_ref,
  };

  // Project only the signals the model needs — don't send full rows.
  const candidateRows = narrow.map((r) => ({
    record_type: r.__type,
    record_id:   r.id,
    number:      r.rfi_number || r.wp_number || r.delivery_number || r.co_number || null,
    title:       r.subject || r.name || r.description || r.title || null,
    status:      r.status || null,
    drawing_reference: r.drawing_reference || null,
    ball_in_court:     r.ball_in_court || null,
    date_required:     r.date_required || r.scheduled_date || null,
  }));

  const userPrompt =
    `ZONE:\n${JSON.stringify(zoneContext, null, 2)}\n\n` +
    `CANDIDATE RECORDS (${candidateRows.length}):\n${JSON.stringify(candidateRows, null, 2)}\n\n` +
    "Call propose_zone_links with the records that clearly belong to this zone.";

  const { data, error } = await supabase.functions.invoke("llm-proxy", {
    body: {
      useCase: "drawing-link-suggest",
      project_id: zone?.project_id || undefined,
      provider,
      model,
      maxTokens: 1500,
      system: SUGGEST_SYSTEM_PROMPT,
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "propose_zone_links" },
      messages: [{ role: "user", content: userPrompt }],
    },
  });
  if (error) throw new Error(`llm-proxy invocation failed: ${error.message}`);
  if (data?.error) throw new Error(data.error);

  const input = data?.tool_use?.input;
  if (!input || !Array.isArray(input.suggestions)) {
    // Model returned text instead of a tool call — surface that text so
    // the UI can show the user what went wrong rather than a bare null.
    const hint = (data?.text || "").trim().slice(0, 200);
    throw new Error(
      `Model did not return structured suggestions${hint ? `: ${hint}` : ""}.`,
    );
  }

  // Light sanity filter — reject malformed entries and any whose
  // record_id doesn't match one of the candidates we actually sent.
  const candidateIds = new Set(candidateRows.map((c) => c.record_id));
  return input.suggestions
    .filter((s) =>
      s && s.record_id && s.record_type &&
      candidateIds.has(s.record_id) &&
      Number.isFinite(Number(s.confidence)) &&
      Number(s.confidence) >= 0.5,
    )
    .map((s) => ({
      recordType: s.record_type,
      recordId:   s.record_id,
      confidence: Math.max(0, Math.min(1, Number(s.confidence))),
      rationale:  (s.rationale || "").slice(0, 280),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

// Narrow the candidate universe with cheap string matching before
// sending to the LLM — reduces token cost and keeps gpt-4o-mini's
// attention on a smaller set. Returns up to `maxRecords` rows
// prioritising ones that textually echo the zone.
function narrowCandidates(zone, records, maxRecords) {
  const needles = [
    zone.__sheet_number, zone.level_ref, zone.grid_ref, zone.detail_ref,
    zone.zone_key, zone.label,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  if (needles.length === 0) return records.slice(0, maxRecords);

  const scored = records.map((r) => {
    const hay = [
      r.drawing_reference, r.subject, r.name, r.description, r.title,
      r.detail_ref, r.grid_ref, r.level_ref, r.sequence_ref,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const n of needles) if (n && hay.includes(n)) score += 1;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxRecords).map((x) => x.r);
}
