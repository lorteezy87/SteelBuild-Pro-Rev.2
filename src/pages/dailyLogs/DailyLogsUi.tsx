/**
 * Presentational KPI / filter / error chrome for Daily Logs page.
 */
// @ts-nocheck
import React from "react";
import { KpiTile, Button } from "@/components/design-system";
import { DAILY_LOG_DATE_PRESETS } from "./dailyLogsPageHelpers";

export function dailyLogPresetBtnStyle(active) {
  return {
    background: active ? "var(--accent)" : "var(--bg-surface)",
    color: active ? "white" : "var(--text-secondary)",
    border: "none",
    borderRadius: "var(--radius-btn)",
    padding: "6px 12px",
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    fontWeight: 700,
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };
}

export function DailyLogsKpiStrip({ metrics }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total Man-Hours" value={metrics.totalManHours.toLocaleString()} color="var(--accent)" />
      <KpiTile compact label="Avg Crew Size" value={metrics.avgCrewSize.toFixed(1)} color="var(--phase-fabrication)" />
      <KpiTile compact label="Safety Incidents" value={metrics.safetyIncidents} color="var(--status-error)" />
      <KpiTile compact label="Delay Hours" value={metrics.delayHours} color="var(--status-warning)" />
    </div>
  );
}

export function DailyLogsFilterBar({
  searchTerm,
  dateRange,
  onSearchTerm,
  onDateRange,
}) {
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="text"
        placeholder="Search logs..."
        value={searchTerm}
        onChange={(e) => onSearchTerm(e.target.value)}
        style={{
          flex: "1 1 200px",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-btn)",
          padding: "8px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: "4px" }}>
        {DAILY_LOG_DATE_PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onDateRange(p.key)}
            style={dailyLogPresetBtnStyle(dateRange === p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DailyLogsLoadError({ errorMessage, onRetry }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: 16,
    }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
        Couldn’t load daily logs
      </p>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
        {errorMessage}
      </p>
      <Button variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}
