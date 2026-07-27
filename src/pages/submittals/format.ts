import { compareDrawingSetPackages } from "@/lib/drawingSetOrdering";
import type { DrawingSetsById, Submittal } from "./types";

export const STATUSES = [
  "Draft", "Submitted", "Under Review", "Approved", "Approved as Noted",
  "Revise and Resubmit", "Rejected", "Released for Fabrication", "Void",
];

export const TYPES = ["Shop Drawing", "Product Data", "Sample", "Mock-up", "Calculation", "Other"];

// Ball-in-court values, ordered to mirror the real workflow handoff
// (corrected May 2026 / migration 077):
//   Detailer-class:  Detailer / S&H / Contractor / Subcontractor → IFA/OFS
//   Approver-class:  EOR / Architect / AOR                       → OFA/BFA
//   Downstream-class: GC / Owner                                  → IFC
// See src/lib/submittalStageMapping.js for the canonical mapping.
export const BIC_CHOICES = [
  "Detailer", "S&H", "Contractor", "Subcontractor",
  "EOR", "Architect", "AOR",
  "GC", "Owner",
];

// One-color-per-status palette so adjacent statuses don't blur into
// each other. Earlier scheme collapsed eight statuses onto four
// tokens — Approved / Approved as Noted both green, Revise and
// Resubmit / Rejected both red, Draft / Void both gray — which made
// the badges in the table impossible to distinguish at a glance.
export const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  "Draft":               { color: "var(--text-muted)", bg: "color-mix(in srgb, var(--text-muted) 16%, transparent)" }, // slate
  "Submitted":           { color: "var(--status-info)", bg: "var(--info-muted)"   }, // blue
  "Under Review":        { color: "var(--accent)", bg: "var(--accent-muted)"  }, // teal — distinct from blue
  "Approved":            { color: "var(--status-success)", bg: "var(--success-muted)"  }, // emerald
  "Approved as Noted":   { color: "var(--status-success-bright)", bg: "color-mix(in srgb, var(--status-success-bright) 18%, transparent)"  }, // lime — yellow-green, related to Approved
  "Revise and Resubmit": { color: "var(--status-review)", bg: "var(--status-review-muted)"  }, // orange — action, warm
  "Rejected":            { color: "var(--status-error)", bg: "var(--danger-muted)"   }, // red — failure
  "Released for Fabrication": { color: "var(--status-info)", bg: "var(--info-muted)" }, // sky blue — past approval, into production
  "Void":                { color: "var(--text-muted)", bg: "color-mix(in srgb, var(--text-muted) 14%, transparent)" }, // cool gray — distinct from Draft slate
};

export function compareSubmittalsByDrawingSet(a: Submittal, b: Submittal, drawingSetsById: DrawingSetsById): number {
  const aSet = Array.isArray(a.drawing_set_ids) ? drawingSetsById.get(a.drawing_set_ids[0]) : null;
  const bSet = Array.isArray(b.drawing_set_ids) ? drawingSetsById.get(b.drawing_set_ids[0]) : null;
  if (aSet && bSet) {
    const bySet = compareDrawingSetPackages(aSet, bSet);
    if (bySet !== 0) return bySet;
  } else if (aSet) {
    return -1;
  } else if (bSet) {
    return 1;
  }
  return String(a.submittal_number || "").localeCompare(String(b.submittal_number || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
