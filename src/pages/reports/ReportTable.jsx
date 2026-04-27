/**
 * ReportTable — generic sortable, sticky-header data table for reports.
 *
 * Drives the 8 tabular reports (every report except Portfolio Overview,
 * Project Status (Gantt), and Revenue Dashboard, which have their own
 * shapes). Schema:
 *
 *   columns: Array<{
 *     key: string,            // row[key] used for value & default sort
 *     label: string,          // column header text
 *     align?: 'left'|'right'|'center',
 *     sortable?: boolean,     // default true
 *     width?: string,         // CSS grid track size; auto if omitted
 *     render?: (row) => ReactNode,  // custom cell render
 *     sortValue?: (row) => any,     // override sort key (e.g. for nested values)
 *   }>
 *   rows:   Array<object>
 *   initialSort?: { key: string, dir: 'asc'|'desc' }
 *   onRowClick?: (row) => void
 *   emptyText?: string
 *   minWidth?: number
 *
 * The table owns its own sort state. Reports that need to drive sort
 * externally can read it via `onSortChange`.
 */

import React, { useMemo, useState } from "react";
import { mono, body, CARD, LABEL } from "./constants";

function defaultGridTemplate(columns) {
  return columns
    .map((c) => c.width || "minmax(80px, 1fr)")
    .join(" ");
}

export default function ReportTable({
  columns,
  rows,
  initialSort,
  onRowClick,
  emptyText = "No rows match the current filters.",
  minWidth = 720,
  onSortChange,
}) {
  const [sortKey, setSortKey] = useState(initialSort?.key || columns[0]?.key);
  const [sortDir, setSortDir] = useState(initialSort?.dir || "asc");

  const handleSort = (col) => {
    if (col.sortable === false) return;
    if (col.key === sortKey) {
      const next = sortDir === "asc" ? "desc" : "asc";
      setSortDir(next);
      onSortChange?.({ key: sortKey, dir: next });
    } else {
      setSortKey(col.key);
      setSortDir("asc");
      onSortChange?.({ key: col.key, dir: "asc" });
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    const get = col?.sortValue || ((r) => r?.[sortKey]);
    const copy = [...rows];
    copy.sort((a, b) => {
      let av = get(a);
      let bv = get(b);
      // Nulls sort last regardless of direction.
      if (av === null || av === undefined || av === "") return 1;
      if (bv === null || bv === undefined || bv === "") return -1;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir, columns]);

  const gridCols = defaultGridTemplate(columns);

  return (
    <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            padding: "9px 16px",
            gap: 10,
            background: "var(--bg-surface-low)",
            borderBottom: "1px solid var(--divider)",
            position: "sticky",
            top: 0,
            zIndex: 2,
            minWidth,
          }}
        >
          {columns.map((col) => {
            const isActive = col.key === sortKey;
            const align = col.align || "left";
            const justify =
              align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
            return (
              <button
                key={col.key}
                onClick={() => handleSort(col)}
                disabled={col.sortable === false}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: justify,
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: col.sortable === false ? "default" : "pointer",
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  ...LABEL,
                  fontSize: 8,
                }}
              >
                <span>{col.label}</span>
                {isActive && (
                  <span style={{ ...mono, fontSize: 8, color: "var(--accent)" }}>
                    {sortDir === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Rows */}
        {sortedRows.length === 0 ? (
          <div
            style={{
              padding: "48px 16px",
              textAlign: "center",
              ...mono,
              fontSize: 10,
              color: "var(--text-muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {emptyText}
          </div>
        ) : (
          sortedRows.map((row, idx) => (
            <div
              key={row.id || row._key || idx}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                padding: "10px 16px",
                gap: 10,
                borderBottom:
                  idx === sortedRows.length - 1 ? "none" : "1px solid var(--divider)",
                alignItems: "center",
                minWidth,
                cursor: onRowClick ? "pointer" : "default",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                if (onRowClick) e.currentTarget.style.background = "var(--bg-row-hover)";
              }}
              onMouseLeave={(e) => {
                if (onRowClick) e.currentTarget.style.background = "transparent";
              }}
            >
              {columns.map((col) => {
                const align = col.align || "left";
                const justify =
                  align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
                const content = col.render ? col.render(row) : row[col.key];
                return (
                  <div
                    key={col.key}
                    style={{
                      display: "flex",
                      justifyContent: justify,
                      alignItems: "center",
                      ...body,
                      fontSize: 12,
                      color: "var(--text-primary)",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {content === null || content === undefined || content === "" ? (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    ) : (
                      content
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
