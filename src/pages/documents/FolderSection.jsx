/**
 * FolderSection — collapsible panel that groups documents by category
 * in the "folder" view mode. Header shows category name + file count;
 * body renders each `DocumentCard` with a selection checkbox overlay.
 */

import React, { useState } from "react";
import DocumentCard from "@/components/dms/DocumentCard";

export default function FolderSection({
  name,
  docs,
  selectedIds,
  onToggleSelect,
  onViewDoc,
  onDownloadDoc,
  onEditDoc,
  onDeleteDoc,
}) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ border: "1px solid var(--divider)", borderRadius: 8, overflow: "hidden" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "var(--hover-bg)",
          cursor: "pointer",
          borderBottom: open ? "1px solid var(--divider)" : "none",
        }}
      >
        <span style={{ fontSize: 14, transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>
          {"\u25B6"}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {name}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>
          {docs.length} file{docs.length !== 1 ? "s" : ""}
        </span>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8, padding: 10 }}>
          {docs.map((doc) => (
            <div key={doc.id} style={{ position: "relative" }}>
              <div
                onClick={(e) => { e.stopPropagation(); onToggleSelect(doc.id); }}
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  zIndex: 10,
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: selectedIds.has(doc.id) ? "var(--status-success)" : "color-mix(in srgb, var(--bg-page) 60%, transparent)",
                  border: "2px solid " + (selectedIds.has(doc.id) ? "var(--status-success)" : "var(--text-muted)"),
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  color: "var(--text-primary)",
                }}
              >
                {selectedIds.has(doc.id) ? "\u2713" : ""}
              </div>
              <DocumentCard
                doc={doc}
                onView={onViewDoc}
                onDownload={onDownloadDoc}
                onEdit={onEditDoc}
                onDelete={onDeleteDoc}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
