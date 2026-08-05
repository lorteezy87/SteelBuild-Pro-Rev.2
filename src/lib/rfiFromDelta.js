/**
 * rfiFromDelta.js — create an RFI pre-filled from an AI revision delta, and
 * link it back to the delta. Backs the "Create RFI" action on a
 * RevisionDeltaCard (per-sheet rail + package report).
 *
 * The user always reviews/edits the prefilled RFI in RFIFormModal before it is
 * saved — nothing is auto-created (honors the human-review-before-write rule).
 */
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";

const DELTA_LABEL = {
  grid_shift: "grid shift", connection_change: "connection change",
  dimension_change: "dimension change", detail_revised: "detail revision",
  callout_added: "callout added", callout_removed: "callout removed",
  material_change: "material change", elevation_change: "elevation change",
  sheet_added: "sheet added", sheet_removed: "sheet removed", other: "revision change",
};

/** Build a create-mode RFIFormModal `prefill` object from a delta. Pure. */
export function buildRfiPrefillFromDelta(delta, { sheetNumber } = {}) {
  const d = delta || {};
  const sheet = d.sheet_number || sheetNumber || "";
  const label = DELTA_LABEL[d.delta_type] || "revision change";
  const title = `[Rev] ${sheet ? `${sheet} — ` : ""}${label}`.slice(0, 200);
  const parts = [
    d.description ? `A revision changed this sheet: ${d.description}` : null,
    d.recommended_action ? `Recommended action: ${d.recommended_action}` : null,
    "Please confirm the intended condition.",
  ].filter(Boolean);
  const priority = d.severity === "critical" ? "Critical" : d.severity === "high" ? "High" : "Medium";
  return {
    title,
    question: parts.join("\n\n"),
    description: d.description || "",
    drawing_reference: sheet || "",
    priority,
  };
}

/**
 * Build a create-mode RFIFormModal `prefill` from a deterministic Revision
 * Summary (no AI delta needed). Backs the "Create RFI" action on the
 * RevisionSummaryCard's "likely RFI" section. Pure.
 */
export function buildRfiPrefillFromSummary(summary) {
  const s = summary || {};
  const setName = s.setName || "drawing set";
  const sheets = (s.likelyRfi?.sheets || []).filter(Boolean);
  const reason = s.likelyRfi?.reason || "A revision introduced high-risk changes.";
  const highRiskLines = (s.highRisk || [])
    .map((h) => `• ${h?.sheetNumber || "sheet"}: ${h?.reason || ""}`)
    .join("\n");
  const parts = [
    `A revision of "${setName}" changed ${s.sheetsChanged || 0} sheet(s).`,
    reason,
    highRiskLines ? `High-risk changes:\n${highRiskLines}` : null,
    // impact.note is carried by the `description` field below — don't repeat it here.
    "Please confirm the intended condition before fabrication proceeds.",
  ].filter(Boolean);
  const priority = s.impact?.level === "high" || (s.highRiskCount || 0) > 0 ? "High" : "Medium";
  return {
    title: `[Rev] ${setName} — revision review`.slice(0, 200),
    question: parts.join("\n\n"),
    description: s.impact?.note || "",
    drawing_reference: sheets.join(", "),
    priority,
  };
}

/**
 * Create the RFI from the (reviewed) form payload and link it back to the
 * delta. Returns the created RFI row. A link write-back failure is logged but
 * does not fail the create — the RFI still exists.
 */
export async function createRfiAndLink({ projectId, formData, deltaId }) {
  const pid = projectId || formData?.project_id;
  const rfi_number = formData?.rfi_number || (await getNextFormattedNumber({
    projectId: pid, recordType: "RFI", entityName: "RFI", fieldName: "rfi_number", prefix: "RFI #",
  }));
  const created = await entities.RFI.create({ ...formData, project_id: pid, rfi_number });
  if (deltaId && created?.id) {
    const { error } = await supabase
      .from("drawing_revision_deltas")
      .update({ linked_rfi_id: created.id })
      .eq("id", deltaId);
    if (error) console.error("[rfiFromDelta] linked_rfi_id write-back failed:", error.message);
  }
  return created;
}
