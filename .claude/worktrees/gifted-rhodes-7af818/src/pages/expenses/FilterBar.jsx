/**
 * FilterBar — search + cost-code + type + status + work-package +
 * date-range selects, plus Import CSV / Export CSV buttons and a
 * "Clear KPI filter" indicator.
 *
 * Holds no state; every field is a handler prop.
 */

import React from "react";
import { Upload, Download, X } from "lucide-react";
import { COST_CODES_GROUPED } from "@/components/shared/costCodes";
import { EXPENSE_TYPES, PAYMENT_STATUSES } from "./constants";

const selectStyle = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "6px 10px",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  outline: "none",
  cursor: "pointer",
};

export default function FilterBar({
  search, onSearchChange,
  costCodeFilter, onCostCodeFilter,
  typeFilter, onTypeFilter,
  statusFilter, onStatusFilter,
  wpFilter, onWPFilter, workPackages,
  dateRangeFilter, onDateRangeFilter,
  activeKPI, onClearKPI,
  onImport, onExport,
}) {
  return (
    <div className="filter-bar-responsive" style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
      <input
        placeholder="Search description, #, vendor..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ ...selectStyle, flex: 1, minWidth: 180 }}
      />
      <select value={costCodeFilter} onChange={(e) => onCostCodeFilter(e.target.value)} style={selectStyle}>
        <option value="all">All Cost Codes</option>
        {COST_CODES_GROUPED.map((g) => (
          <optgroup key={g.category} label={g.category}>
            {g.codes.map((cc) => (
              <option key={cc.code} value={cc.code}>{cc.code} — {cc.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <select value={typeFilter} onChange={(e) => onTypeFilter(e.target.value)} style={selectStyle}>
        <option value="all">All Types</option>
        {EXPENSE_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <select
        value={statusFilter === "_outstanding" ? "_outstanding" : statusFilter}
        onChange={(e) => onStatusFilter(e.target.value)}
        style={selectStyle}
      >
        <option value="all">All Statuses</option>
        {PAYMENT_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
        <option value="_outstanding">Outstanding (Unpaid+Pending)</option>
      </select>
      <select value={wpFilter} onChange={(e) => onWPFilter(e.target.value)} style={selectStyle}>
        <option value="all">All Work Packages</option>
        {workPackages.map((w) => (
          <option key={w.id} value={w.id}>{w.wp_number} — {w.name}</option>
        ))}
      </select>
      <select value={dateRangeFilter} onChange={(e) => onDateRangeFilter(e.target.value)} style={selectStyle}>
        <option value="all">All Time</option>
        <option value="this_month">This Month</option>
        <option value="last_30">Last 30 Days</option>
        <option value="this_quarter">This Quarter</option>
      </select>
      <button
        onClick={onImport}
        style={{ ...selectStyle, display: "flex", alignItems: "center", gap: 6, background: "var(--bg-surface-low)", border: "1px solid var(--accent)", color: "var(--accent)", padding: "6px 14px" }}
      >
        <Upload size={12} /> Import CSV
      </button>
      <button
        onClick={onExport}
        style={{ ...selectStyle, display: "flex", alignItems: "center", gap: 6, background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", padding: "6px 14px" }}
      >
        <Download size={12} /> Export CSV
      </button>
      {activeKPI && (
        <button
          onClick={onClearKPI}
          style={{
            ...selectStyle,
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(173,198,255,0.1)",
            border: "1px solid rgba(173,198,255,0.3)",
            color: "var(--accent-light)",
            padding: "6px 10px",
          }}
        >
          <X size={10} /> Clear KPI filter
        </button>
      )}
    </div>
  );
}
