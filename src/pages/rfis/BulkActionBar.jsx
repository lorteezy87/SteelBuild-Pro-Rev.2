/**
 * BulkActionBar — the accent-bg strip that appears when one or more
 * RFIs are checkbox-selected. Status / priority quick-set buttons,
 * export-subset, delete-subset, and clear-selection. The mutation
 * hook lives in the page shell; we just call `onSetStatus`,
 * `onSetPriority`, `onExportSelected`, `onRequestDelete`, `onClear`.
 */

import React from "react";
import { mono, statusColumns, STATUS_CFG, PRIORITY_CFG, PRIORITIES } from "./constants";

export default function BulkActionBar({
  selectedCount,
  onSetStatus,
  onSetPriority,
  onExportSelected,
  onRequestDelete,
  onClear,
}) {
  if (!selectedCount) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", background: "var(--accent-muted)", borderBottom: "1px solid var(--accent)", flexShrink: 0, flexWrap: "wrap" }}>
      <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--accent)" }}>{selectedCount} selected</span>
      <span style={{ color: "var(--divider)" }}>|</span>
      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>SET STATUS →</span>
      {statusColumns.map((s) => (
        <button
          key={s}
          onClick={() => onSetStatus(s)}
          style={{ padding: "3px 10px", borderRadius: 4, border: `1px solid ${STATUS_CFG[s]?.color || "var(--border-default)"}`, background: `${STATUS_CFG[s]?.color || "var(--accent)"}18`, color: STATUS_CFG[s]?.color || "var(--accent)", ...mono, fontSize: 8, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}
        >
          {s}
        </button>
      ))}
      <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>SET PRIORITY →</span>
      {PRIORITIES.map((p) => (
        <button
          key={p}
          onClick={() => onSetPriority(p)}
          style={{ padding: "3px 10px", borderRadius: 4, border: `1px solid ${PRIORITY_CFG[p]?.color || "var(--border-default)"}`, background: `${PRIORITY_CFG[p]?.color || "var(--accent)"}18`, color: PRIORITY_CFG[p]?.color || "var(--text-muted)", ...mono, fontSize: 8, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}
        >
          {p}
        </button>
      ))}
      <button
        onClick={onExportSelected}
        style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", color: "var(--text-secondary)", ...mono, fontSize: 8, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}
      >
        ↓ Export {selectedCount}
      </button>
      <button
        onClick={onRequestDelete}
        style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid var(--status-error)", background: "var(--danger-muted)", color: "var(--status-error)", ...mono, fontSize: 8, fontWeight: 700, cursor: "pointer" }}
      >
        ✕ Delete {selectedCount}
      </button>
      <button
        onClick={onClear}
        style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-muted)", ...mono, fontSize: 8, fontWeight: 700, cursor: "pointer" }}
      >
        ✕ Clear
      </button>
    </div>
  );
}
