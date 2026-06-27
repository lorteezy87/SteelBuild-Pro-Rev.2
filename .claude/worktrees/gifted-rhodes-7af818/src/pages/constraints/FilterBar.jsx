/**
 * FilterBar — three filter controls (status chips, priority chips,
 * type dropdown) plus a "N filters active" badge that only appears
 * when something non-default is set. The page shell owns the state.
 */

import React from "react";
import { CONSTRAINT_TYPES, PRIORITY_CONFIG, PRIORITIES, inputStyle } from "./constants";

const STATUS_OPTIONS = ["all", "open", "In Progress", "Resolved", "Closed"];
const PRIORITY_OPTIONS = ["all", ...PRIORITIES];

export default function FilterBar({
  filterStatus,
  filterPriority,
  filterType,
  setFilterStatus,
  setFilterPriority,
  setFilterType,
}) {
  const activeCount =
    (filterStatus !== "open" ? 1 : 0) +
    (filterPriority !== "all" ? 1 : 0) +
    (filterType !== "all" ? 1 : 0);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 6 }}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            style={{
              background: filterStatus === s ? "var(--accent)" : "var(--bg-surface-low)",
              color: filterStatus === s ? "var(--accent-text)" : "var(--text-secondary)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "5px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {s === "open" ? "Open" : s}
          </button>
        ))}
      </div>

      <span style={{ color: "var(--border-strong)" }}>·</span>

      <div style={{ display: "flex", gap: 6 }}>
        {PRIORITY_OPTIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFilterPriority(p)}
            style={{
              background: filterPriority === p ? (PRIORITY_CONFIG[p]?.bg || "var(--accent)") : "var(--bg-surface-low)",
              color: filterPriority === p ? (PRIORITY_CONFIG[p]?.color || "var(--accent-text)") : "var(--text-secondary)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "5px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <span style={{ color: "var(--border-strong)" }}>·</span>

      <div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ ...inputStyle, width: "auto", height: 32 }}
        >
          <option value="all">All Types</option>
          {CONSTRAINT_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {activeCount > 0 && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            color: "var(--accent)",
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            borderRadius: "var(--radius-badge)",
            padding: "3px 8px",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          {activeCount} Filters Active
        </div>
      )}
    </div>
  );
}
