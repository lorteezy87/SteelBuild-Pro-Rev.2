/**
 * Shared constants and style objects for the Constraint Log — kept out
 * of the page shell so feature components can import directly.
 *
 * Constraint "type" is the high-level category (Missing Embeds, Anchor
 * Bolt Issue, etc.). Each type has a color + icon used across the
 * KPI strip, cards, list rows, and the type-selector in the form.
 */

export const CONSTRAINT_TYPES = [
  "Missing Embeds",
  "Anchor Bolt Issue",
  "Approved Submittal Missing",
  "Release Pending",
  "Field Measurement Needed",
  "Access Issue",
  "Crane / Logistics Conflict",
  "Predecessor Not Complete",
  "Material Not Available",
  "Design Change Pending",
  "Other",
];

export const TYPE_COLORS = {
  "Missing Embeds":              "var(--status-error)",
  "Anchor Bolt Issue":           "var(--status-error)",
  "Approved Submittal Missing":  "var(--status-warning)",
  "Release Pending":             "var(--status-warning)",
  "Field Measurement Needed":    "var(--accent)",
  "Access Issue":                "var(--status-error)",
  "Crane / Logistics Conflict":  "var(--status-error)",
  "Predecessor Not Complete":    "var(--status-warning)",
  "Material Not Available":      "var(--status-warning)",
  "Design Change Pending":       "var(--accent)",
  Other:                         "var(--text-muted)",
};

export const TYPE_ICONS = {
  "Missing Embeds":              "\u2B1C",
  "Anchor Bolt Issue":           "\u2693",
  "Approved Submittal Missing":  "\u2709",
  "Release Pending":             "\u23F3",
  "Field Measurement Needed":    "\u{1F4CF}",
  "Access Issue":                "\u{1F6AB}",
  "Crane / Logistics Conflict":  "\u{1F3D7}",
  "Predecessor Not Complete":    "\u26D4",
  "Material Not Available":      "\u{1F4E6}",
  "Design Change Pending":       "\u270F",
  Other:                         "\u2022",
};

export const PRIORITY_CONFIG = {
  Critical: { color: "var(--status-error)",   bg: "var(--danger-muted)",           border: "var(--danger-border)",           dot: "#FF4444" },
  High:     { color: "var(--status-warning)", bg: "var(--warning-muted)",          border: "var(--warning-border)",          dot: "var(--tertiary)" },
  Medium:   { color: "var(--accent)",         bg: "var(--accent-muted)",           border: "var(--accent-border)",           dot: "var(--accent)" },
  Low:      { color: "var(--text-muted)",     bg: "rgba(144,144,149,0.1)",         border: "rgba(144,144,149,0.25)",         dot: "#909095" },
};

export const STATUS_CONFIG = {
  Open:          { color: "var(--status-warning)", bg: "var(--warning-muted)",      label: "OPEN" },
  "In Progress": { color: "var(--accent)",         bg: "var(--accent-muted)",       label: "IN PROGRESS" },
  Resolved:      { color: "var(--status-success)", bg: "var(--success-muted)",      label: "RESOLVED" },
  Closed:        { color: "var(--text-muted)",     bg: "rgba(144,144,149,0.1)",     label: "CLOSED" },
};

export const PRIORITIES = ["Critical", "High", "Medium", "Low"];

export const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

export const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};
