/**
 * ListView — sortable sticky-header table of documents with vibrant
 * per-row file-type + status badges. Row click opens the detail
 * panel; the checkbox area toggles selection independently.
 */

import React from "react";
import { ArrowUpDown } from "lucide-react";
import { LIST_FILETYPE_STYLES, LIST_STATUS_STYLES, FILETYPE_FALLBACK } from "./utils";
import { formatLocalDate } from "@/utils/dates";

const GRID = "28px 1fr 100px 80px 70px 80px 90px 100px";

const SORTABLE_COLUMNS = [
  { label: "Name",   sort: "name-asc",  sortAlt: "name-desc" },
  { label: "Doc #",  sort: "doc-num",   sortAlt: null },
  { label: "Rev",    sort: null,        sortAlt: null },
  { label: "Type",   sort: null,        sortAlt: null },
  { label: "Status", sort: "status",    sortAlt: null },
  { label: "Size",   sort: "size-desc", sortAlt: "size-asc" },
  { label: "Date",   sort: "date-desc", sortAlt: "date-asc" },
];

export default function ListView({
  filteredDocs,
  selectedIds,
  sortKey,
  onSortChange,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onSelectDoc,
}) {
  const allSelected = selectedIds.size === filteredDocs.length && filteredDocs.length > 0;

  return (
    <div style={{ overflowY: "auto", overflowX: "auto", WebkitOverflowScrolling: "touch", flex: 1 }}>
      {/* Sticky sortable header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          gap: 8,
          padding: "8px 12px",
          borderBottom: "2px solid var(--border-default)",
          position: "sticky",
          top: 0,
          background: "var(--bg-surface-low)",
          zIndex: 2,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          onClick={allSelected ? onDeselectAll : onSelectAll}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              border: "2px solid " + (allSelected ? "var(--status-success)" : "var(--text-muted)"),
              background: allSelected ? "var(--status-success)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              color: "var(--text-primary)",
            }}
          >
            {allSelected ? "\u2713" : ""}
          </div>
        </div>
        {SORTABLE_COLUMNS.map((col) => {
          const isSortable = col.sort !== null;
          const isActive = sortKey === col.sort || sortKey === col.sortAlt;
          return (
            <div
              key={col.label}
              onClick={
                isSortable
                  ? () => {
                      if (sortKey === col.sort && col.sortAlt) onSortChange(col.sortAlt);
                      else onSortChange(col.sort);
                    }
                  : undefined
              }
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fontWeight: 700,
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                cursor: isSortable ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 3,
                userSelect: "none",
                transition: "color 0.15s",
              }}
            >
              {col.label}
              {isSortable && (
                <ArrowUpDown
                  size={9}
                  style={{
                    opacity: isActive ? 1 : 0.3,
                    color: isActive ? "var(--accent)" : "var(--text-muted)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Rows */}
      {filteredDocs.map((doc) => (
        <Row
          key={doc.id}
          doc={doc}
          isSelected={selectedIds.has(doc.id)}
          onToggleSelect={onToggleSelect}
          onOpen={onSelectDoc}
        />
      ))}
    </div>
  );
}

function Row({ doc, isSelected, onToggleSelect, onOpen }) {
  const fsk = doc.fileSizeKb || 0;
  const sizeMB = fsk ? (fsk / 1024).toFixed(1) + " MB" : "\u2014";
  const rawDate = doc.uploadedDate || doc.created_at;
  const dateStr = rawDate
    ? formatLocalDate(rawDate, "en-US", { month: "short", day: "numeric" })
    : "\u2014";

  const typeCfg = LIST_FILETYPE_STYLES[doc.fileType] || FILETYPE_FALLBACK;
  const statusCfg = LIST_STATUS_STYLES[doc.status] || FILETYPE_FALLBACK;

  return (
    <div
      onClick={() => onOpen(doc)}
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 8,
        padding: "8px 12px",
        cursor: "pointer",
        borderBottom: "1px solid var(--divider)",
        background: isSelected ? "var(--success-muted)" : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        onClick={(e) => { e.stopPropagation(); onToggleSelect(doc.id); }}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            border: "2px solid " + (isSelected ? "var(--status-success)" : "var(--text-muted)"),
            background: isSelected ? "var(--status-success)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            color: "var(--text-primary)",
          }}
        >
          {isSelected ? "\u2713" : ""}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 4,
            background: typeCfg.bg,
            color: typeCfg.color,
            flexShrink: 0,
            letterSpacing: "0.04em",
          }}
        >
          {(doc.fileType || "file").toUpperCase().slice(0, 4)}
        </span>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {doc.displayName || doc.fileName || "Untitled"}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", display: "flex", alignItems: "center" }}>
        {doc.documentNumber || "\u2014"}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
        R{doc.revisionNumber || "0"}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", display: "flex", alignItems: "center", textTransform: "uppercase" }}>
        {doc.fileType || "\u2014"}
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 10,
            background: statusCfg.bg,
            color: statusCfg.color,
          }}
        >
          {doc.status || "Draft"}
        </span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
        {sizeMB}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
        {dateStr}
      </div>
    </div>
  );
}
