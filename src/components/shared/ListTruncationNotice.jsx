import React from "react";

// Default row cap shown in the notice. Mirrors LIST_ROW_CAP in
// src/api/supabaseClient.ts (the data-layer read cap), but is deliberately NOT
// imported from there: page tests mock "@/api/supabaseClient", and the mocked
// named binding sits in a temporal dead zone that throws on access — even when
// reached via a default parameter at render time. A unit test asserts this stays
// in sync with LIST_ROW_CAP so the two can't silently drift.
export const DEFAULT_LIST_CAP = 2000;

/**
 * ListTruncationNotice — tells the user a capped list isn't showing everything.
 *
 * The data layer caps list()/filter() reads at LIST_ROW_CAP and otherwise
 * truncates silently (see supabaseClient.warnIfTruncated, which only warns in
 * DEV). This promotes that signal to a visible, production notice so rows beyond
 * the cap aren't dropped without a trace.
 *
 * Renders nothing unless `count >= cap`. Non-dismissible by design: a truncated
 * list is an ongoing data-completeness condition, not a transient alert.
 *
 * @param {{ count?: number, cap?: number, label?: string }} props
 *   count – rows currently loaded (e.g. drawings.length)
 *   cap   – the row cap that was applied (defaults to LIST_ROW_CAP)
 *   label – plural noun for the rows shown in the heading (e.g. "drawings")
 */
export default function ListTruncationNotice({ count, cap = DEFAULT_LIST_CAP, label = "records" }) {
  const effectiveCap = typeof cap === "number" ? cap : DEFAULT_LIST_CAP;
  if (typeof count !== "number" || count < effectiveCap) return null;
  const capLabel = effectiveCap.toLocaleString();
  return (
    <div
      role="status"
      className="sbd-card"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 2,
        background: "var(--warning-muted, rgba(245,158,11,0.12))",
        border: "1px solid var(--status-warning, #f59e0b)",
        marginBottom: 8,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
        ⚠
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--status-warning, #f59e0b)",
            letterSpacing: "0.04em",
            marginBottom: 2,
          }}
        >
          SHOWING FIRST {capLabel} {label.toUpperCase()}
        </div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--text-secondary)",
            lineHeight: 1.4,
          }}
        >
          This list is capped at {capLabel} rows and more exist — narrow your filters (or search) to see the rest.
        </div>
      </div>
    </div>
  );
}
