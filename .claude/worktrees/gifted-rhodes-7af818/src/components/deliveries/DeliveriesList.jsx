import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const STATUS_COLORS = {
  Scheduled: { bg: "var(--status-warning)", text: "#000" },
  "In Transit": { bg: "var(--status-info)", text: "#fff" },
  Delivered: { bg: "var(--status-success)", text: "#fff" },
  Partial: { bg: "var(--status-error)", text: "#fff" },
  Rejected: { bg: "var(--status-error)", text: "#fff" },
};

export default function DeliveriesList({ deliveries = [], onEdit }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: deliveries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 8,
  });

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
        display: "flex",
        flexDirection: "column",
        maxHeight: "calc(100vh - 280px)",
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
          flexShrink: 0,
        }}
      >
        {["Delivery Title", "Vendor", "Scheduled", "Tonnage", "Status", "Actions"].map(
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

      {/* Virtualized rows */}
      <div ref={parentRef} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const delivery = deliveries[virtualRow.index];
            const statusColor = STATUS_COLORS[delivery.status] || STATUS_COLORS.Scheduled;
            const isOverdue =
              new Date(delivery.scheduled_date) < new Date() &&
              delivery.status !== "Delivered";

            return (
              <div
                key={delivery.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
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

                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {delivery.vendor}
                  </div>

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

                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {delivery.pieces} pc • {delivery.weight_tons}T
                  </div>

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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
