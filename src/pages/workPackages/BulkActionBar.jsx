/**
 * BulkActionBar — shown only when the user has one or more rows
 * selected in the list. Offers quick status-set buttons for each
 * STATUS_COLUMN, a CSV export of the selection, and a clear-selection
 * button.
 *
 * Disabled automatically when `isUpdating` is true so a user can't
 * spam the same status during an in-flight bulk update.
 */

import React from "react";
import { STATUS_COLORS, STATUS_COLUMNS } from "./constants";

export default function BulkActionBar({ count, onSetStatus, onExport, onClear, isUpdating }) {
  if (count === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        background: "rgba(99,102,241,0.10)",
        border: "1px solid var(--accent)",
        borderRadius: "var(--radius-card)",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>
        {count} selected
      </span>
      <span style={{ color: "var(--divider)" }}>|</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>SET STATUS</span>

      {STATUS_COLUMNS.map((s) => (
        <button
          key={s}
          disabled={isUpdating}
          onClick={() => onSetStatus(s)}
          style={{
            padding: "4px 10px",
            borderRadius: "var(--radius-btn)",
            border: `1px solid ${STATUS_COLORS[s]}`,
            background: `${STATUS_COLORS[s]}18`,
            color: STATUS_COLORS[s],
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            cursor: "pointer",
            textTransform: "uppercase",
            opacity: isUpdating ? 0.5 : 1,
          }}
        >
          {s}
        </button>
      ))}

      <button
        onClick={onExport}
        style={{
          padding: "4px 10px",
          borderRadius: "var(--radius-btn)",
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface-low)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Export {count}
      </button>

      <button
        onClick={onClear}
        style={{
          padding: "4px 10px",
          borderRadius: "var(--radius-btn)",
          border: "1px solid var(--border-default)",
          background: "transparent",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          cursor: "pointer",
          marginLeft: "auto",
        }}
      >
        Clear
      </button>
    </div>
  );
}
