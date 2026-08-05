/**
 * SequenceFilter — cross-module area/sequence chip filter.
 *
 * Extracts unique area and sequence_number values from any entity array
 * and renders a row of toggle chips.  Compatible with work packages,
 * deliveries, RFIs, constraints, and any other entity that carries
 * area, sequence_number, area_sequence, zone, or project_area fields.
 */

import React, { useMemo } from "react";
import { buildSequenceFilterTags, sequenceFilterChipStyle } from "./sequenceFilterHelpers";

const chipStyle = sequenceFilterChipStyle;

export default function SequenceFilter({ items = [], value, onChange, label = "Area / Sequence" }) {
  // Natural (numeric-aware) sort so steel sequences order 1, 2, 10 — not the
  // lexical 1, 10, 2 a bare String.sort() produces. Values are already strings.
  const tags = useMemo(() => buildSequenceFilterTags(items), [items]);

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
