/**
 * Toolbar — top control row on Documents: title + repo count +
 * Upload / Export / Review-queue / Transmittal buttons on the left;
 * search + sort menu + view-mode toggle on the right.
 */

import React, { useState } from "react";
import {
  Upload, Grid3x3, List, Folder, FileDown, FileSpreadsheet,
  ArrowUpDown, AlertCircle, ChevronDown,
} from "lucide-react";
import { SORT_OPTIONS } from "./constants";

export default function Toolbar({
  allDocumentsCount,
  reviewCount,
  selectedCount,
  searchQuery, onSearchChange,
  sortKey, onSortChange,
  viewMode, onViewModeChange,
  onUploadOpen, onExportCsv, onReviewQueueClick, onTransmittalOpen,
}) {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label || "Sort";

  return (
    <div
      className="filter-bar-responsive"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: "var(--status-warning)" }}>
          {"\u25C8"} DOCUMENT REPOSITORY
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
          {allDocumentsCount} DOC{allDocumentsCount !== 1 ? "S" : ""}
        </span>
        <div style={{ width: 1, height: 24, background: "var(--border-default)" }} />

        <button
          onClick={onUploadOpen}
          style={{
            padding: "6px 12px",
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent)",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Upload size={14} /> UPLOAD
        </button>

        <button
          onClick={onExportCsv}
          title="Export filtered list as CSV"
          style={{
            padding: "6px 12px",
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.25)",
            color: "#3b82f6",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <FileSpreadsheet size={14} /> EXPORT
        </button>

        {reviewCount > 0 && (
          <button
            onClick={onReviewQueueClick}
            style={{
              padding: "6px 12px",
              background: "rgba(234,179,8,0.10)",
              border: "1px solid rgba(234,179,8,0.30)",
              color: "#eab308",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AlertCircle size={14} /> REVIEW QUEUE ({reviewCount})
          </button>
        )}

        {selectedCount > 0 && (
          <button
            onClick={onTransmittalOpen}
            style={{
              padding: "6px 12px",
              background: "rgba(16,185,129,0.10)",
              border: "1px solid rgba(16,185,129,0.35)",
              color: "#10B981",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <FileDown size={14} /> TRANSMITTAL ({selectedCount})
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" }}>
        <input
          type="text"
          placeholder="Search documents, drawings, revisions..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: 240,
            padding: "6px 10px",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            borderRadius: 6,
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}
        />

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowSortMenu((o) => !o)}
            style={{
              padding: "6px 10px",
              background: "var(--bg-surface-high)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ArrowUpDown size={12} /> {sortLabel} <ChevronDown size={10} />
          </button>
          {showSortMenu && (
            <>
              <div onClick={() => setShowSortMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
              <div style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                zIndex: 100,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: 4,
                minWidth: 160,
                boxShadow: "0 12px 32px rgba(0,0,0,0.60)",
              }}>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => { onSortChange(opt.key); setShowSortMenu(false); }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 10px",
                      background: sortKey === opt.key ? "var(--accent-muted)" : "transparent",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: sortKey === opt.key ? "var(--accent)" : "var(--text-secondary)",
                      fontWeight: sortKey === opt.key ? 700 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 2, background: "var(--bg-surface-high)", borderRadius: 6, padding: 2 }}>
          {[
            { mode: "grid",   icon: <Grid3x3 size={14} /> },
            { mode: "list",   icon: <List size={14} /> },
            { mode: "folder", icon: <Folder size={14} /> },
          ].map((item) => (
            <button
              key={item.mode}
              onClick={() => onViewModeChange(item.mode)}
              style={{
                padding: "4px 8px",
                background: viewMode === item.mode ? "var(--accent-muted)" : "transparent",
                border: "none",
                color: viewMode === item.mode ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {item.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
