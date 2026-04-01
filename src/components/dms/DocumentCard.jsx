import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const FILE_TYPE_CONFIG = {
  pdf: { icon: "PDF", bg: "rgba(255,61,61,0.12)", color: "#FF3D3D" },
  dwg: { icon: "DWG", bg: "rgba(0,184,217,0.12)", color: "#00B8D9" },
  ifc: { icon: "IFC", bg: "rgba(0,229,255,0.12)", color: "var(--secondary)" },
  gltf: { icon: "3D", bg: "rgba(0,229,255,0.12)", color: "var(--secondary)" },
  xlsx: { icon: "XLS", bg: "rgba(0,214,143,0.12)", color: "#00D68F" },
  docx: { icon: "DOC", bg: "rgba(0,184,217,0.12)", color: "#00B8D9" },
  img: { icon: "IMG", bg: "rgba(0,184,217,0.12)", color: "#00B8D9" },
  zip: { icon: "ZIP", bg: "rgba(255,176,32,0.12)", color: "#FFB020" },
  other: { icon: "FILE", bg: "rgba(160,175,210,0.12)", color: "#A0AED2" },
};

export default function DocumentCard({ doc, onView, onDownload, onEdit, onLink, onDelete }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const cfg = FILE_TYPE_CONFIG[doc.fileType] || FILE_TYPE_CONFIG.other;
  const fileSizeMB = ((Number(doc.fileSizeKb) || 0) / 1024).toFixed(1);
  const uploadDate = doc.uploadedDate
    ? new Date(doc.uploadedDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  const linkedCount =
    (doc.linkedWorkPackages?.length || 0) +
    (doc.linkedDeliveries?.length || 0) +
    (doc.linkedRFIs?.length || 0) +
    (doc.linkedSubmittals?.length || 0) +
    (doc.linkedDrawings?.length || 0) +
    (doc.linkedChangeOrders?.length || 0);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onView(doc)}
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 16,
        cursor: "pointer",
        transition: "all 0.2s",
        transform: hovered ? "scale(1.02)" : "scale(1)",
        boxShadow: hovered
          ? "0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px var(--accent-border)"
          : "0 4px 12px rgba(0,0,0,0.3)",
        position: "relative",
      }}
    >
      <div
        style={{
          background: cfg.bg,
          border: `1px solid ${cfg.color}33`,
          borderRadius: 8,
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: cfg.color,
          marginBottom: 12,
        }}
      >
        {cfg.icon}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
          {doc.documentNumber || "UNNUMBERED"}
        </div>
        {doc.revisionNumber && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              background: "rgba(255,255,255,0.04)",
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            Rev {doc.revisionNumber}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {doc.displayName || doc.fileName || "Untitled"}
        </div>
        {doc.drawingNumber && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {doc.drawingNumber} | {doc.discipline || "General"}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            padding: "2px 6px",
            borderRadius: 4,
            border: "1px solid var(--divider)",
            color: doc.is_current ? "var(--status-success)" : "var(--text-muted)",
            background: doc.is_current ? "rgba(0,214,143,0.12)" : "rgba(255,255,255,0.04)",
            letterSpacing: "0.06em",
          }}
        >
          {doc.is_current ? "CURRENT" : "SUPERSEDED"}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            padding: "3px 8px",
            background: "var(--accent-muted)",
            color: "var(--accent)",
            borderRadius: 4,
            letterSpacing: "0.05em",
          }}
        >
          {doc.category || "Other"}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            padding: "3px 8px",
            background: doc.status === "Approved" ? "rgba(0,214,143,0.15)" : "rgba(255,176,32,0.15)",
            color: doc.status === "Approved" ? "#00D68F" : "#FFB020",
            borderRadius: 4,
            letterSpacing: "0.05em",
          }}
        >
          {doc.status || "Draft"}
        </span>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
        Linked to {linkedCount} record{linkedCount !== 1 ? "s" : ""}
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>{fileSizeMB} MB | {uploadDate}</span>
        {doc.uploadedBy && <span>| {doc.uploadedBy}</span>}
        <span style={{ color: linkedCount ? "var(--accent)" : "var(--text-muted)" }}>{linkedCount} linked</span>
      </div>

      {hovered && (
        <div
          style={{
            display: "flex",
            gap: 6,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.05)",
            animation: "slideUp 0.2s ease-out",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(createPageUrl("DrawingViewer") + `?docId=${doc.id}`);
            }}
            style={actionPrimaryStyle}
          >
            OPEN
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDownload(doc); }} style={actionGhostStyle}>
            DL
          </button>
          <button onClick={(e) => { e.stopPropagation(); onEdit(doc); }} style={actionGhostStyle}>
            EDIT
          </button>
          <button onClick={(e) => { e.stopPropagation(); onLink(doc); }} style={actionGhostStyle}>
            LINK
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(doc); }}
            style={{
              ...actionGhostStyle,
              border: "1px solid var(--danger-border)",
              color: "var(--danger)",
              background: "rgba(255,68,68,0.08)",
            }}
          >
            DEL
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const actionPrimaryStyle = {
  flex: 1,
  padding: "6px 8px",
  background: "var(--accent-muted)",
  border: "1px solid var(--accent-border)",
  color: "var(--accent)",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 600,
  cursor: "pointer",
};

const actionGhostStyle = {
  flex: 1,
  padding: "6px 8px",
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(220,225,240,0.70)",
  borderRadius: 6,
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 600,
  cursor: "pointer",
};
