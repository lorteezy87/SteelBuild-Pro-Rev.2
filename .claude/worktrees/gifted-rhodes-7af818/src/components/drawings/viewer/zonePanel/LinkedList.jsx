/**
 * LinkedList + LinkedCard — extracted from ZonePanel.jsx.
 *
 * Shared by the RFI / Work Package / Delivery / Photos-Docs tabs.
 * LinkedList renders the empty / loading / list-of-cards branches;
 * LinkedCard renders one row with the record's number, title, status,
 * and an unlink trash button.
 *
 * Pure presentation — receives the hydrated link/record pairs from
 * the parent panel and an onRemove callback for the unlink mutation.
 */

import React from "react";
import { Trash2 } from "lucide-react";
import { LINKABLE_TYPE_LABELS } from "@/lib/drawingHub";
import { mono } from "./zonePanelConstants";

export function LinkedList({ items, isFetching, onRemove, emptyLabel }) {
  if (isFetching && items.length === 0) {
    return (
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>Loading…</div>
    );
  }
  if (items.length === 0) {
    return (
      <div style={{ padding: "24px 4px", textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map(({ link, record }) => (
        <LinkedCard key={link.id} link={link} record={record} onRemove={onRemove} />
      ))}
    </div>
  );
}

export function LinkedCard({ link, record, onRemove }) {
  const orphan = !record;
  // Best-effort title/subtitle for each type.
  const number =
    record?.rfi_number ||
    record?.wp_number ||
    record?.delivery_number ||
    record?.co_number ||
    record?.document_number ||
    record?.sheet_number ||
    null;
  const title =
    record?.subject ||
    record?.name ||
    record?.description ||
    record?.title ||
    "(untitled)";
  const status = record?.status || null;

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--bg-page)",
        border: "1px solid var(--border-default)",
        borderRadius: 3,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          {LINKABLE_TYPE_LABELS[link.linked_record_type] || link.linked_record_type}
          {orphan && <span style={{ color: "var(--status-error)", marginLeft: 6 }}>· MISSING</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: orphan ? "var(--text-muted)" : "var(--text-primary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
          {number && <span style={{ ...mono, color: "var(--accent)", marginRight: 8 }}>{number}</span>}
          {orphan ? "Referenced record not found" : title}
        </div>
        {status && (
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {status}
          </div>
        )}
      </div>
      <button
        onClick={() => { if (window.confirm("Remove this link?")) onRemove?.(link.id); }}
        title="Unlink from zone"
        aria-label="Unlink"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          padding: 4,
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default LinkedList;
