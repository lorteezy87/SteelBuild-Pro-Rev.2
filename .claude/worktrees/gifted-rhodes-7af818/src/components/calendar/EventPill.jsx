/**
 * EventPill — small inline event chip used in MonthView day cells and
 * in WeekView day columns. Compact, color-coded, click to navigate.
 *
 * Two display modes:
 *   - "compact"  (default) → 1-line, 18px tall, used inside Month grid
 *   - "wide"     → multi-line with subtitle, used in Week / Day views
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function EventPill({ event, mode = "compact", onClick }) {
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) {
      onClick(event);
      return;
    }
    if (event.navTo) navigate(event.navTo);
  };

  const accent = event.accent || "var(--text-secondary)";
  const isMilestone = event.type === "milestone";
  const isAnchor = event.type === "project_anchor";

  if (mode === "compact") {
    return (
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`${event.title}${event.subtitle ? " — " + event.subtitle : ""}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          width: "100%",
          height: 19,
          padding: "0 6px",
          borderRadius: 3,
          border: "none",
          background: hovered
            ? `color-mix(in srgb, ${accent} 24%, transparent)`
            : `color-mix(in srgb, ${accent} 12%, transparent)`,
          borderLeft: `2px solid ${accent}`,
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          fontSize: 11.5,
          fontWeight: 500,
          textAlign: "left",
          cursor: "pointer",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          transition: "background 120ms",
          minWidth: 0,
        }}
      >
        <span
          style={{
            flexShrink: 0,
            color: accent,
            fontSize: isMilestone || isAnchor ? 12 : 10,
            lineHeight: 1,
            fontFamily: "var(--font-mono)",
          }}
        >
          {event.icon}
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {event.title}
        </span>
      </button>
    );
  }

  // Wide mode — Week / Day view
  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "6px 8px",
        borderRadius: 4,
        border: `1px solid color-mix(in srgb, ${accent} 35%, transparent)`,
        borderLeft: `3px solid ${accent}`,
        background: hovered
          ? `color-mix(in srgb, ${accent} 16%, var(--bg-surface))`
          : `color-mix(in srgb, ${accent} 8%, var(--bg-surface))`,
        cursor: "pointer",
        transition: "all 120ms",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--text-primary)",
          lineHeight: 1.2,
        }}
      >
        <span style={{ color: accent, fontFamily: "var(--font-mono)" }}>{event.icon}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {event.title}
        </span>
      </div>
      {event.subtitle && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {event.subtitle}
        </div>
      )}
    </button>
  );
}
