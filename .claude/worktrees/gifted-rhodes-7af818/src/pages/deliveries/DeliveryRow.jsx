/**
 * DeliveryRow + ProjectGroup — the grid-based row renderer for the
 * table view, plus a collapsible project grouping wrapper used when
 * the user is looking at the portfolio (no project selected).
 *
 * Checkbox toggles selection. Button clicks stop propagation so the
 * row click handler (which opens the detail drawer) doesn't fire.
 */

import React from "react";
import { STATUS_COLORS } from "./constants";
import { StatusPill } from "./subcomponents";

const GRID = "28px 100px 150px 2fr 140px 100px 90px 90px 72px 90px 110px";

export function DeliveryRow({
  delivery,
  today,
  projectMap,
  wpMap,
  selectedIds,
  onToggleSelect,
  onAdvanceStatus,
  onEdit,
  onOpenDetail,
}) {
  const overdue = delivery.scheduled_date && new Date(delivery.scheduled_date) < today && delivery.status !== "Delivered";
  const colors = STATUS_COLORS[delivery.status] || STATUS_COLORS.Scheduled;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        padding: "10px 12px",
        borderBottom: "1px solid var(--divider)",
        alignItems: "center",
        background: overdue ? "rgba(239,68,68,0.06)" : "transparent",
        borderLeft: `3px solid ${overdue ? "var(--status-error)" : colors.border}`,
        cursor: "pointer",
      }}
      onClick={(e) => {
        if (e.target.dataset?.action === "button" || e.target.type === "checkbox") return;
        onOpenDetail(delivery);
      }}
    >
      <input
        type="checkbox"
        checked={selectedIds.has(delivery.id)}
        onChange={() => onToggleSelect(delivery.id)}
        style={{ width: 16, height: 16 }}
      />
      <div><StatusPill status={delivery.status} /></div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {projectMap[delivery.project_id] || delivery.project_name || "—"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>
          {delivery.delivery_title || wpMap[delivery.work_package_id] || delivery.description || "—"}
          {delivery.priority === "Critical" && <span style={{ color: "var(--status-error)", marginLeft: 6 }}>FLAG</span>}
          {delivery.inspection_required && <span style={{ color: "var(--status-warning)", marginLeft: 6 }}>INSPECT</span>}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
          {wpMap[delivery.work_package_id] || delivery.work_package_name || delivery.description || "—"}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {delivery.vendor}
        {delivery.carrier && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{delivery.carrier}</div>
        )}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: delivery.po_number ? "var(--accent)" : "var(--text-muted)" }}>
        {delivery.po_number || "—"}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: overdue ? "var(--status-error)" : "var(--text-secondary)", fontWeight: overdue ? 700 : 400 }}>
        {delivery.scheduled_date ? new Date(delivery.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
        {overdue && <div style={{ fontSize: 8 }}>Late</div>}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: delivery.actual_date ? "var(--status-success)" : "var(--text-muted)" }}>
        {delivery.actual_date ? new Date(delivery.actual_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
        {(delivery.weight_tons || 0) + "T"}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: delivery.required_date ? "var(--text-secondary)" : "var(--text-muted)" }}>
        {delivery.required_date ? new Date(delivery.required_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          data-action="button"
          onClick={(e) => { e.stopPropagation(); onAdvanceStatus(delivery); }}
          style={{ height: 26, padding: "0 10px", borderRadius: 6, border: "1px solid var(--divider)", background: "var(--bg-surface)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9 }}
        >
          {delivery.status === "Scheduled" ? "→ Transit" : delivery.status === "In Transit" ? "✓ Deliver" : "Edit"}
        </button>
        <button
          data-action="button"
          onClick={(e) => { e.stopPropagation(); onEdit(delivery); }}
          style={{ height: 26, width: 32, borderRadius: 6, border: "1px solid var(--divider)", background: "var(--bg-surface)", cursor: "pointer" }}
          title="Edit"
        >
          ✎
        </button>
      </div>
    </div>
  );
}

export function ProjectGroup({
  name,
  list,
  today,
  collapsed,
  onToggleCollapse,
  rowProps,
}) {
  const overdueCount = list.filter(
    (d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered"
  ).length;
  const totalTons = list.reduce((s, d) => s + (Number(d.weight_tons) || 0), 0).toFixed(1);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          background: "var(--bg-surface-low)",
          borderBottom: "1px solid var(--divider)",
          cursor: "pointer",
        }}
        onClick={() => onToggleCollapse(name)}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)" }}>{collapsed ? "▸" : "▾"}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)" }}>{name}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{list.length} deliveries</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>{totalTons}T</span>
        {overdueCount > 0 && (
          <span style={{ marginLeft: "auto", background: "var(--status-error)", color: "#fff", padding: "2px 6px", borderRadius: 3, fontSize: 9, fontFamily: "var(--font-mono)" }}>
            {overdueCount} overdue
          </span>
        )}
      </div>
      {!collapsed && list.map((d) => (
        <DeliveryRow key={d.id} delivery={d} {...rowProps} />
      ))}
    </div>
  );
}

export { GRID as DELIVERY_GRID };
