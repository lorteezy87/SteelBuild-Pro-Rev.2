/**
 * Presentational KPI / filter / empty chrome for Inspections page.
 */
// @ts-nocheck
import React from "react";
import { KpiTile, Button } from "@/components/design-system";
import {
  INSPECTION_TYPES,
  INSPECTION_TYPE_ABBREV,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_COLORS,
} from "./inspectionsPageHelpers";

export function InspectionsKpiStrip({ stats, filterStatus, onStatusClick }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total" value={stats.total} color="var(--accent)"
        active={filterStatus === "all"} onClick={() => onStatusClick("all")} />
      <KpiTile compact label="Scheduled" value={stats.scheduled} color={INSPECTION_STATUS_COLORS.Scheduled}
        active={filterStatus === "Scheduled"} onClick={() => onStatusClick("Scheduled")} />
      <KpiTile compact label="In Progress" value={stats.inProgress} color={INSPECTION_STATUS_COLORS["In Progress"]}
        active={filterStatus === "In Progress"} onClick={() => onStatusClick("In Progress")} />
      <KpiTile compact label="Completed" value={stats.completed} color={INSPECTION_STATUS_COLORS.Completed}
        active={filterStatus === "Completed"} onClick={() => onStatusClick("Completed")} />
      <KpiTile compact label="Approved" value={stats.approved} color="var(--status-success)" />
      <KpiTile compact label="Rejected" value={stats.rejected} color="var(--status-error)" />
    </div>
  );
}

export function InspectionsFilterBar({
  filterType,
  filterStatus,
  onFilterType,
  onFilterStatus,
  onClearFilters,
}) {
  const hasActive = filterType !== "all" || filterStatus !== "all";
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          Type:
        </span>
        {["all", ...INSPECTION_TYPES].map((type) => (
          <button
            key={type}
            onClick={() => onFilterType(type)}
            aria-pressed={filterType === type}
            style={{
              background: filterType === type ? "var(--accent)" : "var(--bg-surface)",
              color: filterType === type ? "#07090E" : "var(--text-secondary)",
              border: filterType === type ? "1px solid var(--accent)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-btn)",
              padding: "4px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              transition: "all 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {type === "all" ? "All" : (INSPECTION_TYPE_ABBREV[type] || type)}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: "var(--divider)" }} />

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          Status:
        </span>
        {["all", ...INSPECTION_STATUSES].map((status) => {
          const sColor = INSPECTION_STATUS_COLORS[status];
          return (
            <button
              key={status}
              onClick={() => onFilterStatus(status)}
              aria-pressed={filterStatus === status}
              style={{
                background: filterStatus === status
                  ? (sColor ? `${sColor}20` : "var(--accent)")
                  : "var(--bg-surface)",
                color: filterStatus === status
                  ? (sColor || "#07090E")
                  : "var(--text-secondary)",
                border: filterStatus === status
                  ? `1px solid ${sColor || "var(--accent)"}`
                  : "1px solid var(--border-default)",
                borderRadius: "var(--radius-btn)",
                padding: "4px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
            >
              {status === "all" ? "All" : status}
            </button>
          );
        })}

        {hasActive && (
          <button
            onClick={onClearFilters}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px dashed var(--border-default)",
              borderRadius: "var(--radius-btn)",
              padding: "4px 10px",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}

export function InspectionsLoadError({ errorMessage, onRetry }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: 16,
    }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
        Couldn’t load inspections
      </p>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
        {errorMessage}
      </p>
      <Button variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}

export function InspectionsEmptyState({
  totalCount,
  onCreate,
  onClearFilters,
}) {
  const empty = totalCount === 0;
  return (
    <div className="sbd-card" style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "60px 20px", gap: 16,
      borderStyle: "dashed",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "var(--accent-muted, rgba(200,155,32,0.08))",
        border: "1px solid var(--accent-border, rgba(200,155,32,0.20))",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24,
      }}>
        {empty ? "🔍" : "🔎"}
      </div>
      <div style={{
        fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600,
        color: "var(--text-primary)", textAlign: "center",
      }}>
        {empty ? "No Inspections Yet" : "No Inspections Match Your Filters"}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
        textAlign: "center", maxWidth: 340, lineHeight: 1.6,
      }}>
        {empty
          ? "Create your first inspection to start tracking quality control for this project."
          : "Try adjusting your type or status filters, or clear all filters to see everything."}
      </div>
      {empty ? (
        <Button variant="primary" onClick={onCreate} style={{ marginTop: 4 }}>
          + Create First Inspection
        </Button>
      ) : (
        <Button variant="outline" onClick={onClearFilters} style={{ marginTop: 4 }}>
          Clear All Filters
        </Button>
      )}
    </div>
  );
}
