import React from "react";

/**
 * Zone A — five horizontal summary tiles.
 * Clicking a tile activates its urgency filter in the parent.
 */

const TILES = [
  { key: "overdue",     label: "OVERDUE",               color: "var(--status-error)" },
  { key: "dueThisWeek", label: "DUE THIS WEEK",         color: "var(--status-warning)" },
  { key: "blocking",    label: "BLOCKING FAB / ERECT",  color: "var(--accent)" },
  { key: "awaiting",    label: "AWAITING OTHERS",        color: "var(--text-muted)" },
  { key: "totalOpen",   label: "TOTAL OPEN",             color: "var(--status-success)" },
];

export default function UrgencyStrip({ summary = {}, activeFilter, onFilterClick }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {TILES.map((tile) => {
        const count = summary[tile.key] ?? 0;
        const isActive = activeFilter === tile.key;

        return (
          <button
            key={tile.key}
            onClick={() => onFilterClick(isActive ? null : tile.key)}
            style={{
              flex: "1 1 140px",
              minWidth: 120,
              background: isActive ? `${tile.color}14` : "var(--bg-surface)",
              border: isActive ? `1.5px solid ${tile.color}` : "1px solid var(--border-default)",
              borderRadius: 4,
              padding: "14px 12px 10px",
              cursor: "pointer",
              textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 26,
                fontWeight: 700,
                color: count > 0 ? tile.color : "var(--text-muted)",
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              {count}
            </div>
            <div
              style={{
                fontFamily: "'Space Grotesk', var(--font-body)",
                fontSize: 9,
                fontWeight: 600,
                color: "var(--text-muted)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {tile.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}
