/**
 * SequenceFilter — cross-module area/sequence chip filter.
 *
 * Extracts unique area and sequence_number values from any entity array
 * and renders a row of toggle chips.  Compatible with work packages,
 * deliveries, RFIs, constraints, and any other entity that carries
 * area, sequence_number, area_sequence, zone, or project_area fields.
 */

import React, { useMemo } from "react";

const chipStyle = (active) => ({
  padding: "4px 10px",
  borderRadius: 14,
  border: `1px solid ${active ? "var(--accent)" : "var(--divider)"}`,
  background: active ? "rgba(200,155,32,0.12)" : "transparent",
  color: active ? "var(--accent)" : "var(--text-secondary)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  fontWeight: 800,
  letterSpacing: "0.06em",
  cursor: "pointer",
  transition: "all 0.15s ease",
  whiteSpace: "nowrap",
  textTransform: "uppercase",
});

export default function SequenceFilter({ items = [], value, onChange, label = "Area / Sequence" }) {
  const tags = useMemo(() => {
    const areaSet = new Set();
    const seqSet = new Set();
    for (const item of items) {
      if (item.area) areaSet.add(String(item.area).trim());
      if (item.sequence_number) seqSet.add(String(item.sequence_number).trim());
      if (item.area_sequence) areaSet.add(String(item.area_sequence).trim());
      if (item.project_area) areaSet.add(String(item.project_area).trim());
    }
    const areas = [...areaSet].filter(Boolean).sort().map((a) => ({ type: "area", value: a, label: a }));
    const seqs = [...seqSet].filter(Boolean).sort().map((s) => ({ type: "seq", value: s, label: s }));
    return [...areas, ...seqs];
  }, [items]);

  if (tags.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{
        fontSize: 8, fontFamily: "var(--font-mono)", fontWeight: 900,
        color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase",
      }}>
        {label}
      </span>
      <button type="button" style={chipStyle(!value)} onClick={() => onChange(null)}>All</button>
      {tags.map((tag) => (
        <button
          key={`${tag.type}:${tag.value}`}
          type="button"
          style={chipStyle(value === tag.value)}
          onClick={() => onChange(value === tag.value ? null : tag.value)}
        >
          {tag.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Filter function: returns true if the item matches the sequence filter value.
 * Works with any entity that has area, sequence_number, area_sequence,
 * project_area, zone, or install_phase fields.
 */
export function matchesSequenceFilter(item, filterValue) {
  if (!filterValue) return true;
  const v = String(filterValue).toLowerCase().trim();
  return (
    String(item.area || "").toLowerCase().trim() === v ||
    String(item.sequence_number || "").toLowerCase().trim() === v ||
    String(item.area_sequence || "").toLowerCase().trim() === v ||
    String(item.project_area || "").toLowerCase().trim() === v ||
    String(item.zone || "").toLowerCase().trim() === v ||
    String(item.install_phase || "").toLowerCase().trim() === v
  );
}
