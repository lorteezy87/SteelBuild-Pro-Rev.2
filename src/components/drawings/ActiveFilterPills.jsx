/**
 * ActiveFilterPills — one chip per active filter (search / discipline /
 * stage), each with a × to clear. When more than one filter is active a
 * "CLEAR ALL" chip resets everything at once. Renders null when no
 * filters are on so the row is completely empty, not visually blank.
 *
 * Extracted from pages/Drawings.jsx (F22) — no behavior change.
 */

import React from "react";
import { STAGES, mono } from "./drawingsConfig";

export default function ActiveFilterPills({
  search,
  discipline,
  stageFilter,
  onClearSearch,
  onClearDiscipline,
  onClearStage,
  onClearAll,
}) {
  const pills = [];
  if (search?.trim()) {
    pills.push({ key: "search", label: `SEARCH: "${search.trim()}"`, onClear: onClearSearch });
  }
  if (discipline && discipline !== "ALL") {
    pills.push({ key: "discipline", label: `DISCIPLINE: ${discipline}`, onClear: onClearDiscipline });
  }
  if (stageFilter && stageFilter !== "ALL") {
    // Translate the internal keys (_overdue / _inReview / _priority / stage-key)
    // into something the user will recognize.
    let stageLabel = stageFilter;
    if (stageFilter === "_overdue")  stageLabel = "OVERDUE";
    else if (stageFilter === "_inReview") stageLabel = "IN REVIEW";
    else if (stageFilter === "_priority") stageLabel = "PRIORITY";
    else if (stageFilter === "Released") stageLabel = "IFC ONLY";
    else {
      const s = STAGES.find(x => x.key === stageFilter);
      if (s) stageLabel = s.label;
    }
    pills.push({ key: "stage", label: `STAGE: ${stageLabel}`, onClear: onClearStage });
  }
  if (pills.length === 0) return null;

  const pillStyle = {
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
  const xStyle = {
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

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 14 }}>
      <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", color: "var(--text-muted)", marginRight: 2 }}>
        FILTERING BY
      </span>
      {pills.map(p => (
        <span key={p.key} style={pillStyle}>
          {p.label}
          <button type="button" aria-label={`Clear ${p.key} filter`} onClick={p.onClear} style={xStyle}>×</button>
        </span>
      ))}
      {pills.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          style={{
            ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
            padding: "4px 10px", borderRadius: "var(--radius-badge)",
            border: "1px solid var(--border-default)",
            background: "none", color: "var(--text-muted)", cursor: "pointer",
          }}
        >
          CLEAR ALL
        </button>
      )}
    </div>
  );
}
