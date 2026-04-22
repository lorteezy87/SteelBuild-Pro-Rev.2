/**
 * Provenance footer that sits beneath every assistant reply.
 *
 * Renders:
 *   - Confidence pill (HIGH/MEDIUM/LOW)
 *   - "N evidence" / "N staleness" / "N gap" chips, each expandable
 *   - Source tables list
 *
 * The edge function already packages the contract into each tool result;
 * we're just surfacing it visually so users don't have to trust the
 * model alone.
 */

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const mono = { fontFamily: "var(--font-mono)" };

const CONFIDENCE_STYLE = {
  HIGH:   { color: "var(--status-success)", bg: "var(--success-muted)" },
  MEDIUM: { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  LOW:    { color: "var(--status-error)",   bg: "var(--danger-muted)"  },
};

export default function AiProvenance({ provenance }) {
  const [expandedSection, setExpandedSection] = useState(null);

  if (!provenance) return null;

  const {
    confidence = "LOW",
    evidence = [],
    staleness_warnings = [],
    data_gaps = [],
    source_tables = [],
    as_of,
  } = provenance;

  const style = CONFIDENCE_STYLE[confidence] || CONFIDENCE_STYLE.LOW;
  const asOfShort = as_of ? new Date(as_of).toLocaleString() : null;

  const sections = [
    { key: "evidence",  label: "evidence",  items: evidence,          color: "var(--text-secondary)" },
    { key: "staleness", label: "staleness", items: staleness_warnings, color: "var(--status-warning)" },
    { key: "gaps",      label: "gaps",      items: data_gaps,         color: "var(--status-error)" },
  ].filter((s) => s.items.length > 0);

  const toggle = (key) => setExpandedSection((prev) => (prev === key ? null : key));

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: "1px dashed var(--divider)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Top line: confidence pill + chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            ...mono,
            fontSize: 9,
            fontWeight: 800,
            padding: "3px 8px",
            borderRadius: 3,
            background: style.bg,
            color: style.color,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Confidence · {confidence}
        </span>

        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            style={{
              ...mono,
              fontSize: 9,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 3,
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              color: s.color,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {s.items.length} {s.label}
            <ChevronDown
              size={10}
              style={{
                transform: expandedSection === s.key ? "rotate(180deg)" : "none",
                transition: "transform 0.15s",
              }}
            />
          </button>
        ))}

        {asOfShort && (
          <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
            {asOfShort}
          </span>
        )}
      </div>

      {/* Expanded section */}
      {sections.map((s) => {
        if (expandedSection !== s.key) return null;
        return (
          <ul
            key={s.key}
            style={{
              margin: 0,
              paddingLeft: 18,
              listStyle: "disc",
              fontSize: 11,
              color: "var(--text-secondary)",
              lineHeight: 1.55,
            }}
          >
            {s.items.map((item, i) => (
              <li key={i} style={{ color: s.color }}>
                <span style={{ color: "var(--text-secondary)" }}>{item}</span>
              </li>
            ))}
          </ul>
        );
      })}

      {/* Source tables */}
      {source_tables.length > 0 && (
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>
          Source: {source_tables.join(" · ")}
        </div>
      )}
    </div>
  );
}
