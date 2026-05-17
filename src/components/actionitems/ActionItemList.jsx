import React from "react";
import { Trash2 } from "lucide-react";

const PRIORITY_CONFIG = {
  Critical: { color: "var(--status-error)",   bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)",   icon: "\u{1F525}" },
  High:     { color: "var(--status-warning)", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)",  icon: "⚠" },
  Medium:   { color: "var(--status-info)",    bg: "rgba(37,99,235,0.1)",   border: "rgba(37,99,235,0.3)",   icon: "●" },
  Low:      { color: "var(--text-muted)",     bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.3)", icon: "○" },
};

const STATUS_COLORS = {
  Open:          "var(--status-warning)",
  "In Progress": "var(--status-info)",
  Complete:      "var(--status-success)",
  Cancelled:     "var(--text-muted)",
};

// Previously: `new Date(dateStr)` parsed 'YYYY-MM-DD' as UTC midnight,
// then setHours(0,0,0,0) zeroed in local time — the two points were
// separated by the user's UTC offset. In negative-offset timezones a
// due date of 2025-01-15 viewed in the afternoon could show "Due in
// 0 days" on 2025-01-14. We now normalize via the shared dateMath
// helpers so every due-date calc uses local midnight consistently.
import { daysUntil as _daysUntil, toLocalMidnight as _toLocalMidnight } from "@/lib/dateMath";

function relativeDueDate(dateStr, status) {
  if (!dateStr) return null;
  const due = _toLocalMidnight(dateStr);
  if (!due) return null;
  const diff = _daysUntil(dateStr);
  const isDone = status === "Complete" || status === "Cancelled";

  if (isDone) return { label: due.toLocaleDateString(), overdue: false };
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { label: "Due today", overdue: false, urgent: true };
  if (diff === 1) return { label: "Due tomorrow", overdue: false, urgent: true };
  if (diff <= 7)  return { label: `Due in ${diff} days`, overdue: false, urgent: false };
  return { label: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }), overdue: false, urgent: false };
}

/**
 * Checkbox styled to match the SBD design system — accent border,
 * accent fill when checked, mono checkmark.
 */
function SelectCheckbox({ checked, onChange }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        border: checked ? "1.5px solid var(--accent)" : "1.5px solid var(--border-default)",
        background: checked ? "var(--accent)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        transition: "all 0.12s ease",
      }}
    >
      {checked && (
        <span style={{ color: "#061018", fontSize: 11, fontWeight: 900, lineHeight: 1 }}>{"✓"}</span>
      )}
    </div>
  );
}

export default function ActionItemList({
  actionItems = [],
  onEdit,
  onResolve,
  onDelete,
  selectedIds = new Set(),
  onToggleSelect,
  onSelectAll,
  selectionEnabled = false,
}) {
  if (actionItems.length === 0) {
    return (
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          No action items
        </p>
      </div>
    );
  }

  const allSelected = actionItems.length > 0 && actionItems.every((item) => selectedIds.has(item.id));
  const someSelected = selectedIds.size > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Select All / Deselect All header */}
      {selectionEnabled && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px" }}>
          <SelectCheckbox
            checked={allSelected}
            onChange={(checked) => onSelectAll?.(checked)}
          />
          <span
            onClick={() => onSelectAll?.(!allSelected)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: someSelected ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            {allSelected ? "Deselect All" : someSelected ? `${selectedIds.size} Selected` : "Select All"}
          </span>
        </div>
      )}

      {actionItems.map((item) => {
        // Use local-midnight day math so a 2025-01-15 due date reads as
        // "overdue on 2025-01-16", not "overdue at UTC midnight minus user's
        // UTC offset."
        const isOverdue = item.due_date && _daysUntil(item.due_date) < 0 && item.status !== "Complete" && item.status !== "Cancelled";
        const dueInfo = relativeDueDate(item.due_date, item.status);
        const priorityCfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.Medium;
        const isCritical = item.priority === "Critical";
        const isSelected = selectedIds.has(item.id);

        return (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 0,
              background: isSelected
                ? "rgba(200,155,32,0.06)"
                : isCritical && item.status !== "Complete"
                  ? "rgba(239,68,68,0.03)"
                  : "var(--bg-surface)",
              border: isSelected
                ? "1px solid rgba(200,155,32,0.35)"
                : isOverdue
                  ? "1px solid rgba(239,68,68,0.4)"
                  : isCritical && item.status !== "Complete"
                    ? "1px solid rgba(239,68,68,0.2)"
                    : "1px solid var(--border-default)",
              borderLeft: `3px solid ${isSelected ? "var(--accent)" : priorityCfg.color}`,
              borderRadius: "12px",
              transition: "all 0.15s",
              opacity: item.status === "Complete" ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = "var(--accent-border)";
                e.currentTarget.style.background = "var(--hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = isOverdue ? "rgba(239,68,68,0.4)" : isCritical && item.status !== "Complete" ? "rgba(239,68,68,0.2)" : "var(--border-default)";
                e.currentTarget.style.background = isCritical && item.status !== "Complete" ? "rgba(239,68,68,0.03)" : "var(--bg-surface)";
              }
            }}
          >
            {/* Checkbox column */}
            {selectionEnabled && (
              <div style={{ display: "flex", alignItems: "center", padding: "14px 0 14px 14px" }}>
                <SelectCheckbox
                  checked={isSelected}
                  onChange={(checked) => onToggleSelect?.(item.id, checked)}
                />
              </div>
            )}

            {/* Content column */}
            <div style={{ flex: 1, padding: "14px 16px", paddingLeft: selectionEnabled ? 10 : 16 }}>
              {/* Header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: 2, textDecoration: item.status === "Complete" ? "line-through" : "none" }}>
                    {priorityCfg.icon} {item.title}
                  </div>
                  {item.description && (
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {item.description}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 12, flexShrink: 0 }}>
                  {/* Priority badge */}
                  <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", background: priorityCfg.bg, border: `1px solid ${priorityCfg.border}`, borderRadius: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: priorityCfg.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {item.priority}
                    </span>
                  </div>

                  {/* Status badge */}
                  <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", background: `${STATUS_COLORS[item.status]}20`, border: `1px solid ${STATUS_COLORS[item.status]}40`, borderRadius: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: STATUS_COLORS[item.status], textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {item.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer row */}
              <div style={{ display: "flex", alignItems: "center", gap: 20, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
                {/* Assignee avatar + name */}
                {item.assigned_to && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "white" }}>
                        {item.assigned_to.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.assigned_to}</span>
                  </div>
                )}

                {/* Relative due date */}
                {dueInfo && (
                  <div style={{ fontSize: 11, fontWeight: dueInfo.overdue || dueInfo.urgent ? 700 : 400, color: dueInfo.overdue ? "var(--status-error)" : dueInfo.urgent ? "var(--status-warning)" : "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {dueInfo.overdue && "⏰ "}{dueInfo.label}
                  </div>
                )}

                {item.meeting_reference && (
                  <div style={{ fontSize: 11, color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                    {"\u{1F4CB}"} {item.meeting_reference}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 5, marginLeft: "auto", alignItems: "center" }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onResolve?.(item); }}
                    title={item.status === "Complete" ? "Reopen" : "Mark Complete"}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 10px", borderRadius: 4,
                      border: item.status === "Complete" ? "1px solid var(--border-default)" : "1px solid rgba(0,214,143,0.35)",
                      background: item.status === "Complete" ? "transparent" : "rgba(0,214,143,0.10)",
                      color: item.status === "Complete" ? "var(--text-muted)" : "var(--status-success)",
                      fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em",
                    }}
                  >
                    {item.status === "Complete" ? "↩ Reopen" : "✓ Resolve"}
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit?.(item); }}
                    style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete?.(item); }}
                    style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: "1px solid rgba(255,61,61,0.25)", background: "rgba(255,61,61,0.08)", color: "var(--status-error)", cursor: "pointer" }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
