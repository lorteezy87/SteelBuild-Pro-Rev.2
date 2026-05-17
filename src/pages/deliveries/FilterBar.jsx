/**
 * FilterBar — search, optional project selector (portfolio view only),
 * status pills, sort selector, and overdue-first toggle. All state
 * owned by the parent.
 */

import React from "react";

const STATUS_OPTIONS = ["ALL", "Scheduled", "In Transit", "Delivered", "Partial", "Rejected"];

export default function FilterBar({
  search, onSearchChange,
  projectId, projects, onProjectChange,
  filterStatus, onFilterStatusChange,
  sortBy, onSortByChange,
  overdueFirst, onToggleOverdueFirst,
}) {
  return (
    <div
      className="filter-bar-responsive"
      style={{
        minHeight: 48,
        flexShrink: 0,
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--divider)",
        padding: "6px 20px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search vendor, PO, project, tracking..."
        style={{
          width: 240,
          maxWidth: 260,
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: "6px 10px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          fontSize: 12,
        }}
      />

      {!projectId && (
        <select
          value={projectId || ""}
          onChange={(e) => onProjectChange(e.target.value)}
          style={{
            height: 32,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "0 10px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
          }}
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      {STATUS_OPTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onFilterStatusChange(s)}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid var(--divider)",
            background: filterStatus === s ? "var(--accent)"      : "var(--bg-surface)",
            color:      filterStatus === s ? "var(--accent-text)" : "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          {s}
        </button>
      ))}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value)}
          style={{
            height: 32,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "0 10px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
          }}
        >
          <option value="DUE">Due Date</option>
          <option value="PROJECT">Project</option>
          <option value="VENDOR">Vendor</option>
          <option value="TONNAGE">Tonnage</option>
        </select>
        <button
          onClick={onToggleOverdueFirst}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--divider)",
            background: overdueFirst ? "var(--accent)"      : "var(--bg-surface)",
            color:      overdueFirst ? "var(--accent-text)" : "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Overdue First
        </button>
      </div>
    </div>
  );
}
