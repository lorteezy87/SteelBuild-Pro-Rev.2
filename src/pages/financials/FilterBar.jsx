import React from "react";
import { PhoenixPanel } from "@/components/shared/PhoenixPanel";
import { mono, body } from "./utils";

export const VIEW_TABS = [
  { key: "summary", label: "Project Summary" },
  { key: "sov", label: "SOV Analysis" },
  { key: "budget", label: "Budget Control" },
  { key: "unmapped", label: "Unmapped Costs" },
];

export function SectionTabs({ active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border-default)" }}>
      {VIEW_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          style={{
            background: "transparent",
            color: active === tab.key ? "var(--accent)" : "var(--text-muted)",
            border: "none",
            borderBottom: active === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
            borderRadius: 0,
            padding: "8px 16px",
            marginBottom: -1,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: active === tab.key ? 700 : 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
            transition: "color 0.15s, border-color 0.15s",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ search, setSearch, filterPhase, setFilterPhase, phases }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search cost buckets, SOV lines, vendors, notes..."
        style={{
          minWidth: 280,
          flex: 1,
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-input)",
          padding: "9px 12px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          fontSize: 12,
        }}
      />
      <select
        value={filterPhase}
        onChange={(event) => setFilterPhase(event.target.value)}
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-input)",
          padding: "9px 12px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
        }}
      >
        <option value="all">ALL COST CATEGORIES</option>
        {phases.map((phase) => (
          <option key={phase} value={phase}>
            {phase.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ReviewFlags({ flags }) {
  return (
    <PhoenixPanel title="Review Flags" count={flags.length}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px" }}>
        {flags.length === 0 ? (
          <div style={{ ...mono, fontSize: 9, color: "var(--status-success)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            No immediate financial flags
          </div>
        ) : (
          flags.map((flag) => (
            <div
              key={flag.title}
              style={{
                background: flag.tone === "error" ? "var(--danger-muted)" : "var(--warning-muted)",
                border: `1px solid ${flag.tone === "error" ? "var(--danger-border)" : "var(--warning-border)"}`,
                borderRadius: "var(--radius-card)",
                padding: "10px 12px",
              }}
            >
              <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: flag.tone === "error" ? "var(--status-error)" : "var(--status-warning)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                {flag.title}
              </div>
              <div style={{ ...body, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {flag.body}
              </div>
            </div>
          ))
        )}
      </div>
    </PhoenixPanel>
  );
}
