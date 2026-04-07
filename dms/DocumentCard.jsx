import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const FILE_TYPE_CONFIG = {
  pdf:   { icon: "PDF",  bg: "rgba(255,61,61,0.12)",    color: "#FF3D3D" },
  dwg:   { icon: "DWG",  bg: "rgba(0,184,217,0.12)",    color: "#00B8D9" },
  ifc:   { icon: "IFC",  bg: "rgba(139,92,246,0.12)",   color: "#8B5CF6" },
  gltf:  { icon: "3D",   bg: "rgba(139,92,246,0.12)",   color: "#8B5CF6" },
  xlsx:  { icon: "XLS",  bg: "rgba(0,214,143,0.12)",    color: "#00D68F" },
  docx:  { icon: "DOC",  bg: "rgba(0,184,217,0.12)",    color: "#00B8D9" },
  img:   { icon: "IMG",  bg: "rgba(0,184,217,0.12)",    color: "#00B8D9" },
  zip:   { icon: "ZIP",  bg: "rgba(255,176,32,0.12)",   color: "#FFB020" },
  other: { icon: "FILE", bg: "rgba(160,175,210,0.12)",  color: "#A0AED2" },
};

const STATUS_COLORS = {
  "Approved":          { bg: "rgba(0,214,143,0.15)",  color: "#00D68F" },
  "Approved as Noted": { bg: "rgba(0,214,143,0.10)",  color: "#00D68F" },
  "Under Review":      { bg: "rgba(255,176,32,0.15)", color: "#FFB020" },
  "Revise & Resubmit": { bg: "rgba(255,61,61,0.15)",  color: "#FF3D3D" },
  "Rejected":          { bg: "rgba(255,61,61,0.15)",  color: "#FF3D3D" },
  "Draft":             { bg: "rgba(160,175,210,0.12)",color: "#A0AED2" },
};

function btnStyle(bg, border, color) {
  return {
    flex: 1, padding: "5px 4px",
    background: bg || "transparent",
    border: "1px solid " + (border || "rgba(255,255,255,0.12)"),
    color: color || "rgba(220,225,240,0.70)",
    borderRadius: 4, fontFamily: "var(--font-mono)",
    fontSize: 9, fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em",
  };
}

export default function DocumentCard({ doc, onView, onDownload, onEdit, onLink, onDelete }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cfg = FILE_TYPE_CONFIG[doc.fileType] || FILE_TYPE_CONFIG.other;
  const statusStyle = STATUS_COLORS[doc.status] || { bg: "rgba(160,175,210,0.12)", color: "#A0AED2" };
  const fileSizeKb = doc.fileSizeKb ?? doc.file_size_kb;
  const fileSizeMB = fileSizeKb ? (fileSizeKb / 1024).toFixed(1) + " MB" : "—";
  const rawDate = doc.uploadedDate ?? doc.uploaded_date;
  const uploadDate = rawDate ? new Date(rawDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const linkedCount = (doc.linkedWorkPackages?.length || 0) + (doc.linkedDeliveries?.length || 0) + (doc.linkedRFIs?.length || 0) + (doc.linkedSubmittals?.length || 0) + (doc.linkedDrawings?.length || 0) + (doc.linkedChangeOrders?.length || 0);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      onClick={() => onView?.(doc)}
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid " + (hovered ? "var(--accent-border)" : "rgba(255,255,255,0.08)"),
        borderRadius: 8, padding: 16, cursor: "pointer", transition: "all 0.15s",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.3)",
        position: "relative",
      }}
    >
      <div style={{ background: cfg.bg, border: "1px solid " + cfg.color + "44", borderRadius: 6, height: 80, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: cfg.color, letterSpacing: "0.08em" }}>{cfg.icon}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>{doc.documentNumber ?? "—"}</div>
        {doc.revisionNumber != null && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "2px 6px", borderRadius: 4 }}>Rev {doc.revisionNumber}</div>}
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3, marginBottom: 2 }}>{doc.displayName ?? doc.fileName ?? "Untitled"}</div>
        {doc.drawingNumber && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{doc.drawingNumber}{doc.discipline ? " · " + doc.discipline : ""}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {doc.category && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 7px", background: "var(--accent-muted)", color: "var(--accent)", borderRadius: 3, letterSpacing: "0.05em", textTransform: "uppercase" }}>{doc.category}</span>}
        {doc.status && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 7px", background: statusStyle.bg, color: statusStyle.color, borderRadius: 3, letterSpacing: "0.05em", textTransform: "uppercase" }}>{doc.status}</span>}
      </div>
      {linkedCount > 0 && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>Linked to {linkedCount} record{linkedCount !== 1 ? "s" : ""}</div>}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>{fileSizeMB} · {uploadDate}{doc.uploadedBy && <span> · {doc.uploadedBy}</span>}</div>
      {hovered && !confirmDelete && (
        <div style={{ display: "flex", gap: 4, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={(e) => { e.stopPropagation(); navigate(createPageUrl("DrawingViewer") + "?docId=" + doc.id); }} style={btnStyle("var(--accent-muted)", "var(--accent-border)", "var(--accent)")}>OPEN</button>
          <button onClick={(e) => { e.stopPropagation(); onDownload?.(doc); }} style={btnStyle()}>DL</button>
          <button onClick={(e) => { e.stopPropagation(); onEdit?.(doc); }} style={btnStyle()}>EDIT</button>
          <button onClick={(e) => { e.stopPropagation(); onLink?.(doc); }} style={btnStyle()}>LINK</button>
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} style={btnStyle("rgba(255,61,61,0.08)", "rgba(255,61,61,0.25)", "#FF3D3D")}>DEL</button>
        </div>
      )}
      {confirmDelete && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,61,61,0.10)", border: "1px solid rgba(255,61,61,0.30)", borderRadius: 6 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#FF3D3D", marginBottom: 8 }}>DELETE THIS DOCUMENT?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); onDelete?.(doc); }} style={{ flex: 1, padding: "5px 0", background: "rgba(255,61,61,0.20)", border: "1px solid rgba(255,61,61,0.40)", color: "#FF3D3D", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>CONFIRM</button>
            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }} style={{ flex: 1, padding: "5px 0", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-muted)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}>CANCEL</button>
          </div>
        </div>
      )}
    </div>
  );
}
