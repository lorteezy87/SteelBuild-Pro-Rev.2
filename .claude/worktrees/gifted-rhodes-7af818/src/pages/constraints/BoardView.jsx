/**
 * BoardView — four columns (Critical / High / Medium / Low) of cards.
 * Each card shows type icon+label, title, assigned-to, due date, status
 * badge, overdue flag, and compact workflow mini-buttons at the bottom.
 */

import React from "react";
import { formatDateShort as formatShortDate } from "@/components/shared/formatters";
import { PRIORITY_CONFIG, STATUS_CONFIG, TYPE_COLORS, TYPE_ICONS, PRIORITIES } from "./constants";
import { abbreviateType, isOverdue, isResolved } from "./utils";
import { MiniBtn } from "./subcomponents";

export default function BoardView({ items, wps, onQuickUpdate, onEdit, onDelete, onLogMitigation }) {
  const grouped = PRIORITIES.map((p) => ({
    priority: p,
    items: items.filter((c) => c.priority === p),
  }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "start" }}>
      {grouped.map((lane) => {
        const cfg = PRIORITY_CONFIG[lane.priority];
        return (
          <div key={lane.priority} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", display: "flex", flexDirection: "column", minHeight: 120 }}>
            <div
              style={{
                borderTop: `3px solid ${cfg.dot}`,
                padding: "10px 12px",
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-card) var(--radius-card) 0 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: cfg.color, letterSpacing: "0.10em" }}>
                {lane.priority.toUpperCase()}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: cfg.color,
                  background: cfg.bg,
                  borderRadius: "var(--radius-badge)",
                  padding: "2px 8px",
                }}
              >
                {lane.items.length}
              </div>
            </div>

            <div style={{ padding: 10 }}>
              {lane.items.length === 0 ? (
                <div style={{ padding: "24px 12px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                  —
                </div>
              ) : (
                lane.items.map((c) => {
                  const typeColor = TYPE_COLORS[c.constraint_type] || "var(--text-muted)";
                  const overdue = isOverdue(c);
                  const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.Open;
                  const wp = wps.find((w) => w.id === c.work_package_id);
                  return (
                    <div
                      key={c.id}
                      style={{
                        background: "var(--bg-surface)",
                        border: overdue ? "1px solid var(--danger-border)" : "1px solid var(--border-default)",
                        borderLeft: `3px solid ${typeColor}`,
                        borderRadius: "var(--radius-card)",
                        padding: "12px",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ fontSize: 14, color: typeColor }}>{TYPE_ICONS[c.constraint_type] || "•"}</span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 9,
                              fontWeight: 700,
                              color: typeColor,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: 140,
                            }}
                          >
                            {abbreviateType(c.constraint_type)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onEdit(c)}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-btn)",
                            padding: "3px 7px",
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
                          onClick={(e) => { e.stopPropagation(); onLogMitigation(c); }}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-btn)",
                            padding: "3px 7px",
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 8,
                            fontWeight: 700,
                            cursor: "pointer",
                            letterSpacing: "0.08em",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                        >
                          MIT
                        </button>
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          lineHeight: 1.3,
                          marginBottom: 6,
                          maxHeight: 34,
                          overflow: "hidden",
                        }}
                      >
                        {c.title || "Untitled constraint"}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          fontSize: 9,
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted)",
                          marginBottom: 8,
                        }}
                      >
                        {c.assigned_to && <span>👤 {c.assigned_to}</span>}
                        {c.due_date && <span>📅 {formatShortDate(c.due_date)}</span>}
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
                        {overdue && (
                          <span style={{ color: "var(--status-error)", fontWeight: 700 }}>⚠ OVERDUE</span>
                        )}
                      </div>

                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 8,
                          color: "var(--text-muted)",
                          marginBottom: 8,
                        }}
                      >
                        {wp ? wp.wp_number : "No WP"} · {c.project_area || "—"}
                      </div>

                      <div style={{ display: "flex", gap: 4, borderTop: "1px solid var(--divider)", paddingTop: 8 }}>
                        {c.status === "Open" && (
                          <MiniBtn label="▶ Start" tone="accent" onClick={() => onQuickUpdate(c.id, { status: "In Progress" })} />
                        )}
                        {!isResolved(c) && (
                          <MiniBtn label="✓ Resolve" tone="success" onClick={() => onQuickUpdate(c.id, { status: "Resolved" })} />
                        )}
                        {c.status === "Resolved" && (
                          <MiniBtn label="↺ Reopen" tone="warning" onClick={() => onQuickUpdate(c.id, { status: "Open" })} />
                        )}
                        <MiniBtn label="×" tone="muted" onClick={() => onDelete(c)} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
