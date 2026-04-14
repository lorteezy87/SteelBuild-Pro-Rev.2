/**
 * drawingsConfig.js — Drawings & Submittals domain constants
 *
 * Single source of truth for stage definitions, disciplines,
 * empty form defaults, and shared inline-style tokens.
 */

// ─── Stage Definitions ──────────────────────────────────────────────────────

export const STAGES = [
  { key: "Not Started", label: "NOT STARTED", color: "#6B7280", bg: "rgba(107,114,128,0.15)" },
  { key: "OFA",         label: "OFA",         color: "#3B82F6", bg: "rgba(59,130,246,0.15)" },
  { key: "BFA",         label: "BFA",         color: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
  { key: "OFS",         label: "OFS",         color: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  { key: "BFS",         label: "BFS",         color: "#F97316", bg: "rgba(249,115,22,0.15)" },
  { key: "FFF",         label: "FFF",         color: "#84CC16", bg: "rgba(132,204,22,0.15)" },
  { key: "Released",    label: "IFC",         color: "#10B981", bg: "rgba(16,185,129,0.15)" },
];

/** Map stage key → { key, label, color, bg } */
export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

/** Ordered stage keys for advancement logic */
export const STAGE_ORDER = STAGES.map(s => s.key);

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
  reviewer: "",
  spec_section: "",
  notes: "",
  linked_rfi_ids: "",
  priority_flag: false,
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
