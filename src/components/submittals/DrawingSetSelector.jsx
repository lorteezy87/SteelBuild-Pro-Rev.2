// DrawingSetSelector — create-time drawing-set linker for the New
// Submittal modal. Pure-presentational; the parent owns state. The
// chip styling mirrors LinkedDrawingSets (the detail-panel picker)
// so the visual language stays consistent across surfaces.
//
// Design notes:
//   • Reads a single string[] (`value`) of drawing_set ids and emits
//     the next array via onChange — no internal selection state.
//   • Search input filters by set_name / discipline / revision
//     (case-insensitive substring match) so the user can narrow long
//     lists without leaving the keyboard.
//   • Soft-deleted sets are filtered out before rendering. Already-
//     selected sets surface with the accent treatment; remaining
//     sets render as dashed pills you click to add.
//
// Pure helpers `filterDrawingSets` and `toggleSetId` are exported for
// unit tests so we can verify the selection mechanics without
// standing up a DOM (vitest runs in node). The component itself stays
// uncovered by tests, which is consistent with the rest of the codebase.

import React from "react";
import { formatDrawingSetNumber, sortDrawingSetPackages } from "@/lib/drawingSetOrdering";

// ── Pure helpers (exported for tests) ──────────────────────────────

/**
 * Filter a list of drawing sets by query string. Skips soft-deleted
 * sets and matches against name, discipline, and revision (the three
 * fields a user is likely to recall when searching).
 */
export function filterDrawingSets(sets, query) {
  const q = String(query || "").trim().toLowerCase();
  const live = (sets || []).filter((s) => s && !s.is_deleted);
  if (!q) return sortDrawingSetPackages(live);
  return sortDrawingSetPackages(live.filter((s) => {
    const haystack = [
      formatDrawingSetNumber(s),
      s.set_name || "",
      s.discipline || "",
      s.revision ? `r${s.revision}` : "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  }));
}

/**
 * Toggle a set id's membership in the current selection array.
 * Returns a new array (no mutation). Idempotent — toggling an absent
 * id adds it; toggling a present id removes it.
 */
export function toggleSetId(value, id) {
  const arr = Array.isArray(value) ? value : [];
  if (!id) return arr;
  if (arr.includes(id)) return arr.filter((v) => v !== id);
  return [...arr, id];
}

// ── Component ──────────────────────────────────────────────────────

export default function DrawingSetSelector({
  value = [],
  onChange,
  availableSets = [],
}) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () => filterDrawingSets(availableSets, query),
    [availableSets, query],
  );

  const selectedSet = new Set(Array.isArray(value) ? value : []);

  const toggle = (id) => {
    if (!onChange) return;
    onChange(toggleSetId(value, id));
  };

  return (
    <div>
      <input
        type="search"
        className="sbd-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search drawing sets…"
        style={{
          width: "100%",
          padding: "6px 10px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          background: "var(--bg-input, var(--bg-surface-low))",
          border: "1px solid var(--border-default)",
          borderRadius: 4,
          color: "var(--text-primary)",
          outline: "none",
          marginBottom: 8,
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {filtered.length === 0 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            {availableSets.length === 0
              ? "No drawing sets in this project yet."
              : "No drawing sets match that search."}
          </span>
        )}
        {filtered.map((set) => {
          const isSelected = selectedSet.has(set.id);
          const setNumber = formatDrawingSetNumber(set);
          const label = `Set # ${setNumber} · ${set.set_name || "(unnamed set)"}${
            set.revision ? ` · R${set.revision}` : ""
          }`;
          return (
            <button
              key={set.id}
              type="button"
              onClick={() => toggle(set.id)}
              title={set.discipline ? `${label} · ${set.discipline}` : label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                borderRadius: 999,
                background: isSelected
                  ? "var(--accent-muted)"
                  : "transparent",
                color: isSelected ? "var(--accent)" : "var(--text-secondary)",
                border: isSelected
                  ? "1px solid var(--accent)"
                  : "1px dashed var(--border-default)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.05em",
                cursor: "pointer",
                maxWidth: 360,
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {isSelected ? "✓ " : "+ "}
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {value.length > 0 && (
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {value.length} set{value.length === 1 ? "" : "s"} linked
        </div>
      )}
    </div>
  );
}
