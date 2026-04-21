/**
 * BulkActionBar — bottom-fixed centered action strip that appears
 * when one or more rows are selected in a list view.
 *
 *   count    — how many rows are currently selected
 *   onClear  — handler for the "CLEAR" affordance at the end
 *   actions  — array of `{ label, icon, variant?, onClick }` to render
 *              as Button components in order.
 *
 * Hides when count is 0. Sticky-float pattern — doesn't take layout
 * space in the page flow.
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
        padding: "10px 14px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--accent)",
        borderRadius: 8,
        boxShadow: "0 8px 28px rgba(0,0,0,0.5), 0 0 20px var(--accent-muted)",
        zIndex: 200,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--accent)",
          letterSpacing: "0.10em",
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
          letterSpacing: "0.10em",
          padding: "4px 8px",
        }}
      >
        CLEAR
      </div>
    </div>
  );
}
