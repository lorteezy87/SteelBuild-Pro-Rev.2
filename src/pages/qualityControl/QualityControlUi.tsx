/**
 * Presentational KPI / filter chrome for Quality Control page.
 */
// @ts-nocheck
import React from "react";
import { KpiTile } from "@/components/design-system";
import { QC_TEST_TYPES, QC_RESULT_FILTERS } from "./qualityControlPageHelpers";
import { pageFilterChipStyle } from "@/components/shared/pageFilterChipHelpers";

const chipStyle = pageFilterChipStyle;

export function QcKpiStrip({
  stats,
  passRate,
  activeCard,
  hasActiveFilters,
  onClear,
  onPassed,
  onFailed,
  onPending,
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total Tests" value={stats.total} color="var(--accent)"
        active={activeCard === null && !hasActiveFilters} onClick={onClear} />
      <KpiTile compact label="Pass Rate" value={`${passRate}%`} color="var(--status-success)" />
      <KpiTile compact label="Passed" value={stats.passed} color="var(--status-success)"
        active={activeCard === "passed"} onClick={onPassed} />
      <KpiTile compact label="Failed" value={stats.failed} color="var(--status-error)"
        active={activeCard === "failed"} onClick={onFailed} />
      <KpiTile compact label="Pending" value={stats.pending} color="var(--status-warning)"
        active={activeCard === "pending"} onClick={onPending} />
    </div>
  );
}

export function QcSearchBar({ searchQuery, onSearchQuery }) {
  return (
    <div style={{ position: "relative" }}>
      <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchQuery(e.target.value)}
        placeholder="Search by material, location, heat number, spec..."
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 12px 8px 32px",
          fontFamily: "var(--font-body)",
          fontSize: "11px",
          color: "var(--text-primary)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-btn)",
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
      />
    </div>
  );
}

export function QcFilterBar({
  filterType,
  filterResult,
  filterStatus,
  onFilterType,
  onFilterResult,
}) {
  return (
    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type:</span>
        {["all", ...QC_TEST_TYPES].map((type) => (
          <button key={type} onClick={() => onFilterType(type)} style={chipStyle(filterType === type)}>
            {type === "all" ? "All" : type.split(" ")[0].slice(0, 5)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Result:</span>
        {QC_RESULT_FILTERS.map((result) => (
          <button
            key={result}
            onClick={() => onFilterResult(result)}
            style={chipStyle(filterResult === result && filterStatus === null)}
          >
            {result === "all" ? "All" : result.slice(0, 5)}
          </button>
        ))}
      </div>
    </div>
  );
}
