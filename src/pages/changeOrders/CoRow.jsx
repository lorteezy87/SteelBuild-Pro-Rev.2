/**
 * CoRow — dense list-view row for Change Orders.
 *
 * Grid columns:
 *   [checkbox][CO#][title + reason code][status][submitted][approved]
 *   [amount (signed, red on deduct)][schedule impact days][approved by]
 *
 * Row click opens detail/edit; checkboxes stop propagation.
 *
 * Negative amounts (deducts/credits) render with a minus sign and
 * red-tinted amount — per D16 fix from the baseline audit, COs
 * support negative `co_amount`.
 */

import React from "react";
import { StatusPill, Icon } from "@/components/design-system";

export const CO_ROW_GRID = "36px 90px 1fr 110px 90px 90px 110px 80px 110px 50px";

export default function CoRow({ co, idx, selected, onToggle, onOpen }) {
  const amount = Number(co.co_amount) || 0;
  const isDeduct = amount < 0;
  const amountColor =
    isDeduct
      ? "var(--status-error)"
      : amount > 0
      ? "var(--status-success)"
      : "var(--text-muted)";

  return (
    <div
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: CO_ROW_GRID,
        gap: 8,
        padding: "0 12px",
        alignItems: "center",
        borderBottom: "1px solid var(--divider)",
        background: selected
          ? "var(--accent-muted)"
          : idx % 2 === 1
          ? "rgba(255,255,255,0.015)"
          : "transparent",
        height: "var(--density-row-height, 40px)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = idx % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent";
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={!!selected} onChange={onToggle} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--accent)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {co.co_number || "—"}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", minWidth: 0 }}>
        <div
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 500,
          }}
        >
          {co.title || "—"}
        </div>
        {co.reason_code && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              marginTop: 2,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {co.reason_code}
          </div>
        )}
      </div>
      <div>
        <StatusPill label={co.status || "Draft"} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {co.submitted_date || "—"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: co.approved_date ? "var(--status-success)" : "var(--text-muted)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {co.approved_date || "—"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 700,
          color: amountColor,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
        }}
      >
        {amount === 0
          ? "—"
          : `${isDeduct ? "-" : "+"}$${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: (Number(co.schedule_impact_days) || 0) > 0 ? "var(--status-warning)" : "var(--text-muted)",
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
        }}
      >
        {Number(co.schedule_impact_days) || 0}d
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {co.approved_by || "—"}
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
        <Icon name="more" size={12} color="var(--text-muted)" />
      </div>
    </div>
  );
}
