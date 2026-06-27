/**
 * EmptyState — hero view shown when the project has zero deliveries.
 * Explains what the module tracks and offers a primary "Add First
 * Delivery" CTA.
 */

import React from "react";

export default function EmptyState({ onCreate }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: 0,
        padding: 40,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 20, opacity: 0.3 }}>🚛</div>
      <div style={{ fontFamily: "Space Grotesk, var(--font-display), sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", marginBottom: 10 }}>
        No Shipments Tracked
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 360, lineHeight: 1.6, marginBottom: 28 }}>
        Start tracking steel deliveries, vendor shipments, and material arrivals. Log your first delivery to enable the lookahead schedule and overdue alerts.
      </div>
      <button
        onClick={onCreate}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 28px",
          background: "var(--accent)",
          color: "var(--accent-text)",
          border: "none",
          borderRadius: 3,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        + Add First Delivery
      </button>
    </div>
  );
}
