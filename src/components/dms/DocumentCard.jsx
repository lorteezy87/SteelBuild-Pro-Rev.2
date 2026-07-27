import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatLocalDate } from "@/utils/dates";

/* ── More vibrant file type badges with high contrast ── */
const FILE_TYPE_CONFIG = {
  pdf:   { icon: "PDF",  bg: "var(--danger-muted)", color: "var(--status-error)", border: "var(--danger-border)" },
  dwg:   { icon: "DWG",  bg: "var(--info-muted)", color: "var(--status-info)", border: "var(--info-border)" },
  ifc:   { icon: "IFC",  bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  gltf:  { icon: "3D",   bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  xlsx:  { icon: "XLS",  bg: "var(--success-muted)", color: "var(--status-success)", border: "var(--success-border)" },
  docx:  { icon: "DOC",  bg: "var(--info-muted)", color: "var(--status-info)", border: "var(--info-border)" },
  img:   { icon: "IMG",  bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  zip:   { icon: "ZIP",  bg: "var(--warning-muted)", color: "var(--status-warning)", border: "var(--warning-border)" },
  other: { icon: "FILE", bg: "var(--bg-surface-high)", color: "var(--text-muted)", border: "var(--border-default)" },
};

const STATUS_COLORS = {
  "Approved":                { bg: "var(--success-muted)", color: "var(--status-success)" },
  "Approved as Noted":       { bg: "color-mix(in srgb, var(--status-success) 10%, transparent)", color: "var(--status-success)" },
  "Approved with Comments":  { bg: "color-mix(in srgb, var(--status-success) 10%, transparent)", color: "var(--status-success)" },
  "Under Review":            { bg: "var(--warning-muted)", color: "var(--status-warning)" },
  "Revise & Resubmit":       { bg: "var(--warning-muted)", color: "var(--status-warning)" },
  "Rejected":                { bg: "var(--danger-muted)", color: "var(--status-error)" },
  "Draft":                   { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  "Issued":                  { bg: "var(--info-muted)", color: "var(--status-info)" },
  "Superseded":              { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  "Archived":                { bg: "var(--bg-surface-high)", color: "var(--text-muted)" },
  "Void":                    { bg: "color-mix(in srgb, var(--status-error) 10%, transparent)", color: "var(--status-error)" },
};

/* ── Category pill color map ── */
const CATEGORY_COLORS = {
  "Blueprint":          { bg: "var(--info-muted)", color: "var(--status-info)", border: "var(--info-border)" },
  "Shop Drawing":       { bg: "var(--info-muted)", color: "var(--status-info)", border: "var(--info-border)" },
  "IFC Model":          { bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  "Specification":      { bg: "var(--warning-muted)", color: "var(--status-warning)", border: "var(--warning-border)" },
  "Submittal":          { bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  "Transmittal":        { bg: "var(--success-muted)", color: "var(--status-success)", border: "var(--success-border)" },
  "RFI Response":       { bg: "var(--warning-muted)", color: "var(--status-warning)", border: "var(--warning-border)" },
  "Change Order":       { bg: "var(--danger-muted)", color: "var(--status-error)", border: "var(--danger-border)" },
  "Contract":           { bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  "Photo":              { bg: "var(--accent-muted)", color: "var(--accent)", border: "var(--accent-border)" },
  "Report":             { bg: "var(--bg-surface-high)", color: "var(--text-muted)", border: "var(--border-default)" },
  "Correspondence":     { bg: "var(--bg-surface-high)", color: "var(--text-muted)", border: "var(--border-default)" },
  "Permit":             { bg: "var(--success-muted)", color: "var(--status-success)", border: "var(--success-border)" },
  "Inspection Report":  { bg: "var(--warning-muted)", color: "var(--status-warning)", border: "var(--warning-border)" },
  "Other":              { bg: "var(--bg-surface-high)", color: "var(--text-muted)", border: "var(--border-default)" },
};

const DEFAULT_CATEGORY_STYLE = { bg: "var(--bg-surface-high)", color: "var(--text-muted)", border: "var(--border-default)" };

function btnStyle(bg, border, color) {
  return {
    flex: 1, padding: "5px 4px",
    background: bg || "transparent",
    border: "1px solid " + (border || "var(--border-default)"),
    color: color || "var(--text-secondary)",
    borderRadius: 4, fontFamily: "var(--font-mono)",
    fontSize: 9, fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em",
  };
}

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
