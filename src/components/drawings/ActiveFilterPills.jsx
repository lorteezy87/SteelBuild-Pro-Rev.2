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
import {
  resolveStageFilterLabel,
  activeFilterPillStyle,
  activeFilterXStyle,
  activeFilterClearAllStyle,
  activeFilterByLabelStyle,
} from "./activeFilterPillsHelpers";

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
    const stageLabel = resolveStageFilterLabel(stageFilter, STAGES);
    pills.push({ key: "stage", label: `STAGE: ${stageLabel}`, onClear: onClearStage });
  }
  if (pills.length === 0) return null;

  const pillStyle = activeFilterPillStyle(mono);
  const xStyle = activeFilterXStyle(mono);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 14 }}>
      <span style={activeFilterByLabelStyle(mono)}>
        FILTERING BY
      </span>
      {pills.map(p => (
        <span key={p.key} className="sbd-badge-gold" style={pillStyle}>
          {p.label}
          <button type="button" aria-label={`Clear ${p.key} filter`} onClick={p.onClear} style={xStyle}>×</button>
        </span>
      ))}
      {pills.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          style={activeFilterClearAllStyle(mono)}
        >
          CLEAR ALL
        </button>
      )}
    </div>
  );
}
