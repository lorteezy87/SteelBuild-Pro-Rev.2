/**
 * HeaderBar — title + "view toggle + buttons" row at the top of the
 * Work Packages page. All button handlers are passed in; this file
 * owns no state.
 *
 * `projectName` appears in the subtitle when a project is active; when
 * it's empty we fall back to "All Projects".
 */

import React from "react";
import { VIEW_OPTIONS } from "./constants";

export default function HeaderBar({
  projectId, projectName, workPackageCount, totalTons,
  view, onViewChange,
  compact, onToggleCompact,
  onExportCSV, onBulkAdd, onCreate,
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-primary)",
          }}
        >
          WORK PACKAGES
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {projectId ? (projectName || "Project") : "All Projects"} · {workPackageCount} packages · {totalTons.toFixed(1)}T
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.id}
              onClick={() => onViewChange(v.id)}
              style={{
                padding: "7px 12px",
                borderRadius: "var(--radius-btn)",
                border: "none",
                background: view === v.id ? "var(--accent)" : "var(--bg-surface-low)",
                color:      view === v.id ? "var(--accent-text)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        <button
          onClick={onToggleCompact}
          title={compact ? "Normal view" : "Compact view — more rows visible"}
          style={{
            padding: "7px 12px", borderRadius: "var(--radius-btn)",
            border: "1px solid var(--border-default)",
            background: compact ? "var(--bg-surface-high)" : "var(--bg-surface-low)",
            color: compact ? "var(--accent)" : "var(--text-secondary)",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          COMPACT
        </button>

        <button
          onClick={onExportCSV}
          title="Export filtered work packages as CSV"
          style={{
            padding: "7px 12px", borderRadius: "var(--radius-btn)",
            border: "1px solid var(--border-default)",
            background: "var(--bg-surface-low)", color: "var(--text-secondary)",
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          CSV
        </button>

        <button
          onClick={onBulkAdd}
          disabled={!projectId}
          title={projectId
            ? "Paste tab- or comma-separated rows to add several WPs at once"
            : "Select a project to enable bulk add"}
          style={{
            padding: "7px 12px",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--accent-border)",
            background: projectId ? "var(--bg-surface-low)" : "var(--bg-surface)",
            color:      projectId ? "var(--accent)"          : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: projectId ? "pointer" : "not-allowed",
            textTransform: "uppercase",
          }}
        >
          BULK ADD
        </button>

        <button
          onClick={onCreate}
          style={{
            background: "var(--accent)",
            color: "var(--accent-text)",
            border: "none",
            borderRadius: "var(--radius-btn)",
            padding: "8px 16px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            cursor: "pointer",
            letterSpacing: "0.06em",
          }}
        >
          + NEW WP
        </button>
      </div>
    </div>
  );
}
