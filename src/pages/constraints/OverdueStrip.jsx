/**
 * OverdueStrip — red banner with horizontally-scrolling chips, one per
 * overdue constraint. Clicking a chip tells the parent which row to
 * expand (id bubbled through `onClickItem`).
 */

import React from "react";
import { formatDateShort as formatShortDate } from "@/components/shared/formatters";
import { TYPE_ICONS } from "./constants";

export default function OverdueStrip({ overdue, onClickItem }) {
  return (
    <div
      style={{
        background: "var(--danger-muted)",
        border: "1px solid var(--danger-border)",
        borderLeft: "4px solid var(--status-error)",
        borderRadius: "var(--radius-card)",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--status-error)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        ⚠ {overdue.length} Constraint{overdue.length === 1 ? "" : "s"} Past Due · Immediate Resolution Required
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {overdue.map((c) => (
          <div
            key={c.id}
            onClick={() => onClickItem(c.id)}
            style={{
              background: "rgba(255,180,171,0.15)",
              border: "1px solid var(--danger-border)",
              borderRadius: "var(--radius-badge)",
              padding: "3px 10px",
              whiteSpace: "nowrap",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--status-error)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            title={c.title}
          >
            <span>{TYPE_ICONS[c.constraint_type] || "•"}</span>
            <span>{(c.title || "").slice(0, 30)}</span>
            <span>· Due {formatShortDate(c.due_date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
