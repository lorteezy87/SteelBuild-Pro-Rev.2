import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { daysOverdue, isOverdue } from "../shared/formatters";

const SEV_CONFIG = {
  critical: { color: "var(--status-error)",   bg: "var(--danger-muted)",  border: "var(--danger-border)",  label: "CRITICAL" },
  high:     { color: "var(--status-error)",   bg: "var(--danger-muted)",  border: "var(--danger-border)",  label: "HIGH" },
  warning:  { color: "var(--status-warning)", bg: "var(--warning-muted)", border: "var(--warning-border)", label: "WATCH" },
};

export default function CriticalActionsCard({ rfis, cos, wps, deliveries, drawings, actionItems }) {
  const navigate = useNavigate();
  const today = new Date(); today.setHours(0,0,0,0);

  const items = [];

  // Overdue RFIs
  rfis.filter(r => isOverdue(r.due_date, r.status, ["Answered","Closed"])).forEach(r => {
    items.push({
      type: "RFI", id: r.rfi_number,
      title: r.title,
      detail: `${daysOverdue(r.due_date)}d overdue`,
      severity: r.priority === "Critical" ? "critical" : "high",
      nav: "RFIs",
    });
  });

  // On-hold WPs
  wps.filter(w => w.status === "On Hold").forEach(w => {
    items.push({
      type: "WP", id: w.wp_number,
      title: w.name,
      detail: `On Hold · ${w.phase}`,
      severity: "high",
      nav: "WorkPackages",
    });
  });

  // Late deliveries
  deliveries.filter(d => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered").forEach(d => {
    items.push({
      type: "DELIVERY", id: d.delivery_id,
      title: d.description || d.vendor || "Delivery",
      detail: `Late · ${d.vendor || ""}`,
      severity: "high",
      nav: "Deliveries",
    });
  });

  // Pending COs
  cos.filter(c => ["Submitted","Under Review"].includes(c.status)).forEach(c => {
    items.push({
      type: "CO", id: c.co_number,
      title: c.title,
      detail: `Pending approval`,
      severity: "warning",
      nav: "ChangeOrders",
    });
  });

  // Drawings stuck at OFA/BFA (waiting approval) for too long
  drawings.filter(d => ["OFA","BFA"].includes(d.stage) && d.submitted_date && daysOverdue(d.due_date || d.submitted_date) > 14).forEach(d => {
    items.push({
      type: "DWG", id: d.sheet_number,
      title: d.title,
      detail: `Approval hold · ${d.stage}`,
      severity: "warning",
      nav: "Drawings",
    });
  });

  // Open action items overdue
  actionItems.filter(a => a.status !== "Complete" && a.status !== "Cancelled" && a.due_date && new Date(a.due_date) < today).forEach(a => {
    items.push({
      type: "ACTION", id: "—",
      title: a.title,
      detail: `Overdue · ${a.priority}`,
      severity: a.priority === "Critical" ? "critical" : "warning",
      nav: "ActionItems",
    });
  });

  // Sort
  const ORDER = { critical: 0, high: 1, warning: 2 };
  items.sort((a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3));

  const shown = items.slice(0, 10);

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--status-error)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Critical Actions</span>
          {items.length > 0 && (
            <span style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 4, padding: "1px 7px", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700 }}>{items.length}</span>
          )}
        </div>
      </div>

      {/* Items list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        {shown.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: 30, gap: 8 }}>
            <div style={{ fontSize: 22 }}>✓</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-success)", letterSpacing: "0.12em" }}>NO CRITICAL ITEMS</div>
          </div>
        ) : shown.map((item, i) => {
          const cfg = SEV_CONFIG[item.severity] || SEV_CONFIG.warning;
          return (
            <div
              key={i}
              onClick={() => navigate(createPageUrl(item.nav))}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px",
                borderLeft: `3px solid ${cfg.color}`,
                background: cfg.bg,
                borderRadius: "0 6px 6px 0",
                cursor: "pointer",
                transition: "opacity 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.80"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: cfg.color, letterSpacing: "0.12em", fontWeight: 700, marginBottom: 1 }}>{item.type}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{item.id}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{item.title}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>{item.detail}</div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.border}`, borderRadius: 3, padding: "2px 5px" }}>
                  {cfg.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}