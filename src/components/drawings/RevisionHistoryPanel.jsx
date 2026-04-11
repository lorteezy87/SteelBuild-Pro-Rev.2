import React from "react";
import { X, Upload } from "lucide-react";
import { formatDate } from "../shared/formatters";

export default function RevisionHistoryPanel({ drawingSet, onClose, onUploadNewRevision }) {
  if (!drawingSet) return null;

  let history = [];
  try {
    history = JSON.parse(drawingSet.revision_history || "[]");
  } catch {}

  // Build full list: history (old) + current (newest)
  const allRevisions = [
    {
      revisionLabel: drawingSet.current_revision || "Current",
      issueDate: drawingSet.current_issue_date,
      issuedBy: drawingSet.current_issued_by,
      fileUrl: drawingSet.current_file_url,
      sheetCount: drawingSet.sheet_count,
      status: "current",
      notes: "",
    },
    ...history.slice().reverse(),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300 }}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 340,
        background: "var(--bg-surface-low)", borderLeft: "1px solid var(--bg-surface-high)",
        zIndex: 301, display: "flex", flexDirection: "column",
        boxShadow: "-20px 0 50px rgba(0,0,0,0.7)"
      }}>
        {/* Header */}
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--bg-surface-high)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.14em", marginBottom: 4 }}>REVISION HISTORY</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.04em", lineHeight: 1.2 }}>{drawingSet.set_name}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, marginTop: -2 }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 6, letterSpacing: "0.08em" }}>
            {allRevisions.length} REVISION{allRevisions.length !== 1 ? "S" : ""} TOTAL
          </div>
        </div>

        {/* Revision list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {allRevisions.map((rev, i) => {
            const isCurrent = rev.status === "current";
            return (
              <div key={i} style={{
                margin: "4px 12px", borderRadius: 10,
                background: isCurrent ? "var(--accent-muted)" : "var(--hover-bg)",
                border: `1px solid ${isCurrent ? "var(--accent-border)" : "var(--divider)"}`,
                padding: "12px 14px",
              }}>
                {/* Top row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: isCurrent ? "var(--accent)" : "transparent",
                      border: isCurrent ? "none" : "1px solid var(--text-muted)",
                      display: "inline-block"
                    }} />
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, color: isCurrent ? "var(--text-primary)" : "var(--text-muted)", letterSpacing: "0.04em" }}>
                      {rev.revisionLabel}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.10em",
                    padding: "2px 7px", borderRadius: 4,
                    background: isCurrent ? "var(--accent-muted)" : "var(--hover-bg)",
                    color: isCurrent ? "var(--accent)" : "var(--text-muted)",
                  }}>
                    {isCurrent ? "CURRENT" : rev.status === "superseded" ? "SUPERSEDED" : "ARCHIVED"}
                  </span>
                </div>

                {/* Meta */}
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", letterSpacing: "0.06em", lineHeight: 1.7 }}>
                  {rev.issueDate && <div>{formatDate(rev.issueDate)} · {rev.sheetCount || 0} sheets</div>}
                  {rev.issuedBy && <div style={{ color: "var(--accent)" }}>{rev.issuedBy}</div>}
                  {rev.notes && <div style={{ color: "var(--text-secondary)", fontStyle: "italic", fontFamily: "var(--font-body)", fontSize: 10 }}>"{rev.notes}"</div>}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {rev.fileUrl && (
                    <a href={rev.fileUrl} target="_blank" rel="noopener noreferrer" style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "4px 9px", borderRadius: 6, textDecoration: "none",
                      background: "var(--info-muted)", border: "1px solid var(--info-border)",
                      color: "var(--status-info)", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em"
                    }}>↓ DOWNLOAD</a>
                  )}
                  {rev.sheets?.length > 0 && (
                    <button style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 6,
                      background: "var(--hover-bg)", border: "1px solid var(--bg-surface-high)",
                      color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 8,
                      letterSpacing: "0.06em", cursor: "pointer"
                    }}>
                      VIEW {rev.sheets.length} SHEETS
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer — upload new revision */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--bg-surface-high)", flexShrink: 0 }}>
          <button onClick={() => onUploadNewRevision(drawingSet)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "9px 0", borderRadius: 8, cursor: "pointer",
            background: "var(--accent)", border: "none",
            color: "#fff", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.08em"
          }}>
            <Upload style={{ width: 12, height: 12 }} /> UPLOAD NEW REVISION
          </button>
        </div>
      </div>
    </>
  );
}