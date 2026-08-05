/**
 * Presentational KPI / filter / empty chrome for Safety page.
 */
// @ts-nocheck
import React from "react";
import { KpiTile, Button } from "@/components/design-system";
import {
  SAFETY_INCIDENT_TYPES,
  SAFETY_SEVERITIES,
  SAFETY_STATUS_FILTERS,
} from "./safetyPageHelpers";

const chipStyle = (active) => ({
  background: active ? "var(--accent)" : "var(--bg-surface-low)",
  color: active ? "white" : "var(--text-secondary)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  padding: "5px 12px",
  fontFamily: "var(--font-body)",
  fontSize: "8px",
  fontWeight: 700,
  cursor: "pointer",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
});

export function SafetyKpiStrip({
  stats,
  filterSeverity,
  filterType,
  filterStatus,
  onToggleSeverity,
  onToggleType,
  onToggleStatus,
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total" value={stats.total} color="var(--accent)" />
      <KpiTile compact label="Critical" value={stats.critical} color="var(--status-error)"
        active={filterSeverity === "Critical"} onClick={() => onToggleSeverity("Critical")} />
      <KpiTile compact label="High" value={stats.high} color="var(--status-warning)"
        active={filterSeverity === "High"} onClick={() => onToggleSeverity("High")} />
      <KpiTile compact label="Injuries" value={stats.injuries} color="var(--status-error)"
        active={filterType === "Injury"} onClick={() => onToggleType("Injury")} />
      <KpiTile compact label="Near Misses" value={stats.nearMisses} color="var(--status-warning)"
        active={filterType === "Near Miss"} onClick={() => onToggleType("Near Miss")} />
      <KpiTile compact label="Hazards" value={stats.hazards} color="var(--status-info)"
        active={filterType === "Hazard"} onClick={() => onToggleType("Hazard")} />
      <KpiTile compact label="Open" value={stats.open} color="var(--phase-fabrication)"
        active={filterStatus === "Open"} onClick={() => onToggleStatus("Open")} />
    </div>
  );
}

export function SafetyFilterBar({
  filterType,
  filterSeverity,
  filterStatus,
  onFilterType,
  onFilterSeverity,
  onFilterStatus,
}) {
  return (
    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Type:</span>
        {["all", ...SAFETY_INCIDENT_TYPES.slice(0, 4)].map((type) => (
          <button key={type} onClick={() => onFilterType(type)} style={chipStyle(filterType === type)}>
            {type === "all" ? "All" : type.slice(0, 5)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Severity:</span>
        {["all", ...SAFETY_SEVERITIES].map((sev) => (
          <button key={sev} onClick={() => onFilterSeverity(sev)} style={chipStyle(filterSeverity === sev)}>
            {sev === "all" ? "All" : sev}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: "var(--text-muted)", alignSelf: "center", letterSpacing: "0.08em", textTransform: "uppercase" }}>Status:</span>
        {SAFETY_STATUS_FILTERS.map((status) => (
          <button key={status} onClick={() => onFilterStatus(status)} style={chipStyle(filterStatus === status)}>
            {status === "all" ? "All" : status.slice(0, 6)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SafetyLoadError({ errorMessage, onRetry }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: 16,
    }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
        Couldn’t load incidents
      </p>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
        {errorMessage}
      </p>
      <Button variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}

export function SafetyEmptyState({ onReport }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: 16,
    }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
        No safety incidents yet
      </p>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
        Report injuries, near-misses, and hazards so the project has a clear safety trail.
      </p>
      <Button variant="primary" onClick={onReport}>
        + Report Incident
      </Button>
    </div>
  );
}

export function SafetyFilteredEmpty({ onClearFilters }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "36px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: 12,
    }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
        No incidents match the current filters
      </p>
      <Button variant="outline" onClick={onClearFilters}>
        Clear Filters
      </Button>
    </div>
  );
}
