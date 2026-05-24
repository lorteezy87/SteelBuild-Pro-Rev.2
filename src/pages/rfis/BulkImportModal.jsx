/**
 * BulkImportModal — the simple paste-lines-to-create-RFIs modal. The
 * parse/mutation logic lives in the page shell (so it can consume
 * the RFI React-Query keys); this component just presents the form
 * and reports back via `onImport(text)` and `onClose()`.
 *
 * This modal is distinct from `RfiLogImportModal` (the AI-powered
 * PDF importer). Kept around because it's useful for typing or
 * copy-pasting a quick batch.
 */

import React from "react";
import { mono } from "./constants";

export default function BulkImportModal({
  open,
  text,
  setText,
  onClose,
  onImport,
  isImporting,
  projectId,
}) {
  if (!open) return null;
  const lines = text.trim() ? text.trim().split("\n").filter(Boolean).length : 0;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 560, background: "var(--bg-surface-secondary)", border: "1px solid var(--border-strong)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}>Bulk Add RFIs</div>
            <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", marginTop: 2 }}>One RFI per line · Format: Subject | Priority | BIC | Due Date | Drawing Ref</div>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginBottom: 6 }}>EXAMPLE:</div>
          <div style={{ ...mono, fontSize: 9, color: "var(--accent)", background: "var(--bg-surface-low)", padding: "6px 10px", borderRadius: 4, marginBottom: 12, lineHeight: 1.7 }}>
            Beam connection at Grid C-4 | Critical | Engineer | 2026-05-01 | S-201<br />
            Anchor bolt layout confirmation | High | GC | 2026-05-10<br />
            Missing embed plate at Column B-7 | High | Architect
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your RFI list here, one per line..."
            autoFocus
            style={{ width: "100%", minHeight: 160, background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "10px 12px", fontSize: 12, color: "var(--text-primary)", outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>
              {lines > 0 ? `${lines} RFIs to import` : "No lines entered"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 4, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", color: "var(--text-muted)", ...mono, fontSize: 9, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button
                disabled={!text.trim() || isImporting || !projectId}
                onClick={onImport}
                style={{ padding: "8px 20px", borderRadius: 4, border: "none", background: "var(--accent)", color: "var(--accent-text)", ...mono, fontSize: 9, fontWeight: 700, cursor: text.trim() && projectId ? "pointer" : "not-allowed", opacity: text.trim() && projectId ? 1 : 0.5 }}
              >
                {isImporting ? "Importing..." : `Import ${lines} RFIs`}
              </button>
            </div>
          </div>
          {!projectId && <div style={{ ...mono, fontSize: 9, color: "var(--status-error)", marginTop: 8 }}>⚠ Select a project first before bulk importing</div>}
        </div>
      </div>
    </div>
  );
}
