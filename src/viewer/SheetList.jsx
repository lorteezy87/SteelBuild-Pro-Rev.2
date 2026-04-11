import React, { useState } from "react";

export default function SheetList({ document, currentPage, onPageChange }) {
  const [expanded, setExpanded] = useState({});

  // Group sheets by discipline if multiple documents
  const disciplines = ["Structural", "Arch", "MEP", "Civil", "Misc Metals"];

  return (
    <div
      style={{
        width: 220,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 12,
          borderBottom: "1px solid var(--border-default)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em"
        }}
      >
        SHEETS
      </div>

      {/* Sheet list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {disciplines.map((discipline) => (
          <div key={discipline}>
            <button
              onClick={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [discipline]: !prev[discipline]
                }))
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "none",
                border: "none",
                color: "rgba(220,225,240,0.70)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                borderBottom: "1px solid rgba(255,255,255,0.04)"
              }}
            >
              <span>{expanded[discipline] ? "▾" : "▸"}</span>
              {discipline}
            </button>

            {expanded[discipline] && document.drawingNumber && (
              <div
                onClick={() => onPageChange(1)}
                style={{
                  padding: "8px 12px",
                  borderLeft: currentPage === 1 ? "2px solid var(--accent)" : "2px solid transparent",
                  background: currentPage === 1 ? "var(--accent-muted)" : "transparent",
                  cursor: "pointer",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  transition: "all 0.15s"
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    color: currentPage === 1 ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: 600,
                    marginBottom: 2
                  }}
                >
                  {document.drawingNumber}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    marginBottom: 4
                  }}
                >
                  {document.displayName}
                </div>
                <div style={{ display: "flex", gap: 6, fontSize: 9 }}>
                  <span style={{ color: "rgba(160,175,210,0.60)" }}>Rev {document.revisionNumber}</span>
                  <span
                    style={{
                      color: document.ifc_status === "IFC" ? "var(--status-success)" : "var(--status-warning)",
                      fontWeight: 600
                    }}
                  >
                    ● {document.ifc_status}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}