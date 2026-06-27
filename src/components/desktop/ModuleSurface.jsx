/**
 * ModuleSurface — wraps page content in a desktop "window".
 * On mobile it flattens to full-bleed (no chrome).
 */
import React from "react";

export default function ModuleSurface({ title, isMobile, children }) {
  if (isMobile) {
    return (
      <main id="main-content" tabIndex={-1} aria-label="Main content"
        style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", color: "var(--text-primary)" }}>
        {children}
      </main>
    );
  }
  return (
    <div style={{
      flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
      margin: "8px 8px 8px 0", borderRadius: 12, overflow: "hidden",
      border: "1px solid var(--desk-window-edge)", background: "var(--desk-window-bg)",
      position: "relative", zIndex: 1,
    }}>
      <div style={{
        height: 30, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 14px",
        background: "var(--desk-window-header)", borderBottom: "1px solid var(--desk-window-edge)",
        color: "var(--text-secondary)", fontSize: 12, fontFamily: "var(--font-body)",
      }}>
        {title}
      </div>
      <main id="main-content" tabIndex={-1} aria-label="Main content"
        style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", color: "var(--text-primary)" }}>
        {children}
      </main>
    </div>
  );
}
