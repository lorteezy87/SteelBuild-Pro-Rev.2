/**
 * ReportFilters — common filter UI bits for individual reports.
 *
 * Three composable atoms reports drop in à la carte:
 *
 *   - <SearchInput value onChange placeholder />
 *   - <SelectFilter label value onChange options={[{key,label}]} />
 *   - <ToggleGroup options active onChange />  (segmented control)
 *
 * Plus <FilterBar> which lays them out in a flex row matching the
 * portfolio dashboard's filter strip.
 */

import React from "react";
import { mono, body } from "./constants";

export function FilterBar({ children }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {children}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search..." }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        flex: 1,
        minWidth: 240,
        background: "var(--bg-input)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-input)",
        padding: "9px 12px",
        color: "var(--text-primary)",
        ...body,
        fontSize: 12,
      }}
    />
  );
}

export function SelectFilter({ label, value, onChange, options }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {label && (
        <span
          style={{
            ...mono,
            fontSize: 9,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            fontWeight: 700,
          }}
        >
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-input)",
          padding: "8px 10px",
          color: "var(--text-primary)",
          ...body,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleGroup({ options, active, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {options.map((o, i) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          style={{
            background: active === o.key ? "var(--accent-muted)" : "transparent",
            color: active === o.key ? "var(--accent)" : "var(--text-secondary)",
            border: "none",
            borderRight: i < options.length - 1 ? "1px solid var(--border-default)" : "none",
            padding: "8px 12px",
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
