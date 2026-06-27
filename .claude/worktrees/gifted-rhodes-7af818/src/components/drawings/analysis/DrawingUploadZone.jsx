import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { mono, display, surface, AI_ACCENT } from "./tokens";

// drawing_analyses-side stage list — broader than the drawings.stage
// CHECK constraint because analysis can come from external sources that
// label sheets as "Shop" or "Revision". Post-migration-077, the canonical
// drawings stages are: Not Started → IFA → OFA → BFA → OFS → IFC → Released.
// "Shop" and "Revision" are kept as analysis-source labels; they're
// coerced into the canonical set via importAnalyzedDrawings.js.
const STAGES = ["IFA","OFA","BFA","OFS","IFC","Released","Shop","Revision"];
const MAX_BYTES = 32 * 1024 * 1024;

/**
 * Drag/drop PDF upload + metadata capture for a new Drawing Analysis.
 * Uploads the file through base44.integrations.Core.UploadFile (Supabase
 * storage under the hood), inserts a drawing_analyses row with
 * status='pending', and hands the row back to the parent so it can kick
 * off analyzeDrawing().
 */
export default function DrawingUploadZone({ projectId, projectName, currentUser, onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [stage, setStage] = useState("IFC");
  const [revision, setRevision] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const pick = () => inputRef.current?.click();
  const reset = () => {
    setFile(null); setRevision(""); setIssueDate(""); setErr(null);
  };

  const accept = (f) => {
    if (!f) return;
    if (f.type && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErr("File must be a PDF.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setErr(`PDF is ${(f.size / 1e6).toFixed(1)} MB — 32 MB max.`);
      return;
    }
    setErr(null);
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  const submit = async () => {
    if (!file) { setErr("Pick a PDF first."); return; }
    if (!projectId) { setErr("Select a project first."); return; }
    setBusy(true); setErr(null);
    try {
      const { file_url, path } = await base44.integrations.Core.UploadFile({ file });

      const { data, error } = await supabase
        .from("drawing_analyses")
        .insert({
          project_id:      projectId,
          file_name:       file.name,
          file_url,
          storage_path:    path,
          drawing_stage:   stage,
          revision:        revision || null,
          issue_date:      issueDate || null,
          uploaded_by:     currentUser || null,
          analysis_status: "pending",
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      toast.success(`${file.name} uploaded — analysis queued`);
      reset();
      onUploaded?.(data);
    } catch (e) {
      const msg = e?.message || String(e);
      setErr(msg);
      toast.error(`Upload failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...surface, padding: 20, borderLeft: `3px solid ${AI_ACCENT}` }}>
      <div style={{ ...display, fontSize: 13, fontWeight: 700, color: AI_ACCENT, letterSpacing: "0.08em", marginBottom: 4 }}>
        AI DRAWING ANALYSIS
      </div>
      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
        {projectName ? `Upload for ${projectName}` : "Select a project, then upload a PDF"}
      </div>

      {/* Drop zone */}
      <div
        onClick={pick}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `1px dashed ${dragging ? AI_ACCENT : "var(--border-default)"}`,
          borderRadius: 4,
          padding: "28px 16px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "color-mix(in srgb, " + AI_ACCENT + " 8%, transparent)" : "var(--bg-page)",
          transition: "background 120ms, border-color 120ms",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: "none" }}
          onChange={(e) => accept(e.target.files?.[0])}
        />
        {file ? (
          <div>
            <div style={{ ...mono, fontSize: 12, color: "var(--text-primary)" }}>{file.name}</div>
            <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              {(file.size / 1e6).toFixed(1)} MB — click to replace
            </div>
          </div>
        ) : (
          <div>
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Drop PDF here or click to browse
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
              Single file, up to 32 MB, up to 100 pages
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 14 }}>
        <Field label="Stage">
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            style={selectStyle}
          >
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Revision">
          <input
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
            placeholder="Rev 2 / P2"
            style={inputStyle}
          />
        </Field>
        <Field label="Issue Date">
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      {err && (
        <div style={{
          marginTop: 12, padding: "8px 10px",
          border: "1px solid var(--status-error)",
          background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
          color: "var(--status-error)", ...mono, fontSize: 11,
        }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
        {file && (
          <button onClick={reset} disabled={busy} style={btnGhost}>
            CLEAR
          </button>
        )}
        <button
          onClick={submit}
          disabled={busy || !file || !projectId}
          style={{
            ...btnPrimary,
            opacity: (busy || !file || !projectId) ? 0.5 : 1,
            cursor:  (busy || !file || !projectId) ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "UPLOADING…" : "UPLOAD & ANALYZE"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.15em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "7px 9px",
  background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 2,
  color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12,
  boxSizing: "border-box",
};
const selectStyle = { ...inputStyle };
const btnPrimary = {
  padding: "8px 20px", background: AI_ACCENT, color: "#000",
  border: "none", borderRadius: 2,
  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
};
const btnGhost = {
  padding: "8px 18px", background: "transparent",
  border: "1px solid var(--border-default)", borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
};
