import React, { useMemo } from "react";
import { suggestLinksForEntity } from "@/services/autoLinkEngine";

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "3px 8px",
  borderRadius: 6,
  fontSize: 10,
  fontFamily: "var(--font-mono)",
  cursor: "pointer",
  border: "1px solid rgba(200,155,32,0.3)",
  background: "rgba(200,155,32,0.08)",
  color: "var(--accent)",
  transition: "all 0.15s ease",
};

const TYPE_ICON = {
  drawing: "▦",
  work_package: "▤",
  rfi: "⚑",
  sequence: "⇢",
};

export default function AutoLinkSuggestions({ entity, sources = {}, onLink }) {
  const suggestions = useMemo(
    () => suggestLinksForEntity(entity || {}, sources),
    [entity, sources]
  );

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div style={{
      padding: "8px 12px",
      background: "rgba(200,155,32,0.05)",
      border: "1px solid rgba(200,155,32,0.18)",
      borderLeft: "3px solid var(--accent)",
      borderRadius: "0 6px 6px 0",
      marginBottom: 10,
    }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        letterSpacing: "0.12em",
        color: "var(--accent)",
        textTransform: "uppercase",
        marginBottom: 6,
      }}>
        AUTO-DETECTED LINKS
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {suggestions.map((s, i) => (
          <button
            key={`${s.entityId}-${i}`}
            type="button"
            style={chipStyle}
            onClick={() => onLink?.(s)}
            title={`Click to link: ${s.label}`}
          >
            <span>{TYPE_ICON[s.type] || "•"}</span>
            <span>{s.label}</span>
            <span style={{ fontSize: 8, color: "var(--text-muted)" }}>
              {s.confidence === "high" ? "●" : "○"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
