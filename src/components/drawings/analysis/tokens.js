/**
 * Shared inline-style tokens for the Drawing Analysis module.
 *
 * All colors flow through CSS custom properties so themes can swap them.
 * Safety Orange is used for critical/high severity and destructive
 * actions. Electric Cyan is the AI-layer accent — borders, icons, and
 * headings that mark AI-generated content.
 */

export const mono     = { fontFamily: "var(--font-mono)" };
export const display  = { fontFamily: "'Space Grotesk', var(--font-display)" };

export const AI_ACCENT       = "var(--ai-accent, #22D3EE)";        // Electric Cyan
export const CRITICAL_ACCENT = "var(--safety-orange, #F97316)";    // Safety Orange

export const SEVERITY_COLORS = {
  critical: "var(--safety-orange, #F97316)",
  high:     "var(--safety-orange, #F97316)",
  medium:   "var(--status-warning, #EAB308)",
  low:      "var(--status-info, #38BDF8)",
  info:     "var(--text-muted, #64748B)",
};

export const STATUS_COLORS = {
  pending:    "var(--text-muted)",
  processing: AI_ACCENT,
  complete:   "var(--status-success)",
  error:      "var(--status-error)",
};

export const STAGE_ACCENT = {
  OFA: AI_ACCENT, BFA: AI_ACCENT,
  OFS: AI_ACCENT, BFS: AI_ACCENT,
  FFF: "var(--status-warning)",
  Released: "var(--status-success)",
  IFA: "var(--text-muted)", IFC: "var(--accent)",
  Shop: "var(--accent)", Revision: "var(--status-warning)",
};

export const surface = {
  background:   "var(--bg-surface)",
  border:       "1px solid var(--border-default)",
  borderRadius: 4,
};

export const pill = (color) => ({
  ...mono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color,
  padding: "2px 8px",
  border: `1px solid ${color}`,
  borderRadius: 2,
  background: "transparent",
  display: "inline-block",
});

export const FINDING_TYPE_LABEL = {
  missing_info:          "MISSING INFO",
  coordination_conflict: "COORD. CONFLICT",
  callout_issue:         "CALLOUT",
  revision_delta:        "REVISION",
  dimension_concern:     "DIMENSION",
  aess_concern:          "AESS",
};
