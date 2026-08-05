import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatLocalDate } from "@/utils/dates";
import {
  btnStyle,
  FILE_TYPE_CONFIG,
  DOCUMENT_STATUS_COLORS as STATUS_COLORS,
  DOCUMENT_CATEGORY_COLORS as CATEGORY_COLORS,
  DEFAULT_CATEGORY_STYLE,
} from "./documentCardHelpers";

export default function DocumentCard({ doc, onView, onDownload, onEdit, onLink, onMove, onDelete }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cfg = FILE_TYPE_CONFIG[doc.fileType] || FILE_TYPE_CONFIG.other;
  const statusStyle = STATUS_COLORS[doc.status] || STATUS_COLORS.Draft;
  const catStyle = CATEGORY_COLORS[doc.category] || DEFAULT_CATEGORY_STYLE;
  const fileSizeKb = doc.fileSizeKb ?? doc.file_size_kb;
  const fileSizeMB = fileSizeKb ? (fileSizeKb / 1024).toFixed(1) + " MB" : "\u2014";
  const rawDate = doc.uploadedDate ?? doc.uploaded_date;
  const uploadDate = rawDate ? formatLocalDate(rawDate, "en-US", { month: "short", day: "numeric", year: "numeric" }) : "\u2014";
  const linkedCount = (doc.linkedWorkPackages?.length || 0) + (doc.linkedDeliveries?.length || 0) + (doc.linkedRFIs?.length || 0) + (doc.linkedSubmittals?.length || 0) + (doc.linkedDrawings?.length || 0) + (doc.linkedChangeOrders?.length || 0);

  return (
    <div
      className="sbd-card sbd-card-hover"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      onClick={() => onView?.(doc)}
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid " + (hovered ? "var(--accent-border)" : "var(--bg-surface-high)"),
        borderRadius: 8, padding: 16, cursor: "pointer", transition: "all 0.15s",
        boxShadow: hovered ? "var(--shadow-lg)" : "var(--shadow-card)",
        position: "relative",
      }}
    >
      {/* File type hero badge — vibrant with border */}
      <div style={{
        background: cfg.bg, border: "1px solid " + cfg.border,
        borderRadius: 6, height: 80,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800,
          color: cfg.color, letterSpacing: "0.08em",
        }}>{cfg.icon}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>{doc.documentNumber ?? "\u2014"}</div>
        {doc.revisionNumber != null && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", background: "var(--hover-bg)", padding: "2px 6px", borderRadius: 4 }}>Rev {doc.revisionNumber}</div>}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 2 }}>{doc.displayName ?? doc.fileName ?? "Untitled"}</div>
        {doc.drawingNumber && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{doc.drawingNumber}{doc.discipline ? " \u00B7 " + doc.discipline : ""}</div>}
      </div>

      {/* Pill-style tags for category and status */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {doc.category && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
            padding: "3px 8px",
            background: catStyle.bg, color: catStyle.color,
            border: "1px solid " + catStyle.border,
            borderRadius: 10, letterSpacing: "0.05em", textTransform: "uppercase",
            lineHeight: 1.2,
          }}>{doc.category}</span>
        )}
        {doc.status && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
            padding: "3px 8px",
            background: statusStyle.bg, color: statusStyle.color,
            borderRadius: 10, letterSpacing: "0.05em", textTransform: "uppercase",
            lineHeight: 1.2,
          }}>{doc.status}</span>
        )}
      </div>

      {linkedCount > 0 && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>Linked to {linkedCount} record{linkedCount !== 1 ? "s" : ""}</div>}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>{fileSizeMB} \u00B7 {uploadDate}{doc.uploadedBy && <span> \u00B7 {doc.uploadedBy}</span>}</div>

      {hovered && !confirmDelete && (
        <div style={{ display: "flex", gap: 4, paddingTop: 10, borderTop: "1px solid var(--divider)" }}>
          <button onClick={(e) => { e.stopPropagation(); navigate(createPageUrl("DrawingViewer") + "?docId=" + doc.id); }} style={btnStyle("var(--accent-muted)", "var(--accent-border)", "var(--accent)")}>OPEN</button>
          <button onClick={(e) => { e.stopPropagation(); onDownload?.(doc); }} style={btnStyle()}>DL</button>
          <button onClick={(e) => { e.stopPropagation(); onEdit?.(doc); }} style={btnStyle()}>EDIT</button>
          <button onClick={(e) => { e.stopPropagation(); onLink?.(doc); }} style={btnStyle()}>LINK</button>
          {onMove && (
            <button onClick={(e) => { e.stopPropagation(); onMove(doc); }} style={btnStyle()}>MOVE</button>
          )}
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} style={btnStyle("var(--danger-muted)", "var(--danger-border)", "var(--status-error-bright)")}>DEL</button>
        </div>
      )}
      {confirmDelete && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, padding: "10px 12px", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-error-bright)", marginBottom: 8 }}>DELETE THIS DOCUMENT?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); onDelete?.(doc); }} style={{ flex: 1, padding: "5px 0", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error-bright)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>CONFIRM</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }} style={{ flex: 1, padding: "5px 0", background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}>CANCEL</button>
          </div>
        </div>
      )}
    </div>
  );
}
