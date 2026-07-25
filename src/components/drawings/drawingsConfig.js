/**
 * drawingsConfig.js — Drawings & Submittals domain constants
 *
 * Single source of truth for stage definitions, disciplines,
 * empty form defaults, and shared inline-style tokens.
 */

// ─── Stage Definitions ──────────────────────────────────────────────────────
//
// Canonical detailing/submittal flow (R&R promoted to a first-class
// derived stage 2026-07-25 — see ARCHITECTURE.md decision log):
//
//   Not Started → IFA → OFA → BFA → OFS → IFC → Released for Fab
//                          ↑     │
//                          │     └─ R&R (Revise & Resubmit) — a returned
//                          └──────  disposition parks the package in the
//                                   R&R stage until the revised set is
//                                   actually retransmitted (→ OFA).
//
// Stage glossary:
//   IFA = In For Approval         — internal prep (detailer → S&H → GC,
//                                   before going to EOR)
//   OFA = Out For Approval        — submitted to EOR / AOR
//   BFA = Back From Approval      — returned with AAN / Approved / R&R
//   R&R = Revise and Resubmit     — returned R&R/Rejected; detailer owns
//                                   the rework until resubmission (DERIVED
//                                   display stage only — never written to
//                                   drawings.stage)
//   OFS = Out For Scrub           — post-approval cleanup (detailer
//                                   addressing EOR's comments)
//   IFC = Issued For Construction — S&H sends record copy to GC
//   Released for Fab              — S&H internal release to shop, terminal
//
// Color sequence: cool→warm→cool→warm with green at the end so the
// chevron strip reads as progress.
//
// ⚠ TWO ORDERS, ON PURPOSE:
//   • STAGES / STAGE_ORDER (7 values) — the SHEET stage enum. Mirrors the
//     `chk_drawings_stage` DB CHECK and drives every sheet-stage WRITE path
//     (BulkActionBar, AdvanceStageDialog legacy fallback, DrawingKanban,
//     stage sort). "R&R" must NEVER appear here.
//   • WORKFLOW_STAGES / WORKFLOW_STAGE_ORDER (8 values) — the DISPLAY order
//     for submittal-derived workflow stages (process boards, chips,
//     rollups). Includes R&R after BFA.
export const STAGES = [
  { key: "Not Started", label: "NOT STARTED", color: "#64748B", bg: "rgba(100,116,139,0.16)" }, // slate
  { key: "IFA",         label: "IFA",         color: "#60A5FA", bg: "rgba(96,165,250,0.16)"  }, // info-muted (sky)
  { key: "OFA",         label: "OFA",         color: "#2563EB", bg: "rgba(37,99,235,0.18)"   }, // info (blue)
  { key: "BFA",         label: "BFA",         color: "#FBBF24", bg: "rgba(251,191,36,0.16)"  }, // warning-muted (amber)
  { key: "OFS",         label: "OFS — Out for Scrub", color: "#F97316", bg: "rgba(249,115,22,0.18)"  }, // warning (orange)
  { key: "IFC",         label: "IFC",         color: "#34D399", bg: "rgba(52,211,153,0.16)"  }, // success-muted (mint)
  { key: "Released",    label: "RELEASED",    color: "#10B981", bg: "rgba(16,185,129,0.18)"  }, // success (emerald)
];

/**
 * R&R — a first-class DERIVED workflow stage (never a sheet-enum value).
 * Amber, matching the pre-existing R&R badge / "Revise and Resubmit"
 * status color (#f59e0b) so the promotion doesn't change the R&R hue.
 */
export const RR_STAGE = { key: "R&R", label: "R&R", color: "#F59E0B", bg: "rgba(245,158,11,0.16)" };

/**
 * Display order for submittal-DERIVED workflow stages: the sheet stages
 * with R&R spliced after BFA (an R&R disposition is received at BFA and
 * parks the package until resubmission). Used by the process boards and
 * any surface bucketing/ordering derived stages.
 */
export const WORKFLOW_STAGES = STAGES.flatMap(s => (s.key === "BFA" ? [s, RR_STAGE] : [s]));

/** Ordered workflow-stage keys (8 values, includes "R&R"). Display only. */
export const WORKFLOW_STAGE_ORDER = WORKFLOW_STAGES.map(s => s.key);

/**
 * Map stage key → { key, label, color, bg }. Built over WORKFLOW_STAGES so
 * lookups cover the derived "R&R" stage too (StageChip, board columns);
 * pure superset of the sheet-enum stages, so sheet surfaces are unchanged.
 */
export const STAGE_MAP = Object.fromEntries(WORKFLOW_STAGES.map(s => [s.key, s]));

/** Ordered SHEET stage keys (7 values — mirrors the drawings.stage CHECK).
 *  Drives sheet-stage write paths and sheet sorting. No "R&R" here. */
export const STAGE_ORDER = STAGES.map(s => s.key);

/**
 * Stages considered "in review" — anything that has left "Not Started"
 * but isn't yet "Released for Fabrication". A sheet sitting in IFC is
 * still in active workflow (record copy in transit to GC) so it counts
 * as in-review until S&H releases it for fab. Single source of truth
 * for both the stat tile and the "_inReview" filter button so their
 * counts never disagree. R&R is in-review: the package is mid-cycle,
 * with the detailer owning the rework.
 */
export const IN_REVIEW_STAGES = ["IFA", "OFA", "BFA", "R&R", "OFS", "IFC"];

/**
 * Build the `entities.Drawing.update` patch for a direct (legacy) sheet-stage
 * change. Single source of truth for the two direct-mutation paths on the
 * Drawings page (the bulk stage edit and the AdvanceStageDialog legacy
 * fallback).
 *
 * §20-21: `drawings.set_approval_status` / `set_approved_date` are DEPRECATED
 * legacy approval columns. When a stage moves AWAY from "Released", we clear
 * those columns in the SAME patch — otherwise a stale set_approval_status=
 * "approved" silently re-derives the sheet as Released on the next refetch and
 * the manual change appears to revert. Moving TO "Released" leaves them alone
 * (the dedicated Set-Approval flow owns the "approved" pills).
 *
 * @param {string} newStage — the target stage key (e.g. "IFA", "Released")
 * @returns {{ stage: string, set_approval_status?: null, set_approved_date?: null }}
 */
export function stageUpdatePatch(newStage) {
  return {
    stage: newStage,
    ...(newStage !== "Released" ? { set_approval_status: null, set_approved_date: null } : {}),
  };
}

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
  // New rows start in "Not Started" — IFA is the first active workflow
  // stage but a fresh, unlinked sheet shouldn't auto-jump into it.
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

// ─── Drawings register table config ─────────────────────────────────────────

// F20: fields the user can click the header to sort on. Keyed by the data
// field (or a pseudo-field like "overdue") and given a comparator that knows
// how to handle the type. Keeping this out of the component body so it's a
// stable reference and doesn't churn the memo on every render.
export const SORTABLE_FIELDS = {
  sheet_number:    { label: "SET / SHEET #", cmp: (a, b) => String(a.sheet_number || "").localeCompare(String(b.sheet_number || ""), undefined, { numeric: true, sensitivity: "base" }) },
  title:           { label: "TITLE",        cmp: (a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" }) },
  discipline:      { label: "DISCIPLINE",   cmp: (a, b) => String(a.discipline || "").localeCompare(String(b.discipline || ""), undefined, { sensitivity: "base" }) },
  revision_number: { label: "REV",          cmp: (a, b) => (Number(a.revision_number) || 0) - (Number(b.revision_number) || 0) },
  stage:           { label: "STAGE",        cmp: (a, b) => STAGE_ORDER.indexOf(a.stage || "") - STAGE_ORDER.indexOf(b.stage || "") },
  submitted_date:  { label: "SUBMITTED",    cmp: (a, b) => String(a.submitted_date || "").localeCompare(String(b.submitted_date || "")) },
  due_date:        { label: "DUE DATE",     cmp: (a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")) },
  reviewer:        { label: "REVIEWER",     cmp: (a, b) => String(a.reviewer || "").localeCompare(String(b.reviewer || ""), undefined, { sensitivity: "base" }) },
};

// F23: below this container width (in px) we collapse the less-critical
// columns so the table still fits on laptops + tablets without a horizontal
// scrollbar eating the rest of the page.
export const COMPACT_WIDTH_PX = 1200;
