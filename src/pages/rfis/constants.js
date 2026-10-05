/**
 * Shared constants for the RFI Hub (palette, priority/status configs,
 * workflow column order, mono style object).
 *
 * Pulled out of RFIs.jsx so feature components can import them without
 * reaching back into the page shell.
 */

import { BALL_IN_COURT_PARTIES } from "@/lib/ballInCourt";

export const mono = { fontFamily: "var(--font-mono)" };

export const UNASSIGNED_BIC_COLORS = {
  bg: "var(--bg-elevated)",
  text: "var(--text-muted)",
};

// One entry per BALL_IN_COURT_PARTIES member, asserted by test. DetailPanel
// renders unknown parties neutrally; the coverage test keeps a missing
// canonical party from silently losing its color. The original parties keep
// their existing colours; EOR takes
// the slot "Engineer" had, since Engineer was its synonym.
export const BIC_COLORS = {
  // Detailer class — our side of the handoff.
  Contractor:    { bg: "var(--info-muted)",          text: "var(--accent)" },
  Subcontractor: { bg: "var(--info-muted)",          text: "var(--status-info)" },
  Detailer:      { bg: "var(--secondary-muted)",     text: "var(--secondary)" },
  // Approver class.
  EOR:           { bg: "var(--warning-muted)",       text: "var(--status-warning)" },
  Architect:     { bg: "var(--success-muted)",       text: "var(--status-success)" },
  AOR:           { bg: "var(--status-review-muted)", text: "var(--status-review)" },
  // Downstream.
  GC:            { bg: "var(--accent-muted)",        text: "var(--secondary)" },
  Owner:         { bg: "var(--danger-muted)",        text: "var(--status-error)" },
};

export const PRIORITY_CFG = {
  Critical: { color: "var(--status-error)",   bg: "var(--danger-muted)"  },
  High:     { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  Medium:   { color: "var(--accent)",         bg: "var(--accent-muted)"  },
  Low:      { color: "var(--text-muted)",     bg: "var(--hover-bg)"      },
};

/**
 * Legacy status palette for the older ListView / DetailPanel surfaces.
 *
 * `rfiStatus.ts` is the canonical model — prefer `rfiStatusView()` in new code.
 * Void is included here because both call sites resolve with
 * `STATUS_CFG[status] || STATUS_CFG.Open`, so its absence made a **voided RFI
 * render as an amber "Open" pill** — the exact opposite of its meaning.
 */
export const STATUS_CFG = {
  Open:                  { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  "Under Review":        { color: "var(--status-info)",    bg: "var(--info-muted)"    },
  Void:                  { color: "var(--text-disabled)",  bg: "var(--hover-bg)"      },
  // "Incomplete Response" — GC replied but the response doesn't fully address
  // the question; another round is required. Treated as still-open (not in
  // ["Answered","Closed"]). Uses the danger palette to flag "needs another
  // round" without overlapping the in-progress amber of Open.
  "Incomplete Response": { color: "var(--status-error)",   bg: "var(--danger-muted)"  },
  Answered:              { color: "var(--status-success)", bg: "var(--success-muted)" },
  Closed:                { color: "var(--text-muted)",     bg: "var(--hover-bg)"      },
};

// Board columns. Void is included so a voided RFI still lands somewhere —
// without a column it was dropped from the board entirely while remaining in
// the total count.
export const statusColumns = ["Open", "Under Review", "Incomplete Response", "Answered", "Closed", "Void"];

// RFI numbers arrive from several paths: app-created values use "RFI 001",
// older imports may store "001", and vendor logs often use "RFI-001".
// Sorting should treat all of those as the same numeric sequence.
export const RFI_NUMBER_PATTERN = /(\d+)/;

export const KPI_ACCENT_MAP = {
  "var(--status-success)": "var(--success-muted)",
  "var(--status-warning)": "var(--warning-muted)",
  "var(--status-error)":   "var(--danger-muted)",
  "var(--status-info)":    "var(--info-muted)",
  "var(--accent)":         "var(--accent-muted)",
};

// The buttons DetailPanel writes straight to rfis.ball_in_court, so this must
// be the vocabulary chk_rfis_ball_in_court enforces. It used to be its own
// five-value list containing "Engineer", which no constraint allows — one click
// lost the user's save.
export const BIC_PARTIES = BALL_IN_COURT_PARTIES;
export const PRIORITIES  = ["Critical", "High", "Medium", "Low"];

// Discipline filter chips used by the canonical RFI control center.
export const DISCIPLINES = ["All", "Structural", "Connections", "Misc Metals", "Anchor Bolts"];

// Density presets persist in localStorage. "Compact" tightens the row
// height + drops the submitter sub-line; "Comfortable" gives the row
// 50px of breathing room. Density mutates the CSS variable that
// RfiRow reads for its row height.
export const DENSITY_LS_KEY = "sbp-rfi-density";
export const DENSITY_PRESETS = {
  compact:     { rowHeight: 56, label: "COMPACT" },
  normal:      { rowHeight: 72, label: "NORMAL" },
  comfortable: { rowHeight: 88, label: "COMFORTABLE" },
};

export const INSIGHTS_LS_KEY = "sbp-rfi-insights-collapsed";
