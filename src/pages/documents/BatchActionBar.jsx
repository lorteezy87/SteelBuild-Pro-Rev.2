/**
 * BatchActionBar — appears above the document grid when at least one
 * document is selected. Offers select-all / deselect, a "set status"
 * dropdown driven by BATCH_STATUS_OPTIONS, bulk download, and a
 * two-click confirm bulk delete.
 */

import React, { useState } from "react";
import { CheckSquare, XCircle, Download, Trash2, ChevronDown, FolderInput } from "lucide-react";
import { BATCH_STATUS_OPTIONS, batchBtnStyle } from "./constants";

export default function BatchActionBar({
  selectedCount,
  filteredCount,
  onSelectAll,
  onDeselectAll,
  onSetStatus,
  isSettingStatus,
  onBulkDownload,
  onBulkMove,
  onBulkDelete,
  isBulkDeleting,
  confirmBulkDelete,
  onConfirmBulkDelete,
  onCancelBulkDelete,
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  if (selectedCount === 0) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 16px",
      background: "rgba(16,185,129,0.06)",
      border: "1px solid rgba(16,185,129,0.20)",
      borderRadius: 10,
      animation: "fadeIn 0.15s ease-out",
    }}>
      <CheckSquare size={16} style={{ color: "var(--status-success)" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--status-success)" }}>
        {selectedCount} SELECTED
      </span>
      <div style={{ width: 1, height: 20, background: "var(--bg-surface-high)" }} />

      <button onClick={onSelectAll} style={batchBtnStyle("var(--bg-surface-high)", "var(--border-default)", "var(--text-secondary)")}>
        SELECT ALL ({filteredCount})
      </button>
      <button onClick={onDeselectAll} style={batchBtnStyle("var(--bg-surface-high)", "var(--border-default)", "var(--text-secondary)")}>
        <XCircle size={12} /> DESELECT
      </button>

      <div style={{ width: 1, height: 20, background: "var(--bg-surface-high)" }} />

      <div style={{ position: "relative" }}>
        <button
          onClick={() => setStatusOpen((o) => !o)}
          disabled={isSettingStatus}
          style={batchBtnStyle("rgba(59,130,246,0.10)", "rgba(59,130,246,0.25)", "#3b82f6")}
        >
          SET STATUS <ChevronDown size={10} />
        </button>
        {statusOpen && (
          <>
            <div onClick={() => setStatusOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              zIndex: 100,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              padding: 4,
              minWidth: 180,
              boxShadow: "0 12px 32px rgba(0,0,0,0.60)",
            }}>
              {BATCH_STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { onSetStatus(s); setStatusOpen(false); }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-secondary)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-high)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button onClick={onBulkDownload} style={batchBtnStyle("rgba(13,148,136,0.10)", "rgba(13,148,136,0.25)", "#0d9488")}>
        <Download size={12} /> DOWNLOAD
      </button>

      {onBulkMove && (
        // Brand --accent (industrial gold) — stays inside the
        // no-purple/no-pink palette the rest of the app uses.
        <button onClick={onBulkMove} style={batchBtnStyle("var(--accent-muted)", "var(--accent-border)", "var(--accent)")}>
          <FolderInput size={12} /> MOVE TO…
        </button>
      )}

      {!confirmBulkDelete ? (
        <button onClick={onBulkDelete} style={batchBtnStyle("rgba(239,68,68,0.08)", "rgba(239,68,68,0.25)", "#ef4444")}>
          <Trash2 size={12} /> DELETE
        </button>
      ) : (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#ef4444", fontWeight: 700 }}>
            DELETE {selectedCount}?
          </span>
          <button
            onClick={onConfirmBulkDelete}
            disabled={isBulkDeleting}
            style={batchBtnStyle("rgba(239,68,68,0.20)", "rgba(239,68,68,0.40)", "#ef4444")}
          >
            {isBulkDeleting ? "..." : "CONFIRM"}
          </button>
          <button onClick={onCancelBulkDelete} style={batchBtnStyle("var(--bg-surface-high)", "var(--border-default)", "var(--text-muted)")}>
            CANCEL
          </button>
        </div>
      )}
    </div>
  );
}
