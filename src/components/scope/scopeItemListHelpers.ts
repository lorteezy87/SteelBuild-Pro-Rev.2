/**
 * Pure category colors for ScopeItemList.
 */

export const CATEGORY_COLORS: Record<string, string> = {
  Structural: "var(--accent)",
  "Misc Metals": "var(--status-warning)",
  Connections: "var(--status-info)",
  Coatings: "var(--text-muted)",
  Erection: "var(--status-success)",
  Engineering: "var(--accent)",
  Other: "var(--text-muted)",
};

/** Pure type → color for scope item badges (icons stay in the list component). */
export const TYPE_COLORS: Record<string, string> = {
  Scope: "var(--status-success)",
  Exclusion: "var(--status-error)",
  Clarification: "var(--status-info)",
};
