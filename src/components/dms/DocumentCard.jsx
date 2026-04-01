import React, { useState } from "react";
import { Download, Eye, Edit3, Link2 } from "lucide-react";

const FILE_TYPE_CONFIG = {
  pdf: { icon: "??", bg: "rgba(255,61,61,0.12)", color: "#FF3D3D" },
  dwg: { icon: "??", bg: "rgba(0,184,217,0.12)", color: "#00B8D9" },
  ifc: { icon: "?", bg: "rgba(139,92,246,0.12)", color: "#8B5CF6" },
  gltf: { icon: "?", bg: "rgba(139,92,246,0.12)", color: "#8B5CF6" },
  xlsx: { icon: "??", bg: "rgba(0,214,143,0.12)", color: "#00D68F" },
  docx: { icon: "??", bg: "rgba(0,184,217,0.12)", color: "#00B8D9" },
  img: { icon: "??", bg: "rgba(0,184,217,0.12)", color: "#00B8D9" },
  zip: { icon: "??", bg: "rgba(255,176,32,0.12)", color: "#FFB020" },
  other: { icon: "??", bg: "rgba(160,175,210,0.12)", color: "#A0AED2" }
};

import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function DocumentCard({ doc, onView, onDownload, onEdit, onLink }) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const cfg = FILE_TYPE_CONFIG[doc.fileType] || FILE_TYPE_CONFIG.other;
  
  const fileSizeMB = (doc.fileSizeKb / 1024).toFixed(1);
  const uploadDate = new Date(doc.uploadedDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

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
        position: "relative"
      }}
    >
      {/* File type icon section */}
      <div
        style={{
          background: cfg.bg,
          border: `1px solid ${cfg.color}33`,
          borderRadius: 8,
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 48,
          marginBottom: 12
        }}
      >
        {cfg.icon}
      </div>

      {/* Header with doc number and revision */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
          {doc.documentNumber}
        </div>
        {doc.revisionNumber && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
              background: "rgba(255,255,255,0.04)",
              padding: "2px 6px",
              borderRadius: 4
            }}
          >
            Rev {doc.revisionNumber}
          </div>
        )}
      </div>

      {/* Display name and drawing number */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {doc.displayName}
        </div>
        {doc.drawingNumber && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
            {doc.drawingNumber} · {doc.discipline}
          </div>
        )}
      </div>

      {/* Category and status badges */}
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
            letterSpacing: "0.06em"
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
            letterSpacing: "0.05em"
          }}
        >
          {doc.category}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            padding: "3px 8px",
            background: doc.status === "Approved" ? "rgba(0,214,143,0.15)" : "rgba(255,176,32,0.15)",
            color: doc.status === "Approved" ? "#00D68F" : "#FFB020",
            borderRadius: 4,
            letterSpacing: "0.05em"
          }}
        >
          {doc.status}
        </span>
      </div>

      {/* Links */}
      {/* Links summary */}
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
        📎 Linked to {linkedCount} record{linkedCount !== 1 ? "s" : ""}
      </div>

      {/* File size and date */}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <span>{fileSizeMB} MB · {uploadDate}</span>
        {doc.uploadedBy && <span>· {doc.uploadedBy}</span>}
        <span style={{ color: "var(--border-strong)" }}>·</span>
        <span style={{ color: linkedCount ? "var(--accent)" : "var(--text-muted)" }}>
          {linkedCount} linked
        </span>
      </div>

      {/* Hover action bar */}
      {hovered && (
        <div
          style={{
            display: "flex",
            gap: 6,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.05)",
            animation: "slideUp 0.2s ease-out"
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(createPageUrl("DrawingViewer") + `?docId=${doc.id}`);
            }}
            style={{
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
              transition: "all 0.15s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-muted)";
              e.currentTarget.style.boxShadow = "0 0 12px var(--accent-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent-muted)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            👁 OPEN
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDownload(doc); }}
            style={{
              flex: 1,
              padding: "6px 8px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(220,225,240,0.70)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            ↓ DL
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(doc); }}
            style={{
              flex: 1,
              padding: "6px 8px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(220,225,240,0.70)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            ✏ EDIT
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onLink(doc); }}
            style={{
              flex: 1,
              padding: "6px 8px",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(220,225,240,0.70)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            🔗 LINK
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

