import React from "react";

export default function DeliveryScheduleCard({ deliveries = [] }) {
  const getStatusColor = (status) => {
    switch (status) {
      case "Delivered":
        return "var(--status-success)";
      case "In Transit":
        return "var(--status-info)";
      case "Scheduled":
        return "var(--status-warning)";
      default:
        return "var(--status-error)";
    }
  };

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
        Upcoming Deliveries
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {deliveries.length > 0 ? (
          deliveries.map((d) => (
            <div
              key={d.id}
              style={{
                padding: "8px 10px",
                background: "var(--bg-surface-secondary)",
                border: "1px solid var(--border-default)",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {d.vendor}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}>
                  {d.scheduled_date ? new Date(d.scheduled_date).toLocaleDateString() : "—"}
                </div>
              </div>
              <div
                style={{
                  padding: "3px 8px",
                  background: `${getStatusColor(d.status)}20`,
                  border: `1px solid ${getStatusColor(d.status)}40`,
                  borderRadius: "4px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "8px",
                  fontWeight: 600,
                  color: getStatusColor(d.status),
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                  marginLeft: "8px",
                }}
              >
                {d.status}
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
            No deliveries scheduled
          </div>
        )}
      </div>
    </div>
  );
}