/**
 * KPICard — a clickable tile for the KPI grid at the top of the
 * dashboard. Colored top border, optional red "badge" in the top-
 * right (e.g. "3 overdue"), large value, subtitle detail, and a
 * tiny decorative trend line at the bottom.
 *
 * `active` draws an outline matching `borderColor` — used to show
 * which KPI is currently driving the row filter below.
 */

import React from "react";
import { mono, body, CARD, LABEL } from "./constants";

export default function KPICard({ label, value, detail, borderColor, badge, onClick, active }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...CARD,
        borderTop: `2px solid ${borderColor}`,
        padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
        outline: active ? `2px solid ${borderColor}` : "none",
        outlineOffset: -1,
        transition: "outline 0.15s, box-shadow 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={LABEL}>{label}</div>
        {badge && (
          <span
            style={{
              ...mono,
              fontSize: 9,
              fontWeight: 700,
              color: "#fff",
              background: "var(--status-error)",
              borderRadius: "var(--radius-badge)",
              padding: "2px 6px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: borderColor, lineHeight: 1.2, marginBottom: 4 }}>
        {value}
      </div>
      {detail && (
        <div style={{ ...body, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {detail}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <svg width={48} height={14} viewBox="0 0 48 14">
          <polyline
            points="0,12 8,8 16,10 24,5 32,7 40,3 48,6"
            fill="none"
            stroke={borderColor}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.6}
          />
        </svg>
      </div>
    </div>
  );
}
