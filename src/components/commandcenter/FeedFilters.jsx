import React, { useState, useEffect, useCallback } from "react";

/**
 * Chip bar filters above the Action Feed.
 *
 * Filters:
 *  - Project (multi-select)
 *  - Item type (multi-select)
 *  - Owner / waiting-on (multi-select)
 *  - Search input (debounced 250ms)
 */

const chipBase = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.06em",
  padding: "4px 10px",
  borderRadius: 2,
  cursor: "pointer",
  textTransform: "uppercase",
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface-low)",
  color: "var(--text-secondary)",
  transition: "all 0.12s",
};

const chipActive = {
  ...chipBase,
  border: "1px solid var(--accent)",
  background: "var(--accent-muted)",
  color: "var(--accent)",
};

const ITEM_TYPES = ["RFI", "DWG", "SUB", "CO", "DEL", "WP", "PAY", "NOTE"];

function ChipToggle({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={active ? chipActive : chipBase}>
      {label}
    </button>
  );
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function FeedFilters({
  projects = [],
  owners = [],
  filters,
  onFilterChange,
}) {
  const {
    projectIds = [],
    itemTypes = [],
    ownerFilter = [],
    search = "",
  } = filters;

  const [localSearch, setLocalSearch] = useState(search);
  const debouncedSearch = useDebounce(localSearch, 250);

  useEffect(() => {
    if (debouncedSearch !== search) {
      onFilterChange({ ...filters, search: debouncedSearch });
    }
  }, [debouncedSearch, search, onFilterChange, filters]);

  const toggleInArray = useCallback(
    (key, value) => {
      const arr = filters[key] || [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      onFilterChange({ ...filters, [key]: next });
    },
    [filters, onFilterChange]
  );

  const activeCount =
    projectIds.length + itemTypes.length + ownerFilter.length + (search ? 1 : 0);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {/* Item type chips */}
      {ITEM_TYPES.map((t) => (
        <ChipToggle
          key={t}
          label={t}
          active={itemTypes.includes(t)}
          onClick={() => toggleInArray("itemTypes", t)}
        />
      ))}

      <span style={{ width: 1, height: 18, background: "var(--divider)", margin: "0 4px" }} />

      {/* Project chips — show project_number for brevity */}
      {projects.slice(0, 12).map((p) => (
        <ChipToggle
          key={p.id}
          label={p.project_number || p.name?.slice(0, 8) || "?"}
          active={projectIds.includes(p.id)}
          onClick={() => toggleInArray("projectIds", p.id)}
        />
      ))}

      {projects.length > 12 && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
          +{projects.length - 12}
        </span>
      )}

      <span style={{ width: 1, height: 18, background: "var(--divider)", margin: "0 4px" }} />

      {/* Owner chips */}
      {owners.slice(0, 8).map((o) => (
        <ChipToggle
          key={o}
          label={o}
          active={ownerFilter.includes(o)}
          onClick={() => toggleInArray("ownerFilter", o)}
        />
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search */}
      <input
        type="text"
        placeholder="Search items..."
        value={localSearch}
        onChange={(e) => setLocalSearch(e.target.value)}
        style={{
          width: 180,
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: 4,
          padding: "5px 10px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          fontSize: 11,
          outline: "none",
        }}
      />

      {/* Clear */}
      {activeCount > 0 && (
        <button
          onClick={() =>
            onFilterChange({ projectIds: [], itemTypes: [], ownerFilter: [], search: "" })
          }
          style={{
            ...chipBase,
            color: "var(--status-error)",
            border: "1px solid rgba(248,81,73,0.3)",
            background: "rgba(248,81,73,0.06)",
          }}
        >
          CLEAR ({activeCount})
        </button>
      )}
    </div>
  );
}
