/**
 * BulkActionBar — bottom-fixed centered action strip that appears
 * when one or more rows are selected in a list view.
 *
 *   count    — how many rows are currently selected
 *   onClear  — handler for the "CLEAR" affordance at the end
 *   actions  — array of `{ label, icon, variant?, onClick }` to render
 *              as Button components in order.
 *
 * SBD treatment: heavy glass (28px blur) + accent border + soft accent
 * glow so the bar reads as elevated and active.  Hides when count is 0.
 * Sticky-float pattern — doesn't take layout space in the page flow.
 */

import React from "react";
import Button from "./Button";

export default function BulkActionBar({ count, onClear, actions = [] }) {
  if (!count) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        background: "var(--bg-surface-high)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        border: "1px solid var(--accent-border)",
        borderRadius: "var(--radius-card)",
        boxShadow:
          "var(--shadow-lg), 0 0 28px color-mix(in srgb, var(--accent) 22%, transparent), inset 0 1px 0 var(--glass-border)",
        zIndex: 200,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--accent)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {count} SELECTED
      </span>
      <div style={{ width: 1, height: 18, background: "var(--divider)" }} />
      {actions.map((a, i) => (
        <Button
          key={i}
          variant={a.variant || "secondary"}
          size="sm"
          icon={a.icon}
          onClick={a.onClick}
          disabled={a.disabled}
        >
          {a.label}
        </Button>
      ))}
      <div style={{ width: 1, height: 18, background: "var(--divider)" }} />
      <div
        onClick={onClear}
        style={{
          cursor: "pointer",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.12em",
          padding: "4px 8px",
          textTransform: "uppercase",
        }}
      >
        CLEAR
      </div>
    </div>
  );
}
