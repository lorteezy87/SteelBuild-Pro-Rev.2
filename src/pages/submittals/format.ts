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
  "Draft":               { color: "#64748B", bg: "rgba(100,116,139,0.16)" }, // slate
  "Submitted":           { color: "#2563EB", bg: "rgba(37,99,235,0.18)"   }, // blue
  "Under Review":        { color: "#0D9488", bg: "rgba(13,148,136,0.18)"  }, // teal — distinct from blue
  "Approved":            { color: "#10B981", bg: "rgba(16,185,129,0.18)"  }, // emerald
  "Approved as Noted":   { color: "#84CC16", bg: "rgba(132,204,22,0.18)"  }, // lime — yellow-green, related to Approved
  "Revise and Resubmit": { color: "#F97316", bg: "rgba(249,115,22,0.18)"  }, // orange — action, warm
  "Rejected":            { color: "#DC2626", bg: "rgba(220,38,38,0.18)"   }, // red — failure
  "Released for Fabrication": { color: "#0EA5E9", bg: "rgba(14,165,233,0.18)" }, // sky blue — past approval, into production
  "Void":                { color: "#94A3B8", bg: "rgba(148,163,184,0.14)" }, // cool gray — distinct from Draft slate
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
