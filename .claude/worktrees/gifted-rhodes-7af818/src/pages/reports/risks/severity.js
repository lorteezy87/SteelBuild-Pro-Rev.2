/**
 * Risk severity helpers — single source of truth for the four
 * Risk reports + the shared form modal.
 *
 * The DB has a `severity` GENERATED ALWAYS AS (...) STORED column
 * keyed off the same probability * impact bands. We mirror those
 * bands here verbatim so the form's live preview, the matrix cells,
 * and the dashboard badges all read the same colour as the row that
 * just landed in Postgres. If you change the band edges in the
 * migration, change them here too.
 *
 *   score >= 20 → Critical (red)
 *   score >= 12 → High     (amber)
 *   score >=  6 → Medium   (review)
 *   else        → Low      (green)
 */

export const RISK_CATEGORIES = [
  "Schedule",
  "Cost",
  "Safety",
  "Quality",
  "Scope",
  "Resource",
  "External",
  "Other",
];

export const RISK_STATUSES = [
  "Open",
  "Mitigating",
  "Mitigated",
  "Closed",
  "Accepted",
  "Transferred",
];

export const SEVERITIES = ["Critical", "High", "Medium", "Low"];

/** Numeric risk score (1..25). */
export function computeScore(probability, impact) {
  const p = Number(probability) || 0;
  const i = Number(impact) || 0;
  return p * i;
}

/** Severity band derived from probability * impact. Mirrors the DB column. */
export function computeSeverity(probability, impact) {
  const score = computeScore(probability, impact);
  if (score >= 20) return "Critical";
  if (score >= 12) return "High";
  if (score >= 6)  return "Medium";
  return "Low";
}

/**
 * Severity → CSS variable. Project rule: no purple, no pink. We map
 * onto the existing status tokens so the colour palette stays
 * consistent with what every other report renders for status chips.
 */
export function severityColor(severity) {
  switch (severity) {
    case "Critical": return "var(--status-error)";
    case "High":     return "var(--status-warning)";
    case "Medium":   return "var(--status-review)";
    case "Low":      return "var(--status-success)";
    default:         return "var(--text-muted)";
  }
}

/**
 * Buckets a list of risks into a 5x5 grid keyed by [impact][probability].
 * Used by the Risk Status (matrix) report. Returns a 6-element array
 * indexed 0..5 where 0 is unused (probability/impact start at 1) so
 * call sites can index by the raw value without subtracting one.
 */
export function bucketByMatrix(risks) {
  const grid = Array.from({ length: 6 }, () =>
    Array.from({ length: 6 }, () => [])
  );
  for (const r of risks) {
    const p = Number(r.probability);
    const i = Number(r.impact);
    if (p >= 1 && p <= 5 && i >= 1 && i <= 5) {
      grid[p][i].push(r);
    }
  }
  return grid;
}

/** True if a risk is still on the books (i.e. not closed / accepted). */
export function isActiveRisk(r) {
  return r.status !== "Closed" && r.status !== "Mitigated";
}
