/**
 * FilterBar — the 40px row that sits under the overdue banner.
 * Contains: search input, status chip row, priority chip row, BIC
 * select, sort-field select, sort-direction toggle, overdue-first
 * toggle, CSV export button, and a "show voided" checkbox.
 *
 * All state is lifted — the page shell owns every filter and passes
 * setters down.
 */

import React from "react";
import { mono, BIC_PARTIES, PRIORITIES } from "./constants";

const chip = (active) => ({
  background: active ? "var(--accent)" : "var(--bg-surface-low)",
  color: active ? "var(--accent-text)" : "var(--text-secondary)",
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  ...mono,
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: "0.08em",
  cursor: "pointer",
});

const selectStyle = {
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "6px 8px",
  color: "var(--text-primary)",
  ...mono,
  fontSize: 9,
};

export default function FilterBar({
  search, setSearch,
  filterStatus, setFilterStatus,
  filterPriority, setFilterPriority,
  filterBIC, setFilterBIC,
  sortField, setSortField,
  sortDir, setSortDir,
  overdueFirst, setOverdueFirst,
  showVoided, setShowVoided,
  onExport,
}) {
  return (
    <div className="filter-bar-responsive" style={{ height: 40, flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)", overflowX: "auto" }}>
      <input
        placeholder="Search RFIs..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ flex: 1, maxWidth: 280, background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "7px 10px", color: "var(--text-primary)" }}
      />
      {["all", "Open", "Under Review", "Answered", "Closed"].map((s) => (
        <button key={s} onClick={() => setFilterStatus(s)} style={chip(filterStatus === s)}>
          {s === "all" ? "All" : s}
        </button>
      ))}
      {["all", ...PRIORITIES].map((p) => (
        <button key={p} onClick={() => setFilterPriority(p)} style={chip(filterPriority === p)}>
          {p === "all" ? "All Priority" : p}
        </button>
      ))}
      <select value={filterBIC} onChange={(e) => setFilterBIC(e.target.value)} style={selectStyle}>
        <option value="all">All BIC</option>
        {BIC_PARTIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={sortField} onChange={(e) => setSortField(e.target.value)} style={selectStyle}>
        <option value="date_required">Due Date</option>
        <option value="rfi_number">RFI #</option>
        <option value="project_name">Project</option>
        <option value="priority">Priority</option>
        <option value="days">Days Open</option>
      </select>
      <button
        onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
        style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "6px 8px", ...mono, fontSize: 9, color: "var(--text-primary)", cursor: "pointer" }}
      >
        {sortDir === "asc" ? "↑" : "↓"}
      </button>
      <button
        onClick={() => setOverdueFirst((v) => !v)}
        style={{
          background: overdueFirst ? "var(--accent)" : "var(--bg-surface-low)",
          color: overdueFirst ? "var(--accent-text)" : "var(--text-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          padding: "6px 10px",
          ...mono,
          fontSize: 8,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Overdue First
      </button>
      <button
        onClick={onExport}
        style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 6, padding: "6px 10px", ...mono, fontSize: 9, color: "var(--text-primary)", cursor: "pointer" }}
      >
        Export
      </button>
      <label style={{ display: "flex", alignItems: "center", gap: 4, ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", cursor: "pointer", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
        <input type="checkbox" checked={showVoided} onChange={() => setShowVoided((v) => !v)} style={{ cursor: "pointer", accentColor: "var(--accent)" }} />
        Show Voided
      </label>
    </div>
  );
}
