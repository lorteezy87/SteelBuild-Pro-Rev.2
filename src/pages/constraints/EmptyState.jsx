/**
 * EmptyState — shown when the filtered list is empty. Copy changes
 * based on whether the user's active filter is "open" (happy path:
 * nothing to work on) vs. other (likely a bad filter combination).
 */

import React from "react";

export default function EmptyState({ hasOpen }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>✓</div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--status-success)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {hasOpen ? "No Open Constraints" : "No Constraints Found"}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
        {hasOpen ? "All constraints are resolved. Good standing." : "Try adjusting your filters."}
      </div>
    </div>
  );
}
