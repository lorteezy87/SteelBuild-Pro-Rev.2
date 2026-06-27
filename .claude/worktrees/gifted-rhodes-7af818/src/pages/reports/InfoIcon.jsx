/**
 * InfoIcon — small "i in a circle" glyph that shows a tooltip on
 * hover. Used next to chart titles to explain what the chart means
 * without cluttering the card with a subtitle.
 */

import React, { useState } from "react";
import { body } from "./constants";

export default function InfoIcon({ tooltip }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", cursor: "help" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={12} r={10} />
        <line x1={12} y1={16} x2={12} y2={12} />
        <line x1={12} y1={8}  x2={12.01} y2={8} />
      </svg>
      {show && (
        <div
          style={{
            position: "absolute",
            top: -4,
            left: "100%",
            marginLeft: 8,
            background: "var(--bg-surface-high)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-card)",
            padding: "8px 12px",
            ...body,
            fontSize: 11,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "var(--shadow-card)",
          }}
        >
          {tooltip}
        </div>
      )}
    </span>
  );
}
