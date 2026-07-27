import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { isPdfFile } from "@/lib/drawingUploadUtils";
import { MAX_PDF_SIZE_MB, formatBytes } from "../drawingSetUploadHelpers";

// ─── Step 2: File Queue ───────────────────────────────────────────────
// Kicking "Upload & Extract" starts AI processing immediately — no extra
// click required per the new flow.
export default function StepFiles({ files, setFiles, onBack, onUpload, setName }) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef();

  const addFiles = (newFiles) => {
    const pdfs = Array.from(newFiles).filter(isPdfFile);
    setFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name));
      return [...prev, ...pdfs.filter(f => !existingNames.has(f.name))];
    });
  };

  return (
    <div>
      {setName && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 8,
          background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>DRAWING SET</span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>{setName}</span>
        </div>
      )}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? "var(--warning-border)" : "rgba(245,158,11,0.3)"}`,
          borderRadius: 12, padding: "32px 24px", textAlign: "center", cursor: "pointer",
          background: dragOver ? "var(--warning-muted)" : "rgba(245,158,11,0.02)",
          transition: "all 0.15s", marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📐</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
          Drop drawing PDFs or click to browse
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
          PDF ONLY · MULTIPLE FILES ALLOWED · MAX {MAX_PDF_SIZE_MB}MB PER FILE FOR AI EXTRACTION
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{ display: "none" }}
        onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />

      {files.length > 0 && (
        <div style={{ background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
          {files.map((f, i) => {
            const tooBig = f.size / (1024 * 1024) > MAX_PDF_SIZE_MB;
            return (
              <div key={f.name} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderBottom: i < files.length - 1 ? "1px solid var(--divider)" : "none",
              }}>
                <span style={{ fontSize: 14 }}>📄</span>
                <span style={{ flex: 1, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                {tooBig && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-warning)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "1px 5px" }}>
                    ⚠ TOO LARGE — MANUAL
                  </span>
                )}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>{formatBytes(f.size)}</span>
                <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                  style={{ background: "none", border: "none", color: "rgba(255,61,61,0.6)", cursor: "pointer", padding: 2 }}>
                  <X style={{ width: 12, height: 12 }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <Button variant="outline" onClick={onBack}><ChevronLeft style={{ width: 14, height: 14, marginRight: 4 }} /> Back</Button>
        <Button onClick={onUpload} disabled={files.length === 0}
          style={{ background: "var(--accent)", color: "var(--on-accent)", border: "none", opacity: files.length === 0 ? 0.5 : 1 }}>
          Upload &amp; Extract <ChevronRight style={{ width: 14, height: 14, marginLeft: 4 }} />
        </Button>
      </div>
    </div>
  );
}
