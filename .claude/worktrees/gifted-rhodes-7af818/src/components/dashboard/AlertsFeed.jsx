import React from "react";

const SEVERITY_COLOR = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-info)",
  Low: "var(--text-muted)",
};

export default function AlertsFeed({ alerts }) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "12px",
      padding: "16px",
    }}>
      <h3 style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        fontWeight: 700,
        color: "var(--text-primary)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        margin: "0 0 12px 0",
      }}>
        Critical Alerts
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {alerts.length > 0 ? (
          alerts.map((a) => (
            <div
              key={a.id}
              style={{
                padding: "8px 10px",
                background: "var(--bg-surface-secondary)",
                border: `1px solid ${SEVERITY_COLOR[a.severity]}40`,
                borderLeft: `3px solid ${SEVERITY_COLOR[a.severity]}`,
                borderRadius: "8px",
                display: "flex",
                gap: "8px",
              }}
            >
              <div style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: SEVERITY_COLOR[a.severity],
                marginTop: "4px",
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {a.title}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {a.project_name}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{
            padding: "20px",
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            No active alerts
          </div>
        )}
      </div>
    </div>
  );
}