/**
 * Presentational KPI / filter chrome for Photos page.
 */
// @ts-nocheck
import React from "react";
import { KpiTile, Button } from "@/components/design-system";
import { PHOTO_CATEGORIES, PHOTO_DATE_RANGES } from "./photosPageHelpers";
import { pageFilterChipStyle } from "@/components/shared/pageFilterChipHelpers";

const chipStyle = pageFilterChipStyle;

export function PhotosKpiStrip({ stats, filterCategory, onToggleCategory }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total" value={stats.total} color="var(--accent)"
        active={filterCategory === "all"} onClick={() => onToggleCategory("all")} />
      <KpiTile compact label="Progress" value={stats.progress} color="var(--status-info)"
        active={filterCategory === "Progress"} onClick={() => onToggleCategory("Progress")} />
      <KpiTile compact label="Safety" value={stats.safety} color="var(--status-error)"
        active={filterCategory === "Safety"} onClick={() => onToggleCategory("Safety")} />
      <KpiTile compact label="Issues" value={stats.issue} color="var(--status-warning)"
        active={filterCategory === "Issue"} onClick={() => onToggleCategory("Issue")} />
      <KpiTile compact label="Delivery" value={stats.delivery} color="var(--status-success)"
        active={filterCategory === "Delivery"} onClick={() => onToggleCategory("Delivery")} />
      <KpiTile compact label="Punchlist" value={stats.punchlist} color="var(--phase-detailing)"
        active={filterCategory === "Punchlist"} onClick={() => onToggleCategory("Punchlist")} />
    </div>
  );
}

export function PhotosFilterBar({
  filterCategory,
  filterDate,
  onFilterCategory,
  onFilterDate,
}) {
  return (
    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--text-muted)",
            alignSelf: "center",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Category:
        </span>
        {["all", ...PHOTO_CATEGORIES].map((cat) => (
          <button key={cat} onClick={() => onFilterCategory(cat)} style={chipStyle(filterCategory === cat)}>
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--text-muted)",
            alignSelf: "center",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          When:
        </span>
        {PHOTO_DATE_RANGES.map((range) => (
          <button
            key={range.value}
            onClick={() => onFilterDate(range.value)}
            style={chipStyle(filterDate === range.value)}
          >
            {range.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PhotosLoadError({ errorMessage, onRetry }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "48px 24px", background: "var(--bg-surface)", borderRadius: "var(--radius-card)", gap: 16,
    }}>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
        Couldn’t load photos
      </p>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 320 }}>
        {errorMessage}
      </p>
      <Button variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}
