/**
 * Presentational KPI / filter chrome for Contacts page.
 */
// @ts-nocheck
import React from "react";
import { KpiTile } from "@/components/design-system";
import {
  CONTACT_TYPE_COLORS,
  CONTACT_TYPE_FILTER_OPTIONS,
} from "./contactsPageHelpers";

export function ContactsKpiStrip({ stats, filterType, onToggleType }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total" value={stats.total} color="var(--accent)"
        active={filterType === "all"} onClick={() => onToggleType("all")} />
      <KpiTile compact label="Owner" value={stats.owner} color={CONTACT_TYPE_COLORS.Owner}
        active={filterType === "Owner"} onClick={() => onToggleType("Owner")} />
      <KpiTile compact label="GC" value={stats.gc} color={CONTACT_TYPE_COLORS.GC}
        active={filterType === "GC"} onClick={() => onToggleType("GC")} />
      <KpiTile compact label="Engineer" value={stats.engineer} color={CONTACT_TYPE_COLORS.Engineer}
        active={filterType === "Engineer"} onClick={() => onToggleType("Engineer")} />
      <KpiTile compact label="Subs" value={stats.subcontractor} color={CONTACT_TYPE_COLORS.Subcontractor}
        active={filterType === "Subcontractor"} onClick={() => onToggleType("Subcontractor")} />
      <KpiTile compact label="Supplier" value={stats.supplier} color={CONTACT_TYPE_COLORS.Supplier}
        active={filterType === "Supplier"} onClick={() => onToggleType("Supplier")} />
      <KpiTile compact label="Inspector" value={stats.inspector} color={CONTACT_TYPE_COLORS.Inspector}
        active={filterType === "Inspector"} onClick={() => onToggleType("Inspector")} />
      <KpiTile compact label="Internal" value={stats.internal} color={CONTACT_TYPE_COLORS.Internal}
        active={filterType === "Internal"} onClick={() => onToggleType("Internal")} />
    </div>
  );
}

export function ContactsSearchBar({ search, onSearch }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{
        position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
        fontSize: 14, color: "var(--text-muted)", pointerEvents: "none",
      }}>🔍</span>
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search by name, company, email, or role..."
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-input)",
          padding: "10px 14px 10px 38px",
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          fontSize: 13,
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
      {search && (
        <button
          onClick={() => onSearch("")}
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", color: "var(--text-muted)",
            cursor: "pointer", fontSize: 14, padding: 4,
          }}
        >✕</button>
      )}
    </div>
  );
}

export function ContactsFilterBar({
  filterType,
  view,
  onFilterType,
  onView,
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", flex: 1 }}>
        {CONTACT_TYPE_FILTER_OPTIONS.map((t) => {
          const isActive = filterType === t;
          const typeColor = t !== "all" ? CONTACT_TYPE_COLORS[t] : null;
          return (
            <button
              key={t}
              onClick={() => onFilterType(t)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-btn)",
                border: isActive
                  ? `1px solid ${typeColor || "var(--accent)"}`
                  : "1px solid var(--divider)",
                background: isActive
                  ? `${typeColor || "var(--accent)"}18`
                  : "var(--bg-surface)",
                color: isActive
                  ? (typeColor || "var(--accent)")
                  : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                boxShadow: isActive ? `0 0 0 1px ${typeColor || "var(--accent)"}44` : "none",
                transition: "all 0.15s ease",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {["grid", "list"].map((v) => (
          <button
            key={v}
            onClick={() => onView(v)}
            style={{
              padding: "6px 10px",
              borderRadius: "var(--radius-btn)",
              border: view === v ? "1px solid var(--accent)" : "1px solid var(--divider)",
              background: view === v ? "rgba(200,155,32,0.12)" : "var(--bg-surface)",
              color: view === v ? "var(--accent)" : "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {v === "grid" ? "⊞ Grid" : "≡ List"}
          </button>
        ))}
      </div>
    </div>
  );
}
