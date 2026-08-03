/**
 * EmptyState — hero screen shown when the project has zero documents.
 * Wraps the drop-zone in a big click target with sample file-type
 * icons to hint at what's accepted, then the upload CTA.
 */

import React from "react";
import { CloudUpload, FileText, FileCode, File, FileImage, FileArchive } from "lucide-react";

const ICONS = [
  { Icon: FileText,    label: "PDF", color: "var(--status-error)" },
  { Icon: FileCode,    label: "DWG", color: "var(--status-info)" },
  { Icon: File,        label: "IFC", color: "var(--accent)" },
  { Icon: FileImage,   label: "IMG", color: "var(--accent)" },
  { Icon: FileArchive, label: "ZIP", color: "var(--status-warning)" },
];

export default function EmptyState({ onUploadOpen }) {
  return (
    <div
      onClick={onUploadOpen}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        margin: "12px 0",
        border: "2px dashed var(--border-default)",
        borderRadius: 16,
        padding: "60px 24px",
        cursor: "pointer",
        transition: "border-color 0.2s, background 0.2s",
        backgroundImage: "radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent-border)";
        e.currentTarget.style.background = "var(--accent-muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
        {ICONS.map(({ Icon, label, color }) => (
          <div
            key={label}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              opacity: 0.45,
            }}
          >
            <Icon size={24} style={{ color }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color, letterSpacing: "0.08em" }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      <CloudUpload size={52} style={{ color: "var(--accent)", opacity: 0.4 }} />
      <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--text-secondary)" }}>
        Drag files here or click Upload
      </div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", maxWidth: 380, textAlign: "center", lineHeight: 1.7 }}>
        Drop drawings, specs, submittals, or any project document. Files are organized by category, discipline, and revision automatically.
      </div>
      <div
        style={{
          marginTop: 8,
          padding: "8px 20px",
          background: "var(--accent-muted)",
          border: "1px solid var(--accent-border)",
          borderRadius: "var(--radius-btn)",
          color: "var(--accent)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
        }}
      >
        UPLOAD FIRST DOCUMENT
      </div>
    </div>
  );
}
