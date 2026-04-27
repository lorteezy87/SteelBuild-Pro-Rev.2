import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

/* ── More vibrant file type badges with high contrast ── */
const FILE_TYPE_CONFIG = {
  pdf:   { icon: "PDF",  bg: "rgba(239,68,68,0.18)",     color: "#F87171",  border: "rgba(239,68,68,0.35)" },
  dwg:   { icon: "DWG",  bg: "rgba(56,189,248,0.18)",    color: "#38BDF8",  border: "rgba(56,189,248,0.35)" },
  ifc:   { icon: "IFC",  bg: "rgba(8,145,178,0.18)",   color: "#0891B2",  border: "rgba(8,145,178,0.35)" },
  gltf:  { icon: "3D",   bg: "rgba(8,145,178,0.18)",   color: "#0891B2",  border: "rgba(8,145,178,0.35)" },
  xlsx:  { icon: "XLS",  bg: "rgba(52,211,153,0.18)",    color: "#34D399",  border: "rgba(52,211,153,0.35)" },
  docx:  { icon: "DOC",  bg: "rgba(96,165,250,0.18)",    color: "#60A5FA",  border: "rgba(96,165,250,0.35)" },
  img:   { icon: "IMG",  bg: "rgba(45,212,191,0.18)",    color: "#2DD4BF",  border: "rgba(45,212,191,0.35)" },
  zip:   { icon: "ZIP",  bg: "rgba(251,191,36,0.18)",    color: "#FBBF24",  border: "rgba(251,191,36,0.35)" },
  other: { icon: "FILE", bg: "rgba(160,175,210,0.12)",   color: "#A0AED2",  border: "rgba(160,175,210,0.25)" },
};

const STATUS_COLORS = {
  "Approved":                { bg: "rgba(52,211,153,0.18)",  color: "#34D399" },
  "Approved as Noted":       { bg: "rgba(52,211,153,0.12)",  color: "#34D399" },
  "Approved with Comments":  { bg: "rgba(52,211,153,0.12)",  color: "#34D399" },
  "Under Review":            { bg: "rgba(251,191,36,0.18)",  color: "#FBBF24" },
  "Revise & Resubmit":       { bg: "rgba(251,146,60,0.18)", color: "#FB923C" },
  "Rejected":                { bg: "rgba(248,113,113,0.18)",color: "#F87171" },
  "Draft":                   { bg: "rgba(160,175,210,0.12)",color: "#A0AED2" },
  "Issued":                  { bg: "rgba(96,165,250,0.18)", color: "#60A5FA" },
  "Superseded":              { bg: "rgba(100,116,139,0.12)",color: "#94A3B8" },
  "Archived":                { bg: "rgba(100,116,139,0.08)",color: "#64748B" },
  "Void":                    { bg: "rgba(248,113,113,0.10)",color: "#F87171" },
};

/* ── Category pill color map ── */
const CATEGORY_COLORS = {
  "Blueprint":          { bg: "rgba(96,165,250,0.15)",   color: "#60A5FA",  border: "rgba(96,165,250,0.30)" },
  "Shop Drawing":       { bg: "rgba(56,189,248,0.15)",   color: "#38BDF8",  border: "rgba(56,189,248,0.30)" },
  "IFC Model":          { bg: "rgba(8,145,178,0.15)",  color: "#0891B2",  border: "rgba(8,145,178,0.30)" },
  "Specification":      { bg: "rgba(251,191,36,0.12)",   color: "#FBBF24",  border: "rgba(251,191,36,0.25)" },
  "Submittal":          { bg: "rgba(45,212,191,0.15)",   color: "#2DD4BF",  border: "rgba(45,212,191,0.30)" },
  "Transmittal":        { bg: "rgba(52,211,153,0.15)",   color: "#34D399",  border: "rgba(52,211,153,0.30)" },
  "RFI Response":       { bg: "rgba(251,146,60,0.15)",   color: "#FB923C",  border: "rgba(251,146,60,0.30)" },
  "Change Order":       { bg: "rgba(248,113,113,0.15)",  color: "#F87171",  border: "rgba(248,113,113,0.30)" },
  "Contract":           { bg: "rgba(200,155,32,0.15)",   color: "#C89B20",  border: "rgba(200,155,32,0.30)" },
  "Photo":              { bg: "rgba(45,212,191,0.12)",   color: "#2DD4BF",  border: "rgba(45,212,191,0.25)" },
  "Report":             { bg: "rgba(160,175,210,0.12)",  color: "#A0AED2",  border: "rgba(160,175,210,0.25)" },
  "Correspondence":     { bg: "rgba(160,175,210,0.10)",  color: "#94A3B8",  border: "rgba(160,175,210,0.20)" },
  "Permit":             { bg: "rgba(52,211,153,0.12)",   color: "#34D399",  border: "rgba(52,211,153,0.25)" },
  "Inspection Report":  { bg: "rgba(251,191,36,0.12)",   color: "#FBBF24",  border: "rgba(251,191,36,0.25)" },
  "Other":              { bg: "rgba(160,175,210,0.08)",  color: "#94A3B8",  border: "rgba(160,175,210,0.15)" },
};

const DEFAULT_CATEGORY_STYLE = { bg: "rgba(160,175,210,0.10)", color: "#A0AED2", border: "rgba(160,175,210,0.20)" };

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
  const statusStyle = STATUS_COLORS[doc.status] || { bg: "rgba(160,175,210,0.12)", color: "#A0AED2" };
  const catStyle = CATEGORY_COLORS[doc.category] || DEFAULT_CATEGORY_STYLE;
  const fileSizeKb = doc.fileSizeKb ?? doc.file_size_kb;
  const fileSizeMB = fileSizeKb ? (fileSizeKb / 1024).toFixed(1) + " MB" : "\u2014";
  const rawDate = doc.uploadedDate ?? doc.uploaded_date;
  const uploadDate = rawDate ? new Date(rawDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "\u2014";
  const linkedCount = (doc.linkedWorkPackages?.length || 0) + (doc.linkedDeliveries?.length || 0) + (doc.linkedRFIs?.length || 0) + (doc.linkedSubmittals?.length || 0) + (doc.linkedDrawings?.length || 0) + (doc.linkedChangeOrders?.length || 0);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      onClick={() => onView?.(doc)}
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid " + (hovered ? "var(--accent-border)" : "var(--bg-surface-high)"),
        borderRadius: 8, padding: 16, cursor: "pointer", transition: "all 0.15s",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.3)",
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
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} style={btnStyle("rgba(255,61,61,0.08)", "rgba(255,61,61,0.25)", "var(--status-error-bright)")}>DEL</button>
        </div>
      )}
      {confirmDelete && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,61,61,0.10)", border: "1px solid rgba(255,61,61,0.30)", borderRadius: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-error-bright)", marginBottom: 8 }}>DELETE THIS DOCUMENT?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); onDelete?.(doc); }} style={{ flex: 1, padding: "5px 0", background: "rgba(255,61,61,0.20)", border: "1px solid rgba(255,61,61,0.40)", color: "var(--status-error-bright)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>CONFIRM</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }} style={{ flex: 1, padding: "5px 0", background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-muted)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}>CANCEL</button>
          </div>
        </div>
      )}
    </div>
  );
}
