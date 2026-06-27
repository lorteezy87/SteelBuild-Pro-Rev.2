/**
 * FilterBar — consolidated search + phase pills + status pills for the
 * Work Packages page. Holds no state; the parent owns every field.
 *
 * `activeFilterCount` drives the "CLEAR (n)" button visibility.
 */

import React from "react";
import { PHASE_COLORS, PHASE_HEX, STATUS_COLORS, STATUS_COLUMNS, PHASES } from "./constants";
import PhaseIcon from "./PhaseIcon";

export default function FilterBar({
  search, onSearchChange,
  filterPhase, onPhaseChange,
  filterStatus, onStatusChange,
  activeFilterCount, onClear,
}) {
  return (
    <div
      className="filter-bar-responsive"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        flexWrap: "wrap",
      }}
    >
      {/* Search */}
      <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200, maxWidth: 360 }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
          <circle cx="7" cy="7" r="5.5" stroke="var(--text-muted)" strokeWidth="1.5" />
          <line x1="11" y1="11" x2="14.5" y2="14.5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by drawing #, sequence, or area..."
          style={{
            width: "100%",
            padding: "7px 12px 7px 30px",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-input)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            outline: "none",
          }}
        />
      </div>

      <Divider />

      {/* Phase pills */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <Label>PHASE</Label>
        {[{ key: "all", label: "ALL" }, ...PHASES.map((p) => ({ key: p, label: p.toUpperCase().slice(0, 5) }))].map(({ key, label }) => {
          const active = filterPhase === key;
          const phColor = key !== "all" ? PHASE_COLORS[key] : "var(--accent)";
          return (
            <button
              key={key}
              onClick={() => onPhaseChange(key)}
              style={{
                padding: "4px 8px",
                border: active ? `1px solid ${phColor}` : "1px solid transparent",
                borderRadius: "var(--radius-btn)",
                background: active
                  ? `${PHASE_HEX[key] || "rgba(200,155,32,1)"}18`
                  : "var(--bg-surface-low)",
                color: active ? phColor : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.06em",
                cursor: "pointer",
                transition: "all 0.15s",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {key !== "all" && <PhaseIcon phase={key} size={9} />}
              {label}
            </button>
          );
        })}
      </div>

      <Divider />

      {/* Status pills */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <Label>STATUS</Label>
        {[{ key: "all", label: "ALL" }, ...STATUS_COLUMNS.map((s) => ({ key: s, label: s.toUpperCase() }))].map(({ key, label }) => {
          const active = filterStatus === key;
          const stColor = key !== "all" ? STATUS_COLORS[key] : "var(--accent)";
          return (
            <button
              key={key}
              onClick={() => onStatusChange(key)}
              style={{
                padding: "4px 8px",
                border: active ? `1px solid ${stColor}` : "1px solid transparent",
                borderRadius: "var(--radius-btn)",
                background: active ? `${stColor}18` : "var(--bg-surface-low)",
                color:      active ? stColor         : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: "0.06em",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeFilterCount > 0 && (
        <>
          <Divider />
          <button
            onClick={onClear}
            style={{
              padding: "4px 10px",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--accent-border)",
              background: "var(--accent-muted)",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.06em",
            }}
          >
            CLEAR ({activeFilterCount})
          </button>
        </>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 24, background: "var(--divider)", flexShrink: 0 }} />;
}

function Label({ children }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        color: "var(--text-muted)",
        letterSpacing: "0.1em",
        marginRight: 2,
      }}
    >
      {children}
    </span>
  );
}
