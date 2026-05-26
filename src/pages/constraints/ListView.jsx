/**
 * ListView — dense table of constraint rows. Each row is compact and
 * collapses into an `ExpandedRow` (inline below) when clicked, showing
 * description, assigned/due/priority/status meta, and quick workflow
 * actions (Start/Resolve/Reopen/Close).
 *
 * The row-level actions (resolve, edit, delete, log mitigation) are
 * bubbled up to the page shell via callback props; this component is
 * display-only.
 */

import React from "react";
import { formatDate, formatDateShort as formatShortDate } from "@/components/shared/formatters";
import { PRIORITY_CONFIG, STATUS_CONFIG, TYPE_COLORS, TYPE_ICONS } from "./constants";
import { abbreviateType, isOverdue, isResolved } from "./utils";
import { Meta, ActionBtn } from "./subcomponents";

const GRID_COLS = "6px 28px 1fr 110px 80px 90px 80px 100px";

export default function ListView({ items, wps, expandedId, setExpandedId, onQuickUpdate, onEdit, onDelete }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          background: "var(--bg-surface-secondary)",
          borderBottom: "1px solid var(--divider)",
          padding: "9px 16px",
          display: "grid",
          gridTemplateColumns: GRID_COLS,
          gap: 12,
          alignItems: "center",
        }}
      >
        {["", "!", "Constraint", "Type", "WP", "Area", "Due", "Actions"].map((h, i) => (
          <div
            key={`${h}-${i}`}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {items.map((c) => {
        const overdue = isOverdue(c);
        const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
        const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.Open;
        const wp = wps.find((w) => w.id === c.work_package_id);
        const resolved = isResolved(c);
        const generated = Boolean(c._generated);
        return (
          <React.Fragment key={c.id}>
            <div
              onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
              style={{
                display: "grid",
                gridTemplateColumns: GRID_COLS,
                gap: 12,
                alignItems: "center",
                padding: "0 16px",
                minHeight: 48,
                borderBottom: "1px solid var(--divider)",
                cursor: "pointer",
                background: expandedId === c.id ? "var(--bg-row-hover)" : "transparent",
                opacity: resolved ? 0.55 : 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-row-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = expandedId === c.id ? "var(--bg-row-hover)" : "transparent")}
            >
              <div style={{ width: 4, height: 36, borderRadius: 2, background: PRIORITY_CONFIG[c.priority]?.dot || "var(--text-muted)" }} />
              <div
                style={{ fontSize: 14, textAlign: "center", color: typeColor, lineHeight: 1 }}
                title={c.constraint_type}
              >
                {TYPE_ICONS[c.constraint_type] || "•"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.title || "Untitled constraint"}
                  </span>
                  {overdue && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)" }}>
                      ⚠ OVERDUE
                    </span>
                  )}
                  {generated && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 800,
                        color: "var(--accent)",
                        background: "var(--accent-muted)",
                        border: "1px solid var(--accent-border)",
                        borderRadius: "var(--radius-badge)",
                        padding: "1px 6px",
                        letterSpacing: "0.08em",
                      }}
                    >
                      SYSTEM
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
                    {expandedId === c.id ? "▾" : "▸"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                  {c.assigned_to ? <span style={{ fontStyle: "italic" }}>{c.assigned_to}</span> : null}
                  {!c.assigned_to && !resolved ? (
                    <span
                      style={{
                        background: statusCfg.bg,
                        color: statusCfg.color,
                        borderRadius: "var(--radius-badge)",
                        padding: "1px 6px",
                        fontSize: 8,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {statusCfg.label}
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <span
                  style={{
                    background: `${typeColor}15`,
                    color: typeColor,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: "var(--radius-badge)",
                    textTransform: "uppercase",
                  }}
                >
                  {abbreviateType(c.constraint_type)}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>
                {wp ? wp.wp_number : "—"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                {c.project_area ? c.project_area.slice(0, 10) : "—"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: overdue ? "var(--status-error)" : "var(--text-muted)",
                  fontWeight: overdue ? 700 : 500,
                }}
              >
                {c.due_date ? formatShortDate(c.due_date) : "—"}
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-start" }}>
                {!generated && !resolved && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onQuickUpdate(c.id, { status: "Resolved" }); }}
                    style={{
                      background: "var(--success-muted)",
                      border: "1px solid var(--success-border)",
                      borderRadius: "var(--radius-btn)",
                      padding: "3px 8px",
                      color: "var(--status-success)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ✓
                  </button>
                )}
                {!generated && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(c); }}
                      style={{
                        background: "var(--bg-surface-high)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-btn)",
                        padding: "3px 8px",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      EDIT
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(c); }}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--danger-border)",
                        borderRadius: "var(--radius-btn)",
                        padding: "3px 7px",
                        color: "var(--status-error)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            </div>

            {expandedId === c.id && (
              <ExpandedRow constraint={c} wps={wps} onQuickUpdate={onQuickUpdate} onEdit={onEdit} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ExpandedRow({ constraint: c, wps, onQuickUpdate, onEdit }) {
  const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.Open;
  const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
  const wp = wps.find((w) => w.id === c.work_package_id);
  const generated = Boolean(c._generated);
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        borderBottom: "1px solid var(--divider)",
        borderLeft: `4px solid ${typeColor}`,
        padding: "14px 16px 14px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginTop: 2 }}>
        {c.description?.trim() ? c.description : <i style={{ color: "var(--text-muted)" }}>No details provided.</i>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Meta label="Assigned To" value={c.assigned_to || "—"} />
        <Meta label="Due Date" value={c.due_date ? formatDate(c.due_date) : "—"} />
        {generated && <Meta label="Source" value={c._source_ref || c._source_type || "System"} />}
        <Meta
          label="Priority"
          value={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: PRIORITY_CONFIG[c.priority]?.dot || "var(--text-muted)" }} />
              <span>{c.priority}</span>
            </div>
          }
        />
        <Meta
          label="Status"
          value={
            <span
              style={{
                background: statusCfg.bg,
                color: statusCfg.color,
                borderRadius: "var(--radius-badge)",
                padding: "2px 7px",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {statusCfg.label}
            </span>
          }
        />
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
        WP: {wp ? wp.wp_number : "—"} · Area: {c.project_area || "—"}
      </div>

      <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--divider)", paddingTop: 12, alignItems: "center" }}>
        {generated && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            System-generated blocker. Clear the source condition to remove it.
          </div>
        )}
        {!generated && c.status === "Open" && (
          <ActionBtn label="▶ Start Progress" onClick={() => onQuickUpdate(c.id, { status: "In Progress" })} />
        )}
        {!generated && !isResolved(c) && (
          <ActionBtn label="✓ Mark Resolved" tone="success" onClick={() => onQuickUpdate(c.id, { status: "Resolved" })} />
        )}
        {!generated && c.status === "Resolved" && (
          <ActionBtn label="↺ Reopen" tone="warning" onClick={() => onQuickUpdate(c.id, { status: "Open" })} />
        )}
        {!generated && c.status !== "Closed" && (
          <ActionBtn label="⊘ Close" tone="muted" onClick={() => onQuickUpdate(c.id, { status: "Closed" })} />
        )}
        <div style={{ flex: 1 }} />
        {!generated && <ActionBtn label="Edit Details" onClick={() => onEdit(c)} tone="neutral" />}
      </div>
    </div>
  );
}
