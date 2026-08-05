/**
 * Presentational UI for Scope & Exclusions.
 */
// @ts-nocheck
import React from "react";
import { Check, X, Info, Search, Upload } from "lucide-react";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import {
  SCOPE_TYPES,
  SCOPE_CATEGORIES,
  SCOPE_TYPE_COLORS,
  scopeChipBtnStyle as chipBtn,
} from "./scopeExclusionsHelpers";

export { chipBtn };

export const TYPE_META = {
  Scope: { color: SCOPE_TYPE_COLORS.Scope, Icon: Check },
  Exclusion: { color: SCOPE_TYPE_COLORS.Exclusion, Icon: X },
  Clarification: { color: SCOPE_TYPE_COLORS.Clarification, Icon: Info },
};

export function ScopeCommandBar({
  projectName,
  filteredCount,
  total,
  subtitle,
  projectId,
  onBulkImport,
  onNewItem,
}) {
  return (
    <CommandBar
      eyebrow={projectName || "ALL PROJECTS"}
      title="Scope & Exclusions"
      count={filteredCount}
      unit={` OF ${total}`}
      subtitle={subtitle}
    >
      <Button variant="secondary" onClick={onBulkImport} disabled={!projectId} title={!projectId ? "Select a project first" : "Bulk import scope items"}>
        <Upload size={12} /> Bulk Import
      </Button>
      <Button variant="primary" icon="plus" onClick={onNewItem}>
        New Item
      </Button>
    </CommandBar>
  );
}

export function ScopeKpiStrip({ stats, filterType, onFilterType }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total" value={stats.total} color="var(--accent)"
        active={filterType === "all"} onClick={() => onFilterType("all")} />
      <KpiTile compact label="Scope" value={stats.scope} color="var(--status-success)"
        active={filterType === "Scope"} onClick={() => onFilterType(filterType === "Scope" ? "all" : "Scope")} />
      <KpiTile compact label="Exclusion" value={stats.exclusion} color="var(--status-error)"
        active={filterType === "Exclusion"} onClick={() => onFilterType(filterType === "Exclusion" ? "all" : "Exclusion")} />
      <KpiTile compact label="Clarification" value={stats.clarification} color="var(--status-info)"
        active={filterType === "Clarification"} onClick={() => onFilterType(filterType === "Clarification" ? "all" : "Clarification")} />
    </div>
  );
}

export function ScopeSearchBar({ search, onSearchChange, hideCompleted, onHideCompletedChange }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: "8px 12px",
      }}
    >
      <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Filter by keyword — description, notes, category…"
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          fontSize: 12,
        }}
      />
      {search && (
        <button
          onClick={() => onSearchChange("")}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            padding: 2,
          }}
          aria-label="Clear search"
        >
          <X size={12} />
        </button>
      )}
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          paddingLeft: 12,
          borderLeft: "1px solid var(--border-default)",
          marginLeft: 4,
          flexShrink: 0,
          userSelect: "none",
        }}
        title="Hide items that have been marked complete"
      >
        <input
          type="checkbox"
          checked={hideCompleted}
          onChange={(e) => onHideCompletedChange(e.target.checked)}
          style={{ accentColor: "var(--status-success)", cursor: "pointer" }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Hide Completed
        </span>
      </label>
    </div>
  );
}

export function ScopeFilterBars({ filterType, filterCategory, onFilterType, onFilterCategory }) {
  return (
    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Type:
        </span>
        <div
          style={{
            display: "inline-flex",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: 2,
            gap: 2,
          }}
        >
          {["all", ...SCOPE_TYPES].map((type) => {
            const active = filterType === type;
            const meta = TYPE_META[type];
            const Icon = meta?.Icon;
            return (
              <button
                key={type}
                onClick={() => onFilterType(type)}
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "white" : "var(--text-secondary)",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {Icon && <Icon size={10} strokeWidth={3} />}
                {type === "all" ? "All" : type}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", overflowX: "auto" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Category:
        </span>
        {["all", ...SCOPE_CATEGORIES].map((cat) => {
          const active = filterCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => onFilterCategory(cat)}
              style={{
                background: active ? "var(--accent)" : "var(--bg-surface)",
                color: active ? "white" : "var(--text-secondary)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`,
                borderRadius: "6px",
                padding: "6px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
              }}
            >
              {cat === "all" ? "All" : cat}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ScopeBulkActionBar({
  selectedCount,
  bulkActionBusy,
  onApplyBulk,
  onBulkDelete,
  onClear,
}) {
  return (
    <div style={{
      position: "sticky", top: 60, zIndex: 20,
      background: "var(--bg-surface)",
      border: "1px solid var(--accent)",
      borderLeft: "3px solid var(--accent)",
      borderRadius: 4,
      padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {selectedCount} SELECTED
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Set Type:
      </span>
      {SCOPE_TYPES.map((t) => (
        <button key={t} onClick={() => onApplyBulk({ item_type: t })} disabled={bulkActionBusy} style={chipBtn}>
          {t}
        </button>
      ))}
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Set Category:
      </span>
      <select
        disabled={bulkActionBusy}
        onChange={(e) => { if (e.target.value) onApplyBulk({ category: e.target.value }); e.target.value = ""; }}
        style={{
          background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 2,
          padding: "4px 8px", color: "var(--text-primary)",
          fontFamily: "var(--font-mono)", fontSize: 10,
        }}
        defaultValue=""
      >
        <option value="">—</option>
        {SCOPE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button onClick={() => onApplyBulk({ in_progress: true, in_progress_at: new Date().toISOString() })} disabled={bulkActionBusy} style={chipBtn}>
        Mark In Progress
      </button>
      <button onClick={() => onApplyBulk({ in_progress: false, in_progress_at: null })} disabled={bulkActionBusy} style={chipBtn}>
        Clear In Progress
      </button>
      <button onClick={() => onApplyBulk({ is_completed: true, completed_at: new Date().toISOString(), in_progress: false, in_progress_at: null })} disabled={bulkActionBusy} style={chipBtn}>
        Mark Complete
      </button>
      <button onClick={() => onApplyBulk({ is_completed: false, completed_at: null })} disabled={bulkActionBusy} style={chipBtn}>
        Mark Incomplete
      </button>
      <button onClick={onBulkDelete} disabled={bulkActionBusy} style={{ ...chipBtn, color: "var(--status-error)", borderColor: "var(--status-error)" }}>
        Delete
      </button>
      <button onClick={onClear} style={{ ...chipBtn, marginLeft: "auto" }}>
        Clear
      </button>
    </div>
  );
}
