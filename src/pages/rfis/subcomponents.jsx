/**
 * Presentational atoms for the RFI Hub — `Pill`, `Section`, `Meta`,
 * `ContentBox`. All dumb: no state, no props beyond display.
 */

import React from "react";
import { mono } from "./constants";

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
    <div>
      <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 8, ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

export function Meta({ label, value, highlight, span2 }) {
  return (
    <div style={{ gridColumn: span2 ? "span 2" : "span 1" }}>
      <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, color: highlight ? "var(--status-error)" : "var(--text-primary)" }}>
        {value || "—"}
      </div>
    </div>
  );
}

export function ContentBox({ children, accent, success }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 4,
        border: "1px solid " + (accent ? "var(--accent-border)" : success ? "var(--success-border)" : "var(--border-default)"),
        background: accent ? "var(--accent-muted)" : success ? "var(--success-muted)" : "var(--bg-surface-low)",
        borderLeft: "3px solid " + (accent ? "var(--accent)" : success ? "var(--status-success)" : "var(--accent)"),
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--text-primary)",
        lineHeight: 1.7,
      }}
    >
      {children}
    </div>
  );
}
