import React from "react";

/**
 * DensityToggle — top-utility-bar button that toggles compact vs.
 * comfortable density on <html data-density>.
 *
 * Reads/writes the `sbp-density` localStorage key. Initial restore on
 * page load is handled separately by useDensityRestore.
 *
 * Extracted from Layout.jsx (see git history).
 */
export default function DensityToggle() {
  return (
    <div
      title="Toggle compact/comfortable density"
      onClick={() => {
        const html = document.documentElement;
        const current = html.getAttribute("data-density");
        const next = current === "compact" ? "comfortable" : "compact";
        html.setAttribute("data-density", next);
        try { localStorage.setItem("sbp-density", next); } catch { /* ignore */ }
      }}
      style={{
        width: 32, height: 32, borderRadius: 8,
        background: "var(--hover-bg)", border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "var(--text-muted)", transition: "all 0.15s",
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-muted)"; e.currentTarget.style.color = "var(--accent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; e.currentTarget.style.color = "var(--text-muted)"; }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="2" y1="3" x2="12" y2="3" /><line x1="2" y1="7" x2="12" y2="7" /><line x1="2" y1="11" x2="12" y2="11" />
      </svg>
    </div>
  );
}
