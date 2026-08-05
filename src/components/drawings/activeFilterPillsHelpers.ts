/**
 * Pure stage-label resolver + chrome styles for ActiveFilterPills.
 */

import type { CSSProperties } from "react";

export function resolveStageFilterLabel(
  stageFilter: string,
  stages: Array<{ key: string; label: string }>,
): string {
  if (stageFilter === "_overdue") return "OVERDUE";
  if (stageFilter === "_inReview") return "IN REVIEW";
  if (stageFilter === "_priority") return "PRIORITY";
  if (stageFilter === "Released") return "IFC ONLY";
  const s = stages.find((x) => x.key === stageFilter);
  return s ? s.label : stageFilter;
}

export function activeFilterPillStyle(mono: CSSProperties): CSSProperties {
  return {
    ...mono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: "4px 6px 4px 10px",
    borderRadius: "var(--radius-badge)",
    border: "1px solid rgba(200,155,32,0.35)",
    background: "rgba(200,155,32,0.10)",
    color: "var(--accent)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

export function activeFilterXStyle(mono: CSSProperties): CSSProperties {
  return {
    ...mono,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1,
    padding: "2px 5px",
    marginLeft: 2,
    borderRadius: 3,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
  };
}

export function activeFilterClearAllStyle(mono: CSSProperties): CSSProperties {
  return {
    ...mono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: "4px 10px",
    borderRadius: "var(--radius-badge)",
    border: "1px solid var(--border-default)",
    background: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
  };
}

export function activeFilterByLabelStyle(mono: CSSProperties): CSSProperties {
  return {
    ...mono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.15em",
    color: "var(--text-muted)",
    marginRight: 2,
  };
}
