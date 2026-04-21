/**
 * SortHeader — clickable column header for the project-status matrix.
 * Highlights + shows an arrow when `sortField === field`. The parent
 * owns the sort state and flips `sortDir` through `onSort`.
 */

import React from "react";
import { LABEL } from "./constants";

export default function SortHeader({ label, field, sortField, sortDir, onSort, style = {} }) {
  const active = sortField === field;
  return (
    <div
      onClick={() => onSort(field)}
      style={{
        ...LABEL,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 3,
        color: active ? "var(--accent)" : "var(--text-muted)",
        userSelect: "none",
        ...style,
      }}
    >
      {label}
      {active && <span style={{ fontSize: 8 }}>{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}
    </div>
  );
}
