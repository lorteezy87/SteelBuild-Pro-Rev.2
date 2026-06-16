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
