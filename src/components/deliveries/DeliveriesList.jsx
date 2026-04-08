import React from "react";

const STATUS_COLORS = {
  Scheduled: { bg: "var(--status-warning)", text: "#000" },
  "In Transit": { bg: "var(--status-info)", text: "#fff" },
  Delivered: { bg: "var(--status-success)", text: "#fff" },
  Partial: { bg: "var(--status-error)", text: "#fff" },
  Rejected: { bg: "var(--status-error)", text: "#fff" },
};

export default function DeliveriesList({ deliveries, onEdit }) {
  if (deliveries.length === 0) {
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
          No deliveries
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--divider)",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr 100px 80px",
          gap: "12px",
          background: "var(--bg-surface-secondary)",
        }}
      >
        {["Material", "Vendor", "Scheduled", "Tonnage", "Status", "Actions"].map(
          (col) => (
            <div
              key={col}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                fontWeight: 700,
                color: "var(--text-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {col}
            </div>
          )
        )}
      </div>

      {/* Rows */}
      {deliveries.map((delivery) => {
        const statusColor = STATUS_COLORS[delivery.status] || STATUS_COLORS.Scheduled;
        const isOverdue =
          new Date(delivery.scheduled_date) < new Date() &&
          delivery.status !== "Delivered";

        return (
          <div
            key={delivery.id}
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--divider)",
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr 100px 80px",
              gap: "12px",
              alignItems: "center",
              background: isOverdue ? "var(--hover-bg)" : "transparent",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--hover-bg)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = isOverdue ? "var(--hover-bg)" : "transparent")
            }
          >
            {/* Material */}
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {delivery.description || delivery.vendor || "—"}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}
              >
                {delivery.po_number ? `PO: ${delivery.po_number}` : "No PO"}
              </div>
            </div>

            {/* Vendor */}
            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              {delivery.vendor}
            </div>

            {/* Scheduled */}
            <div
              style={{
                fontSize: "11px",
                color: isOverdue ? "var(--status-error)" : "var(--text-secondary)",
                fontWeight: isOverdue ? 600 : 400,
              }}
            >
              {new Date(delivery.scheduled_date).toLocaleDateString()}
              {isOverdue && <span style={{ marginLeft: "4px" }}>⚠</span>}
            </div>

            {/* Tonnage */}
            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              {delivery.pieces} pc • {delivery.weight_tons}T
            </div>

            {/* Status */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: statusColor.bg,
                color: statusColor.text,
                borderRadius: "6px",
                padding: "4px 8px",
                fontFamily: "var(--font-mono)",
                fontSize: "8px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {delivery.status}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit && onEdit(delivery); }}
                style={{
                  background: "var(--bg-surface)", border: "1px solid var(--border-default)",
                  borderRadius: 6, padding: "4px 8px", color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)", fontSize: 8, cursor: "pointer", fontWeight: 700,
                }}
              >
                EDIT
              </button>
              {delivery.status !== "Delivered" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit && onEdit({ ...delivery, _quickComplete: true }); }}
                  style={{
                    background: "var(--success-glow)", border: "1px solid var(--success-border)",
                    borderRadius: 6, padding: "4px 8px", color: "var(--status-success)",
                    fontFamily: "var(--font-mono)", fontSize: 8, cursor: "pointer", fontWeight: 700,
                  }}
                >
                  ✓
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}