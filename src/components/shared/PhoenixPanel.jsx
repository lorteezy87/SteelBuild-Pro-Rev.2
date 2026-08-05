import React from "react";
import {
  phoenixTH,
  phoenixTR,
  phoenixTD,
  phoenixTDMono,
  PHOENIX_PANEL_SURFACE_STYLE,
  PHOENIX_PANEL_HEADER_STYLE,
  PHOENIX_PANEL_TITLE_STYLE,
  PHOENIX_PANEL_COUNT_STYLE,
} from "./phoenixPanelHelpers";

// Back-compat re-exports for table cell chrome.
export { phoenixTH, phoenixTR, phoenixTD, phoenixTDMono };

// Phoenix standard panel with orange left-border header
export function PhoenixPanel({ title, count, actions, children, style = {} }) {
  return (
    <div className="sbd-card sbp-phoenix-panel" style={{
      ...PHOENIX_PANEL_SURFACE_STYLE,
      ...style
    }}>
      {(title || actions) && (
        <div style={PHOENIX_PANEL_HEADER_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {title && (
              <span style={PHOENIX_PANEL_TITLE_STYLE}>{title}</span>
            )}
            {count != null && (
              <span style={PHOENIX_PANEL_COUNT_STYLE}>{count}</span>
            )}
          </div>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// Phoenix data-pair: label above value
export function DataPair({ label, value, mono = false }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{value || "—"}</div>
    </div>
  );
}
