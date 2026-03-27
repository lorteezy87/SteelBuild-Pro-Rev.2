import React from "react";

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

export default function ActionItemList({ actionItems }) {
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
                gridTemplateColumns: "auto auto auto",
                gap: "24px",
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid var(--divider)",
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
            </div>
          </div>
        );
      })}
    </div>
  );
}