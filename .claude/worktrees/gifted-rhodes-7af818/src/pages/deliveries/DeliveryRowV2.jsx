/**
 * DeliveryRowV2 — dense list-view row for Deliveries, built on the
 * Claude Design system.
 *
 * Grid columns:
 *   [checkbox][DEL#][WP][description + yard/carrier subtitle]
 *   [scheduled date][tons][pieces][truck][status chip][more]
 *
 * Row click opens detail drawer; checkbox/more stop propagation.
 */

import React from "react";
import { StatusPill, Icon } from "@/components/design-system";

export const DELIVERY_GRID = "36px 90px 80px 1fr 100px 80px 60px 110px 110px 50px";

export default function DeliveryRowV2({ delivery, idx, selected, wpMap, onToggle, onOpen }) {
  const overdue =
    delivery.scheduled_date &&
    new Date(delivery.scheduled_date) < new Date() &&
    delivery.status !== "Delivered";

  const signedAt = delivery.actual_date;

  return (
    <div
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: DELIVERY_GRID,
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
          color: overdue ? "var(--danger)" : "var(--accent)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {delivery.delivery_number || "—"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-secondary)",
        }}
      >
        {wpMap?.[delivery.work_package_id] || "—"}
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
          {delivery.description || delivery.delivery_title || "—"}
        </div>
        {(delivery.receiving_location || delivery.carrier || signedAt) && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              marginTop: 2,
              letterSpacing: "0.06em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {delivery.receiving_location ? `${delivery.receiving_location} · ` : ""}
            {delivery.carrier || ""}
            {delivery.status === "Delivered" && signedAt ? ` · signed ${signedAt}` : ""}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: overdue ? "var(--danger)" : "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: overdue ? 700 : 400,
        }}
      >
        {delivery.scheduled_date || "—"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {Number(delivery.weight_tons || 0).toFixed(1)}T
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-secondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {delivery.pieces || "—"}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--text-muted)",
          letterSpacing: "0.06em",
        }}
      >
        {delivery.tracking_number || delivery.truck_number || "—"}
      </div>
      <div>
        <StatusPill label={delivery.status || "Scheduled"} />
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
        <Icon name="more" size={12} color="var(--text-muted)" />
      </div>
    </div>
  );
}
