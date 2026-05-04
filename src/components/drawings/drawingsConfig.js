/**
 * drawingsConfig.js — Drawings & Submittals domain constants
 *
 * Single source of truth for stage definitions, disciplines,
 * empty form defaults, and shared inline-style tokens.
 */

// ─── Stage Definitions ──────────────────────────────────────────────────────
//
// Palette tuned for maximum hue separation between adjacent stages so
// the row badges and the stage-progress mini-bar read clearly at a
// glance:
//
//   Not Started → slate    (neutral)
//   OFA         → blue     (out, cool)
//   BFA         → orange   (back, warm — needs attention in our court)
//   OFS         → teal     (out for scrub, distinct cool)
//   BFS         → red      (back from scrub, warm — needs attention)
//   IFC (FFF)   → yellow   (final approval, distinct from greens)
//   Released    → emerald  (done)
//
// Earlier scheme used adjacent blue→cyan, amber→orange, lime→emerald
// pairs which were too close to distinguish quickly. Each stage now
// picks a different family from the wheel.
export const STAGES = [
  { key: "Not Started", label: "NOT STARTED", color: "#64748B", bg: "rgba(100,116,139,0.16)" }, // slate
  { key: "OFA",         label: "OFA",         color: "#2563EB", bg: "rgba(37,99,235,0.18)"   }, // blue
  { key: "BFA",         label: "BFA",         color: "#F97316", bg: "rgba(249,115,22,0.18)"  }, // orange
  { key: "OFS",         label: "OFS",         color: "#0D9488", bg: "rgba(13,148,136,0.18)"  }, // teal
  { key: "BFS",         label: "BFS",         color: "#DC2626", bg: "rgba(220,38,38,0.18)"   }, // red
  { key: "FFF",         label: "IFC",         color: "#EAB308", bg: "rgba(234,179,8,0.18)"   }, // yellow
  { key: "Released",    label: "RELEASED",    color: "#10B981", bg: "rgba(16,185,129,0.18)"  }, // emerald
];

/** Map stage key → { key, label, color, bg } */
export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

/** Ordered stage keys for advancement logic */
export const STAGE_ORDER = STAGES.map(s => s.key);

/**
 * Stages considered "in review" — any non-IFC stage that has left
 * "Not Started". Includes FFF (For Final Approval) because a sheet sitting
 * in FFF is still under review by the owner and not yet issued for
 * construction. Single source of truth for both the stat tile and the
 * "_inReview" filter button so their counts never disagree.
 */
export const IN_REVIEW_STAGES = ["OFA", "BFA", "OFS", "BFS", "FFF"];

// ─── Discipline List ────────────────────────────────────────────────────────

export const DISCIPLINES = [
  "Structural",
  "Misc Metals",
  "Connections",
  "Anchor Bolts",
  "Erection",
  "MEP",
  "Civil",
  "Architectural",
];

// ─── Empty Form Defaults ────────────────────────────────────────────────────

export const EMPTY_FORM = {
  drawing_set_name: "",
  sheet_number: "",
  title: "",
  discipline: "Structural",
  revision_number: "0",
  stage: "Not Started",
  submitted_date: "",
  return_date: "",
  due_date: "",
  fabrication_start_date: "",
  fabrication_finish_date: "",
  ready_for_install_date: "",
  final_delivery_date: "",
  reviewer: "",
  spec_section: "",
  notes: "",
  linked_rfi_ids: "",
  priority_flag: false,
  pdf_page: 1,
};

// ─── Shared Inline-Style Tokens ─────────────────────────────────────────────

/** Monospace font shorthand for header labels and data cells */
export const mono = { fontFamily: "var(--font-mono)" };

/** Standard surface card treatment */
export const surface = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
};

/** Button base styles */
export const btnBase = {
  ...mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  borderRadius: 2,
  cursor: "pointer",
  border: "none",
  padding: "6px 14px",
  textTransform: "uppercase",
};

export const btnPrimary = { ...btnBase, background: "var(--accent)", color: "#000", borderRadius: "var(--radius-btn)" };
export const btnGhost = { ...btnBase, background: "none", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: "var(--radius-btn)" };
