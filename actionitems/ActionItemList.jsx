import React from "react";
import { Trash2 } from "lucide-react";

const PRIORITY_COLORS = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--text-muted)",
};

const STATUS_COLORS = {
  Open: "var(--status-warning)",
  "In Progress": "var(--status-info)",
  Complete: "var(--status-success)",
  Cancelled: "var(--text-muted)",
};

export default function ActionItemList({
  actionItems,
  onEdit,
  onResolve,
  onDelete,
}) {
  if (actionItems.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "12px",
          padding: "40px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          No action items
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {actionItems.map((item) => {
        const isOverdue =
          item.due_date &&
          new Date(item.due_date) < new Date() &&
          item.status !== "Complete" &&
          item.status !== "Cancelled";

        return (
          <div
            key={item.id}
            style={{
              background: "var(--bg-surface)",
              border: isOverdue ? "1px solid var(--status-error)" : "1px solid var(--border-default)",
              borderRadius: "12px",
              padding: "16px",
              transition: "all 0.15s",
              opacity: item.status === "Complete" ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-border)";
              e.currentTarget.style.background = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = isOverdue ? "var(--status-error)" : "var(--border-default)";
              e.currentTarget.style.background = "var(--bg-surface)";
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "8px",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: "4px",
                    textDecoration: item.status === "Complete" ? "line-through" : "none",
                  }}
                >
                  {item.title}
                </div>
                {item.description && (
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {item.description}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "12px" }}>
                {(item.status === "Complete" || item.status === "Cancelled") && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete && onDelete(item);
                    }}
                    style={{
                      width: "28px",
                      height: "28px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "transparent",
                      border: "1px solid var(--danger-border)",
                      borderRadius: "6px",
                      color: "var(--status-error)",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    title="Delete completed item"
                  >
                    <Trash2 size={12} />
                  </button>
                )}

                {/* Priority Badge */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 8px",
                    background: `${PRIORITY_COLORS[item.priority]}20`,
                    border: `1px solid ${PRIORITY_COLORS[item.priority]}40`,
                    borderRadius: "6px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 600,
                      color: PRIORITY_COLORS[item.priority],
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {item.priority}
                  </span>
                </div>

                {/* Status Badge */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 8px",
                    background: `${STATUS_COLORS[item.status]}20`,
                    border: `1px solid ${STATUS_COLORS[item.status]}40`,
                    borderRadius: "6px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 600,
                      color: STATUS_COLORS[item.status],
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {item.status}
                  </span>
                </div>

                {/* Overdue warning */}
                {isOverdue && (
                  <span style={{ color: "var(--status-error)", fontSize: "12px", fontWeight: 700 }}>
                    ⚠
                  </span>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto auto auto 1fr",
                gap: "24px",
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid var(--divider)",
                alignItems: "center",
              }}
            >
              {item.assigned_to && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Assigned To
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {item.assigned_to}
                  </div>
                </div>
              )}

              {item.due_date && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    Due Date
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: isOverdue ? "var(--status-error)" : "var(--text-secondary)",
                      fontWeight: isOverdue ? 600 : 400,
                    }}
                  >
                    {new Date(item.due_date).toLocaleDateString()}
                    {isOverdue && " (OVERDUE)"}
                  </div>
                </div>
              )}

              {item.meeting_reference && (
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "8px",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                    }}
                  >
                    From Meeting
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--accent)" }}>
                    {item.meeting_reference}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginLeft: "auto",
                  alignItems: "center",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onResolve?.(item);
                  }}
                  title={item.status === "Complete" ? "Reopen" : "Mark Complete"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: `1px solid ${
                      item.status === "Complete" ? "var(--border-default)" : "rgba(0,214,143,0.35)"
                    }`,
                    background: item.status === "Complete" ? "transparent" : "rgba(0,214,143,0.10)",
                    color: item.status === "Complete" ? "var(--text-muted)" : "var(--status-success)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {item.status === "Complete" ? "↩ REOPEN" : "✓ RESOLVE"}
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(item);
                  }}
                  title="Edit"
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--border-default)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  EDIT
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(item);
                  }}
                  title="Delete"
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid rgba(255,61,61,0.25)",
                    background: "rgba(255,61,61,0.08)",
                    color: "var(--status-error)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    fontWeight: 700,
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  DELETE
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
