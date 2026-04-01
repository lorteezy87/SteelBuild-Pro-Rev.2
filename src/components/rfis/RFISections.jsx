import React from "react";
import { mono } from "./rfiConfig";

export function Pill({ label, color, bg }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 8,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 2,
        background: bg,
        color,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}

export function Section({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function Meta({ label, value, highlight, span2 }) {
  return (
    <div style={{ gridColumn: span2 ? "span 2" : undefined }}>
      <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ ...mono, fontSize: 11, color: highlight || "var(--text-primary)", fontWeight: 600 }}>{value || "-"}</div>
    </div>
  );
}

export function ContentBox({ children, accent, success }) {
  return (
    <div
      style={{
        background: accent ? "var(--accent-muted)" : success ? "var(--success-muted)" : "var(--bg-surface)",
        border: `1px solid ${accent ? "var(--accent-border)" : success ? "var(--success-border)" : "var(--border-default)"}`,
        borderRadius: "var(--radius-card)",
        padding: 12,
      }}
    >
      {children}
    </div>
  );
}
