import React, { useState, useRef } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { isPdfFile } from "@/lib/drawingUploadUtils";
import { formatBytes } from "../revisionUploadHelpers";
import { MAX_PDF_SIZE_MB } from "./constants";
// ── Step C: Drop PDF ───────────────────────────────────────────────
export default function StepDropPDF({ selectedSet, revMeta, file, setFile, onBack, onExtract }) {
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!isPdfFile(f)) {
      setLocalError("Please upload a PDF file (.pdf).");
      return;
    }
    if (f.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
      setLocalError(`PDF exceeds ${MAX_PDF_SIZE_MB}MB limit for revision upload.`);
      return;
    }
    setLocalError("");
    setFile(f);
  };

  return (
    <div>
      <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--hover-bg)", border: "1px solid var(--divider)", marginBottom: 14, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
        <span style={{ color: "var(--status-warning)" }}>{selectedSet.set_name}</span>
        {" · "}Previous: {selectedSet.revision || "—"} ({selectedSet.sheet_count || 0} sheets)
        {" → "}
        <span style={{ color: "var(--status-success-bright)" }}>{revMeta.revisionLabel}</span>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; handleFile(f); }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--warning-border)" : "rgba(245,158,11,0.3)"}`,
          borderRadius: 12, padding: "28px 24px", textAlign: "center", cursor: "pointer",
          background: dragOver ? "var(--warning-muted)" : file ? "rgba(0,214,143,0.03)" : "rgba(245,158,11,0.02)",
          transition: "all 0.15s", marginBottom: 12
        }}
      >
        {file ? (
          <>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--status-success-bright)", fontWeight: 600, marginBottom: 2 }}>{file.name}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{formatBytes(file.size)} · Click to change</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📐</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", marginBottom: 2 }}>Drop {revMeta.revisionLabel} PDF here or click to browse</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em" }}>PDF ONLY · MAX {MAX_PDF_SIZE_MB}MB FOR AI EXTRACTION</div>
          </>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
        onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
      {localError && (
        <div style={{ marginBottom: 12, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--status-error)" }}>
          {localError}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
          <ChevronLeft style={{ width: 13, height: 13 }} /> Back
        </button>
        <button onClick={onExtract} disabled={!file} style={{
          padding: "7px 16px", borderRadius: 8, cursor: file ? "pointer" : "not-allowed",
          background: file ? "var(--accent)" : "var(--hover-bg)",
          border: "none", color: file ? "#fff" : "var(--text-muted)",
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          display: "flex", alignItems: "center", gap: 6
        }}>
          Extract Sheets <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}
