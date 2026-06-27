/**
 * StatTile — a labeled KPI value, colored by semantic/phase tone.
 * Used in ModuleHeader clusters and in-page KPI strips.
 */
import React from "react";

const TONES = new Set(["neutral", "gold", "blue", "teal", "green", "amber", "danger"]);

export default function StatTile({ label, value, tone = "neutral" }) {
  const t = TONES.has(tone) ? tone : "neutral";
  return (
    <div className={`desk-stat desk-stat--${t}`}>
      <div className="desk-stat__label">{label}</div>
      <div className="desk-stat__value">{value}</div>
    </div>
  );
}
