/**
 * AgingCard — RFI-age bucket card on the Project Dashboard.
 *
 * Stacked bar at the top visualizes bucket distribution. Four tile
 * cells below show the count in each 0-7 / 8-14 / 15-30 / 30+ day
 * band. Elevated from sidebar filter per design brief.
 */

import React from "react";

export default function AgingCard({ buckets, totalOpen, oldestDays, onSeeAll }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--accent)",
              letterSpacing: "0.14em",
            }}
          >
            RFI AGING ANALYSIS
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            {totalOpen} open · oldest {oldestDays}d
          </div>
        </div>
        {onSeeAll && (
          <div
            onClick={onSeeAll}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--accent)",
              cursor: "pointer",
              letterSpacing: "0.10em",
            }}
          >
            OPEN RFIS →
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          height: 8,
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 14,
          border: "1px solid var(--border-default)",
        }}
      >
        {buckets.map((b, i) => (
          <div
            key={i}
            style={{ width: `${b.pct}%`, background: b.color }}
            title={`${b.label}: ${b.count}`}
          />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {buckets.map((b, i) => (
          <div
            key={i}
            style={{
              padding: "10px",
              borderRadius: 6,
              background: "var(--bg-surface-low)",
              border: `1px solid color-mix(in srgb, ${b.color} 25%, transparent)`,
              borderTop: `2px solid ${b.color}`,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                fontWeight: 700,
                color: b.color,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {b.count}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
                marginTop: 4,
              }}
            >
              {b.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
