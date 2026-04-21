/**
 * CommandBar — title + view toggle (Table / Timeline) + Export /
 * Import Ticket / New Delivery buttons at the top of the Deliveries
 * page. All actions are handler props; no state owned here.
 */

import React from "react";

export default function CommandBar({
  deliveryCount,
  projectCount,
  view,
  onViewChange,
  onExportAll,
  onImport,
  onNew,
}) {
  return (
    <div
      style={{
        height: 56,
        flexShrink: 0,
        background: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--divider)",
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-primary)", textTransform: "uppercase" }}>
          Deliveries
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", background: "var(--bg-surface-high)", border: "1px solid var(--border-default)", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.12em" }}>
          {deliveryCount} SHIPMENTS · {projectCount} PROJECTS
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", border: "1px solid var(--divider)", borderRadius: 8, overflow: "hidden" }}>
          {["TABLE", "TIMELINE"].map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              style={{
                padding: "8px 12px",
                border: "none",
                background: view === v ? "var(--accent)"      : "transparent",
                color:      view === v ? "var(--accent-text)" : "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={onExportAll}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--divider)",
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          Export All
        </button>
        <button
          onClick={onImport}
          title="Drop a Tekla / fab-shop shipping ticket PDF — AI extracts load header + every line item"
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--ai-accent, #22D3EE)",
            background: "transparent",
            color: "var(--ai-accent, #22D3EE)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ↗ Import Shipping Ticket
        </button>
        <button
          onClick={onNew}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "var(--accent-text)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + New Delivery
        </button>
      </div>
    </div>
  );
}
