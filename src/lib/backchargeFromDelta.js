/**
 * backchargeFromDelta.js — log a rework backcharge from a downstream revision
 * delta. When the AI Revision Impact Report finds high-severity changes on a
 * sheet that's already fabricated/delivered, the PM can open a pre-filled
 * Backcharge (Phase 1 module) for the rework exposure. Staged/human-confirmed —
 * the PM reviews and sets the $ amount + responsible party before it's created.
 *
 * The link back to the revision lives in the backcharge's `metadata`
 * (source_type='revision_delta', source_delta_id, sheet_number) — no schema
 * change; the report queries it to show which sheets already have a backcharge.
 */
import { createBackcharge } from "@/lib/backcharge/repository";

/** Build a complete BackchargeFormModal prefill from a downstream sheet result. Pure. */
export function buildBackchargePrefillFromSheet(sheet) {
  const s = sheet || {};
  const sheetNumber = s.sheetNumber || "sheet";
  const downstream = s.downstream || "downstream";
  const kept = (s.deltas || []).filter((d) => d && !d.dismissed);
  const hot = kept.filter((d) => d.severity === "critical" || d.severity === "high");
  const top = hot[0] || kept[0] || null;
  const changeLines = hot.slice(0, 4).map((d) => `• ${d.description}${d.recommended_action ? ` (${d.recommended_action})` : ""}`);
  const description = [
    `Drawing revision changed sheet ${sheetNumber} after it was already ${downstream} — potential rework / backcharge exposure.`,
    changeLines.length ? `Changes:\n${changeLines.join("\n")}` : null,
    "Assess the rework cost and responsible party before sending notice.",
  ].filter(Boolean).join("\n\n");
  return {
    title: `Rework — ${sheetNumber} revised after ${downstream}`.slice(0, 200),
    description,
    responsible_party: "",
    responsible_party_type: "subcontractor",
    reason_code: "rework",
    status: "draft",
    amount: "",
    backcharge_number: "",
    incident_date: "",
    notice_date: "",
    linked_co_id: "",
    source_rfi_id: "",
    notes: "",
    metadata: {
      source_type: "revision_delta",
      source_delta_id: top?.id || null,
      sheet_number: sheetNumber,
      severity: top?.severity || null,
    },
  };
}

/**
 * Create the backcharge from the (reviewed) form data, re-stamping the
 * revision-delta source on metadata so the link can't be edited away.
 */
export async function createBackchargeFromDelta({ projectId, formData, sheet }) {
  const sourceMeta = buildBackchargePrefillFromSheet(sheet).metadata;
  const metadata = { ...(formData?.metadata || {}), ...sourceMeta };
  return createBackcharge({ ...formData, project_id: projectId, metadata });
}

/** Sheet numbers that already carry a revision-delta-sourced backcharge. Pure. */
export function sheetsWithRevisionBackcharge(backcharges) {
  const out = new Set();
  for (const bc of backcharges || []) {
    const m = bc?.metadata;
    if (m && typeof m === "object" && m.source_type === "revision_delta" && m.sheet_number) {
      out.add(String(m.sheet_number));
    }
  }
  return out;
}
