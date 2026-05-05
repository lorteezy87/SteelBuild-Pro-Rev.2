import React from "react";

/**
 * UserSignOutBlock — top-utility-bar block that shows the current
 * user's email/full_name and a SIGN OUT button.
 *
 * Extracted from Layout.jsx (see git history).
 */
export default function UserSignOutBlock({ user, onLogout }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto", paddingRight: 0 }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
        letterSpacing: "0.10em", textTransform: "uppercase",
      }}>
        {user?.email || user?.full_name || ""}
      </div>
      <button
        onClick={onLogout}
        className="sbd-btn-ghost"
        style={{
          background: "var(--bg-hover)", border: "1px solid var(--border)",
          borderRadius: 6, padding: "4px 12px",
          color: "var(--text-muted)", fontFamily: "var(--font-mono)",
          fontSize: 8, letterSpacing: "0.10em", cursor: "pointer",
          transition: "all 0.15s", textTransform: "uppercase", fontWeight: 600,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--danger-muted)";
          e.currentTarget.style.borderColor = "var(--danger-border)";
          e.currentTarget.style.color = "var(--danger)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--bg-hover)";
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        SIGN OUT
      </button>
    </div>
  );
}
