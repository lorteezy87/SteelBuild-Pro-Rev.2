import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronRight, ChevronLeft, Check, AlertTriangle } from "lucide-react";
import { getDrawingSetName, normalizeSetKey, PLACEHOLDER_SET_NAMES, UNASSIGNED_KEY } from "./submittalsUtils";
import { upsertDrawingSetScheduleTask } from "./submittalsMutations";

const MAX_PDF_SIZE_MB = 50;
const MAX_AI_EXTRACTION_SIZE_MB = 10;

function isPdfFile(file) {
  if (!file) return false;
  const mime = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return mime === "application/pdf" || mime.includes("pdf") || name.endsWith(".pdf");
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function normalizeRevisionNumber(value, fallback = "0") {
  if (value == null || value === "") return fallback;
  return String(value).trim() || fallback;
}

// Smart revision suggestions
function getRevisionSuggestions(currentRev) {
  const rev = (currentRev || "").trim().toUpperCase();
  if (rev === "OFA" || rev === "FOR APPROVAL") return ["IFA", "IFB", "IFC"];
  if (rev === "IFA") return ["IFB", "IFC"];
  if (rev === "IFB") return ["IFC", "BID ADDENDUM 1"];
  if (rev === "IFC") return ["IFC Rev 1", "IFC Rev 2", "ADDENDUM 1"];
  if (rev.startsWith("IFC REV")) {
    const num = parseInt(rev.replace("IFC REV", "").trim()) || 1;
    return [`IFC Rev ${num + 1}`, `IFC Rev ${num + 1} — Addendum`, "FINAL IFC"];
  }
  if (rev === "BID SET") return ["IFC", "ADDENDUM 1", "ADDENDUM 2"];
  return ["Rev 1", "Rev 2", "IFC", "Final"];
}

// Sheet matching
function matchSheets(oldSheets, newSheets) {
  const oldMap = new Map((oldSheets || []).map(s => [s.sheetNumber, s]));
  const newMap = new Map((newSheets || []).map(s => [s.sheetNumber, s]));
  const results = [];
  for (const [num, newSheet] of newMap) {
    const old = oldMap.get(num);
    results.push({ sheetNumber: num, oldSheet: old || null, newSheet, change: old ? "revised" : "added" });
  }
  for (const [num, oldSheet] of oldMap) {
    if (!newMap.has(num)) {
      results.push({ sheetNumber: num, oldSheet, newSheet: null, change: "removed" });
    }
  }
  return results.sort((a, b) => a.sheetNumber.localeCompare(b.sheetNumber));
}

const CHANGE_STYLE = {
  revised: { color: "#FFB020", label: "✎ REVISED", bg: "rgba(255,176,32,0.06)" },
  added:   { color: "#00D68F", label: "+ ADDED",   bg: "rgba(0,214,143,0.06)" },
  removed: { color: "#FF3D3D", label: "— REMOVED", bg: "rgba(255,61,61,0.05)" },
  same:    { color: "var(--text-muted)", label: "≡ SAME", bg: "transparent" },
};

async function extractSheetsFromPDF(file, fileUrl) {
  const raw = await base44.integrations.Core.InvokeLLM({
    prompt: `Extract every sheet from this drawing set PDF. For each sheet return JSON:
{ "sheetNumber":"S-001", "sheetTitle":"Foundation Plan", "discipline":"Structural", "revision":"0" }
Return ONLY a JSON array starting with [. Nothing else.`,
    file_urls: [fileUrl],
  });
  const clean = String(raw || "[]").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    const sheets = JSON.parse(clean);
    return Array.isArray(sheets) ? sheets : [];
  } catch {
    return [];
  }
}

async function loadExistingSetSheets(activeProject, selectedSet, drawingSetRecords = []) {
  if (!activeProject?.id || !selectedSet?.set_name) return [];

  const projectDrawings = await base44.entities.Drawing.filter({ project_id: activeProject.id });
  const targetKey = normalizeSetKey(selectedSet.set_name);

  return (projectDrawings || [])
    .filter((drawing) => !drawing?.is_superseded)
    .filter((drawing) => normalizeSetKey(getDrawingSetName(drawing, drawingSetRecords)) === targetKey)
    .map((drawing) => ({
      id: drawing.id,
      sheetNumber: drawing.sheet_number,
      sheetTitle: drawing.title,
      fileUrl: drawing.file_url,
      discipline: drawing.discipline,
      revision: drawing.revision_number,
      drawing,
    }));
}

// ── Step A: Select existing drawing set ────────────────────────────
function StepSelectSet({ drawingSets, preSelectedSet, onSelect, onClose, loading = false, error = null }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(preSelectedSet || null);
  const getSetIdentity = (drawingSet) => drawingSet?.id ?? drawingSet?.set_name ?? "";

  const filtered = drawingSets.filter(ds =>
    !search || (ds.set_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", color: "var(--text-muted)", marginBottom: 8 }}>
        WHICH DRAWING SET ARE YOU UPDATING?
      </div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 12, pointerEvents: "none" }}>⌕</div>
        <input
          placeholder="Search drawing sets..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%",
            height: 38,
            background: "var(--bg-sidebar)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 8,
            padding: "0 12px 0 36px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            outline: "none",
          }}
          onFocus={e => {
            e.target.style.border = "1px solid rgba(245,158,11,0.40)";
            e.target.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.08)";
          }}
          onBlur={e => {
            e.target.style.border = "1px solid rgba(255,255,255,0.10)";
            e.target.style.boxShadow = "none";
          }}
        />
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 0", gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(245,158,11,0.2)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite" }} />
          <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>Loading drawing sets...</span>
        </div>
      ) : error ? (
        <div style={{ textAlign: "center", padding: "20px 0", fontFamily: "var(--font-body)", fontSize: 11, color: "rgba(255,61,61,0.60)" }}>
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
          No drawing sets found for this project
        </div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          {filtered.map(ds => {
            const isSelected = getSetIdentity(selected) === getSetIdentity(ds);
            return (
              <div key={getSetIdentity(ds)} onClick={() => setSelected(ds)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0 12px", height: 48,
                background: isSelected ? "var(--warning-muted)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${isSelected ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 8, cursor: "pointer",
                transition: "all 0.1s"
              }}
              onMouseEnter={e => {
                if (!isSelected) {
                  e.currentTarget.style.background = "var(--warning-muted)";
                  e.currentTarget.style.borderColor = "rgba(245,158,11,0.20)";
                }
              }}
              onMouseLeave={e => {
                if (!isSelected) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                }
              }}>
                <div>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{ds.set_name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", marginTop: 2 }}>
                    {ds.sheet_count || 0} sheets · REV {ds.current_revision || "—"}
                  </div>
                </div>
                {isSelected && <span style={{ color: "var(--accent)", fontSize: 14 }}>✓</span>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
        <button onClick={onClose} style={{
          height: 34, padding: "0 16px", background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8,
          color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer"
        }}>Cancel</button>
        <button onClick={() => selected && onSelect(selected)} disabled={!selected || loading} style={{
          height: 34, padding: "0 18px", borderRadius: 8, cursor: selected && !loading ? "pointer" : "not-allowed",
          background: selected && !loading ? "var(--accent)" : "rgba(255,255,255,0.05)",
          border: "none", color: selected && !loading ? "#fff" : "var(--text-muted)",
          fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 6, opacity: selected && !loading ? 1 : 0.4
        }}>
          Continue <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}

// ── Step B: Revision Metadata ──────────────────────────────────────
function StepRevMeta({ selectedSet, revMeta, setRevMeta, onBack, onNext }) {
  const suggestions = getRevisionSuggestions(selectedSet.current_revision);
  const set = (k, v) => setRevMeta(p => ({ ...p, [k]: v }));

  return (
    <div>
      {/* Current state */}
      <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 4 }}>UPDATING</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{selectedSet.set_name}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", marginTop: 2, letterSpacing: "0.06em" }}>
          {selectedSet.current_revision || "—"} → <span style={{ color: revMeta.revisionLabel || "var(--text-muted)" }}>{revMeta.revisionLabel || "new revision"}</span>
        </div>
      </div>

      {/* Revision label */}
      <div style={{ marginBottom: 14 }}>
        <label>New Revision Label *</label>
        <input value={revMeta.revisionLabel} onChange={e => set("revisionLabel", e.target.value)} placeholder="e.g. IFC Rev 1" style={{ width: "100%", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => set("revisionLabel", s)} style={{
              padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              background: revMeta.revisionLabel === s ? "var(--warning-muted)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${revMeta.revisionLabel === s ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.10)"}`,
              color: revMeta.revisionLabel === s ? "var(--status-warning)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em"
            }}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label>Issue Date *</label>
          <input type="date" value={revMeta.issueDate} onChange={e => set("issueDate", e.target.value)} style={{ width: "100%" }} />
        </div>
        <div>
          <label>Issued By</label>
          <input value={revMeta.issuedBy} onChange={e => set("issuedBy", e.target.value)} placeholder={selectedSet.current_issued_by || "Smith Engineering"} style={{ width: "100%" }} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Notes — What changed?</label>
        <textarea rows={2} value={revMeta.notes} onChange={e => set("notes", e.target.value)} placeholder="e.g. Updated connection details, added embed schedule" style={{ width: "100%", resize: "vertical" }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>Previous Revision Disposition</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { value: "superseded", label: "Mark as Superseded", desc: "Recommended — old revision clearly replaced" },
            { value: "reference", label: "Keep as Reference Only", desc: "Available but not active" },
          ].map(opt => (
            <div key={opt.value} onClick={() => set("disposition", opt.value)} style={{
              padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              background: revMeta.disposition === opt.value ? "var(--warning-muted)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${revMeta.disposition === opt.value ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.07)"}`,
              display: "flex", alignItems: "center", gap: 10
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                background: revMeta.disposition === opt.value ? "var(--accent)" : "transparent",
                border: `2px solid ${revMeta.disposition === opt.value ? "var(--accent)" : "var(--text-muted)"}`,
              }} />
              <div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{opt.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{opt.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
          <ChevronLeft style={{ width: 13, height: 13 }} /> Back
        </button>
        <button onClick={onNext} disabled={!revMeta.revisionLabel} style={{
          padding: "7px 16px", borderRadius: 8, cursor: revMeta.revisionLabel ? "pointer" : "not-allowed",
          background: revMeta.revisionLabel ? "var(--accent)" : "rgba(255,255,255,0.05)",
          border: "none", color: revMeta.revisionLabel ? "#fff" : "var(--text-muted)",
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          display: "flex", alignItems: "center", gap: 6
        }}>
          Upload PDF <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}

// ── Step C: Drop PDF ───────────────────────────────────────────────
function StepDropPDF({ selectedSet, revMeta, file, setFile, onBack, onExtract }) {
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState("");
  const fileInputRef = useRef();
  const exceedsAiLimit = file && file.size > MAX_AI_EXTRACTION_SIZE_MB * 1024 * 1024;

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
      <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 14, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
        <span style={{ color: "var(--status-warning)" }}>{selectedSet.set_name}</span>
        {" · "}Previous: {selectedSet.current_revision || "—"} ({selectedSet.sheet_count || 0} sheets)
        {" → "}
        <span style={{ color: "#00D68F" }}>{revMeta.revisionLabel}</span>
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
            <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "#00D68F", fontWeight: 600, marginBottom: 2 }}>{file.name}</div>
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
      {exceedsAiLimit && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,180,0,0.20)",
            background: "rgba(255,180,0,0.08)",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            color: "var(--status-warning)",
          }}
        >
          Large PDF detected. Sheet diff extraction is limited above {MAX_AI_EXTRACTION_SIZE_MB}MB, so this revision will be applied to the existing sheets in the set without AI sheet comparison.
        </div>
      )}
      <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
        onChange={e => { handleFile(e.target.files[0]); e.target.value = ""; }} />
      {localError && (
        <div style={{ marginBottom: 12, fontFamily: "var(--font-body)", fontSize: 11, color: "var(--status-error)" }}>
          {localError}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
          <ChevronLeft style={{ width: 13, height: 13 }} /> Back
        </button>
        <button onClick={onExtract} disabled={!file} style={{
          padding: "7px 16px", borderRadius: 8, cursor: file ? "pointer" : "not-allowed",
          background: file ? "var(--accent)" : "rgba(255,255,255,0.05)",
          border: "none", color: file ? "#fff" : "var(--text-muted)",
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          display: "flex", alignItems: "center", gap: 6
        }}>
          {exceedsAiLimit ? "Apply To Existing Sheets" : "Extract Sheets"} <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}

// ── Step D: Sheet Comparison ───────────────────────────────────────
function StepSheetComparison({ selectedSet, revMeta, matchedSheets, setMatchedSheets, onBack, onConfirm }) {
  const counts = {
    same: matchedSheets.filter(m => m.change === "revised" && m.oldSheet?.sheetTitle === m.newSheet?.sheetTitle).length,
    revised: matchedSheets.filter(m => m.change === "revised").length,
    added: matchedSheets.filter(m => m.change === "added").length,
    removed: matchedSheets.filter(m => m.change === "removed").length,
  };
  const totalOld = matchedSheets.filter(m => m.oldSheet).length;
  const totalNew = matchedSheets.filter(m => m.newSheet).length;
  const removedSheets = matchedSheets.filter(m => m.change === "removed");

  const updateTitle = (idx, val) => {
    setMatchedSheets(prev => prev.map((m, i) => i === idx ? { ...m, newSheet: { ...m.newSheet, sheetTitle: val } } : m));
  };

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{totalOld} → {totalNew} sheets</span>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#FFB020", letterSpacing: "0.06em" }}>{counts.revised} revised</span>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#00D68F", letterSpacing: "0.06em" }}>{counts.added} added</span>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#FF3D3D", letterSpacing: "0.06em" }}>{counts.removed} removed</span>
      </div>

      {/* Removed warning */}
      {removedSheets.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderRadius: 8, background: "rgba(255,61,61,0.07)", border: "1px solid rgba(255,61,61,0.20)", marginBottom: 12 }}>
          <AlertTriangle style={{ width: 14, height: 14, color: "#FF3D3D", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
            {removedSheets.length} sheet{removedSheets.length > 1 ? "s" : ""} from the previous revision
            {" "}({removedSheets.map(m => m.sheetNumber).join(", ")}) will be marked superseded.
          </div>
        </div>
      )}

      {/* Comparison table */}
      <div style={{ maxHeight: 300, overflowY: "auto", background: "var(--bg-sidebar)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginBottom: 14 }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 1fr", alignItems: "center", padding: "7px 12px", background: "var(--bg-surface-low)", borderBottom: "1px solid rgba(255,255,255,0.07)", position: "sticky", top: 0, zIndex: 1, gap: 8 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em" }}>PREV ({selectedSet.current_revision || "—"})</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em" }}>TITLE</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.12em" }}>CHANGE</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-warning)", letterSpacing: "0.12em" }}>NEW ({revMeta.revisionLabel})</div>
        </div>
        {matchedSheets.map((m, i) => {
          const cs = CHANGE_STYLE[m.change] || CHANGE_STYLE.same;
          return (
            <div key={m.sheetNumber} style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 1fr", alignItems: "center", padding: "5px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: cs.bg, gap: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: m.oldSheet ? "var(--text-muted)" : "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.oldSheet?.sheetNumber || "—"}
              </span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.oldSheet?.sheetTitle || "—"}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: cs.color, letterSpacing: "0.06em", fontWeight: 700 }}>{cs.label}</span>
              <div>
                {m.newSheet ? (
                  <input
                    value={m.newSheet.sheetTitle || ""}
                    onChange={e => updateTitle(i, e.target.value)}
                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: 3, padding: "1px 4px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 10, width: "100%" }}
                    onFocus={e => e.target.style.borderColor = "rgba(245,158,11,0.4)"}
                    onBlur={e => e.target.style.borderColor = "transparent"}
                  />
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(255,61,61,0.40)" }}>— REMOVED</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{ padding: "7px 14px", borderRadius: 8, cursor: "pointer", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
          <ChevronLeft style={{ width: 13, height: 13 }} /> Back
        </button>
        <button onClick={onConfirm} style={{
          padding: "7px 16px", borderRadius: 8, cursor: "pointer",
          background: "var(--accent)", border: "none", color: "#fff",
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          display: "flex", alignItems: "center", gap: 6
        }}>
          Apply Revision <ChevronRight style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  );
}

// ── Processing screen ──────────────────────────────────────────────
function StepProcessing({ message, progress }) {
  return (
    <div style={{ padding: "40px 0", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Applying Revision Update</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 24 }}>{message}</div>
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 20, height: 6, overflow: "hidden", maxWidth: 360, margin: "0 auto" }}>
        <div style={{ height: "100%", background: "var(--accent)", borderRadius: 20, width: `${progress}%`, transition: "width 0.4s ease" }} />
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", marginTop: 6 }}>{progress}%</div>
    </div>
  );
}

// ── Success screen ─────────────────────────────────────────────────
function StepSuccess({ selectedSet, revMeta, stats, onClose }) {
  return (
    <div style={{ textAlign: "center", padding: "30px 0" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(0,214,143,0.12)", border: "2px solid rgba(0,214,143,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Check style={{ width: 22, height: 22, color: "#00D68F" }} />
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Revision Applied</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start", maxWidth: 340, margin: "0 auto 24px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 16px" }}>
        {[
          `✓ "${selectedSet.set_name}" updated ${selectedSet.current_revision || "—"} → ${revMeta.revisionLabel}`,
          `✓ ${stats.updated} drawing records updated`,
          stats.added > 0 && `✓ ${stats.added} new sheet${stats.added > 1 ? "s" : ""} created`,
          stats.removed > 0 && `✓ ${stats.removed} sheet${stats.removed > 1 ? "s" : ""} marked superseded`,
          `✓ Previous revision archived in history`,
        ].filter(Boolean).map((line, i) => (
          <div key={i} style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", textAlign: "left" }}>{line}</div>
        ))}
      </div>
      <button onClick={onClose} style={{
        padding: "9px 22px", borderRadius: 8, cursor: "pointer",
        background: "var(--accent)", border: "none", color: "#fff",
        fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em"
      }}>View Drawing Log</button>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────
export default function RevisionUploadModal({ open, onClose, onComplete, activeProject, preSelectedSet, drawingSets = [] }) {
  const [availableSets, setAvailableSets] = React.useState([]);
  useEffect(() => {
    if (!open || !activeProject?.id) return;
    base44.entities.Drawing.filter({ project_id: activeProject.id }).then(drawings => {
      const validSetRecords = drawingSets.filter((set) => {
        const name = String(set?.set_name || "").trim();
        return name && !PLACEHOLDER_SET_NAMES.has(name.toLowerCase());
      });

      const mergedBySet = new Map();

      validSetRecords.forEach((set) => {
        mergedBySet.set(normalizeSetKey(set.set_name), {
          ...set,
          current_revision: set.current_revision != null ? String(set.current_revision) : "—",
          revision_history: set.revision_history || "[]",
          sheet_count: Number(set.sheet_count || 0),
        });
      });

      const drawingCounts = new Map();

      drawings
        .filter((drawing) => !drawing.is_superseded)
        .forEach((drawing) => {
          const resolvedSetName = getDrawingSetName(drawing, validSetRecords);
          if (!resolvedSetName || resolvedSetName === UNASSIGNED_KEY) return;
          const key = normalizeSetKey(resolvedSetName);
          drawingCounts.set(key, (drawingCounts.get(key) || 0) + 1);
          const existing = mergedBySet.get(key);
          if (existing) {
            mergedBySet.set(key, {
              ...existing,
              current_revision: existing.current_revision || (drawing.revision_number != null ? String(drawing.revision_number) : "—"),
              current_issue_date: existing.current_issue_date || drawing.issue_date || null,
              current_issued_by: existing.current_issued_by || drawing.issued_by || "",
              current_file_url: existing.current_file_url || drawing.file_url || null,
            });
          } else {
            mergedBySet.set(key, {
              id: null,
              set_name: resolvedSetName,
              current_revision: drawing.revision_number != null ? String(drawing.revision_number) : "—",
              current_issue_date: drawing.issue_date || null,
              current_issued_by: drawing.issued_by || "",
              current_file_url: drawing.file_url || null,
              sheet_count: 0,
              revision_history: "[]",
            });
          }
        });

      const mergedSets = [...mergedBySet.values()]
        .filter((set) => {
          const name = String(set?.set_name || "").trim();
          return name && !PLACEHOLDER_SET_NAMES.has(name.toLowerCase());
        })
        .map((set) => ({
          ...set,
          sheet_count: drawingCounts.get(normalizeSetKey(set.set_name)) || Number(set.sheet_count || 0),
        }))
        .sort((a, b) => String(a.set_name || "").localeCompare(String(b.set_name || ""), undefined, { numeric: true, sensitivity: "base" }));

      setAvailableSets(mergedSets);
    }).catch(() => {});
  }, [open, activeProject?.id, drawingSets]);
  const [step, setStep] = useState("selectSet");
  const [selectedSet, setSelectedSet] = useState(preSelectedSet || null);
  const [revMeta, setRevMeta] = useState({
    revisionLabel: "",
    issueDate: new Date().toISOString().split("T")[0],
    issuedBy: "",
    notes: "",
    disposition: "superseded",
  });
  const [pdfFile, setPdfFile] = useState(null);
  const [matchedSheets, setMatchedSheets] = useState([]);
  const [processingMsg, setProcessingMsg] = useState("");
  const [processingPct, setProcessingPct] = useState(0);
  const [flowError, setFlowError] = useState("");
  const [fallbackMode, setFallbackMode] = useState("");
  const [applyStats, setApplyStats] = useState({ updated: 0, added: 0, removed: 0 });
  useEffect(() => {
    if (preSelectedSet) { setSelectedSet(preSelectedSet); setStep("revMeta"); }
  }, [preSelectedSet]);

  useEffect(() => {
    if (open && !preSelectedSet) {
      setStep("selectSet");
      setSelectedSet(null);
    }
  }, [open]);

  const handleExtract = async () => {
    try {
      setFlowError("");
      setFallbackMode("");
      setStep("processing");
      setProcessingMsg("Uploading PDF...");
      setProcessingPct(10);
      const res = await base44.integrations.Core.UploadFile({ file: pdfFile });

      // Get old sheets from existing Drawing records
      let oldSheets = [];
      try {
        oldSheets = await loadExistingSetSheets(activeProject, selectedSet, availableSets);
      } catch (e) {
        console.error("Failed to fetch existing drawings:", e);
      }

      let matched = [];
      if (pdfFile.size > MAX_AI_EXTRACTION_SIZE_MB * 1024 * 1024) {
        if (!oldSheets.length) {
          throw new Error("No active sheets were found in this drawing set, so the large-file fallback cannot apply a revision.");
        }
        setProcessingMsg("Large PDF detected. Preparing revision update without AI sheet diff...");
        setProcessingPct(60);
        setFallbackMode("existing-sheets");
        matched = oldSheets.map((sheet) => ({
          sheetNumber: sheet.sheetNumber,
          oldSheet: { sheetNumber: sheet.sheetNumber, sheetTitle: sheet.sheetTitle, fileUrl: sheet.fileUrl },
          newSheet: {
            sheetNumber: sheet.sheetNumber,
            sheetTitle: sheet.sheetTitle,
            discipline: sheet.discipline || selectedSet.discipline || "Structural",
            revision: revMeta.revisionLabel,
            fileUrl: res.file_url,
            sourceFileUrl: res.file_url,
          },
          change: "revised",
        }));
      } else {
        setProcessingMsg("AI is reading the drawing set...");
        setProcessingPct(40);
        const newSheets = await extractSheetsFromPDF(pdfFile, res.file_url);
        setProcessingMsg("Comparing sheets...");
        setProcessingPct(80);
        matched = matchSheets(oldSheets, newSheets.map(s => ({ sheetNumber: s.sheetNumber, sheetTitle: s.sheetTitle })));
        matched.forEach(m => {
          if (m.newSheet) m.newSheet.fileUrl = res.file_url;
          if (m.newSheet) m.newSheet.sourceFileUrl = res.file_url;
        });
      }

      setMatchedSheets(matched);
      setProcessingPct(100);
      await new Promise(r => setTimeout(r, 400));
      setStep("comparison");
    } catch (error) {
      console.error("Revision extraction failed:", error);
      setFlowError(error?.message || "Unable to upload or parse this revision PDF.");
      setStep("dropPDF");
    }
  };

  const handleApply = async () => {
    try {
      setFlowError("");
      setStep("processing");
      setProcessingMsg("Updating drawing set...");
      setProcessingPct(10);

    // Snapshot current revision into history
    let history = [];
    try { history = JSON.parse(selectedSet.revision_history || "[]"); } catch {}
    const snapshot = {
      revisionLabel: selectedSet.current_revision,
      issueDate: selectedSet.current_issue_date,
      issuedBy: selectedSet.current_issued_by,
      fileUrl: selectedSet.current_file_url,
      sheetCount: selectedSet.sheet_count,
      notes: selectedSet.notes || "",
      uploadedAt: new Date().toISOString(),
      status: revMeta.disposition,
    };
    history.push(snapshot);

    const newSheetCount = matchedSheets.filter(m => m.newSheet).length;
    const newFileUrl = matchedSheets.find(m => m.newSheet?.sourceFileUrl)?.newSheet?.sourceFileUrl || selectedSet.current_file_url;

    // Update DrawingSet (only if a real DrawingSet record exists)
    let syncedSetRecord = selectedSet;
    if (selectedSet.id) {
      syncedSetRecord = await base44.entities.DrawingSet.update(selectedSet.id, {
        current_revision: revMeta.revisionLabel,
        current_issue_date: revMeta.issueDate,
        current_issued_by: revMeta.issuedBy || selectedSet.current_issued_by,
        current_file_url: newFileUrl,
        sheet_count: newSheetCount,
        revision_history: JSON.stringify(history),
        approval_status: "pending",
        notes: revMeta.notes || selectedSet.notes,
      });
    }
    setProcessingPct(30);
    setProcessingMsg("Updating drawing records...");

    // Load existing drawings for this set
      let existingDrawings = [];
      try {
        const existingSetSheets = await loadExistingSetSheets(activeProject, selectedSet, availableSets);
        existingDrawings = existingSetSheets.map((sheet) => sheet.drawing).filter(Boolean);
      } catch (e) {
        console.error("Failed to fetch drawings for apply:", e);
      }

    let updated = 0, added = 0, removed = 0;
    for (const match of matchedSheets) {
      const existing = existingDrawings.find(d => d.sheet_number === match.sheetNumber && !d.is_superseded);
      if (match.change === "removed") {
        if (existing) { await base44.entities.Drawing.update(existing.id, { is_superseded: true }); removed++; }
      } else if (match.change === "added") {
        await base44.entities.Drawing.create({
          sheet_number: match.newSheet.sheetNumber,
          title: match.newSheet.sheetTitle,
          project_id: activeProject?.id,
          project_name: activeProject?.name,
          discipline: match.newSheet.discipline || selectedSet.discipline || "Structural",
          revision_number: normalizeRevisionNumber(match.newSheet.revision ?? revMeta.revisionLabel),
          stage: "Not Started",
          issue_date: revMeta.issueDate,
          issued_by: revMeta.issuedBy,
          file_url: newFileUrl,
          drawing_set_name: selectedSet.set_name,
          ifc_status: revMeta.revisionLabel.toUpperCase().includes("IFC") ? "IFC" : undefined,
          is_superseded: false,
        });
        added++;
      } else {
        if (existing) {
          await base44.entities.Drawing.update(existing.id, {
            revision_number: normalizeRevisionNumber(match.newSheet?.revision ?? revMeta.revisionLabel ?? existing.revision_number),
            issue_date: revMeta.issueDate,
            issued_by: revMeta.issuedBy || existing.issued_by,
            file_url: newFileUrl,
            is_superseded: false,
          });
          updated++;
        }
      }
      setProcessingPct(30 + Math.round((updated + added + removed) / matchedSheets.length * 60));
    }

      await upsertDrawingSetScheduleTask({
        activeProject,
        setRecord: syncedSetRecord,
        setName: selectedSet.set_name,
        sourceDrawing: {
          project_id: activeProject?.id || "",
          project_name: activeProject?.name || "",
          issue_date: revMeta.issueDate || "",
          submitted_date: revMeta.issueDate || "",
        },
        submittedDate: revMeta.issueDate || "",
        sheetCount: newSheetCount,
        percentComplete: matchedSheets.length
          ? Math.round((matchedSheets.filter((match) => match.change !== "removed").length / matchedSheets.length) * 100)
          : 0,
      }).catch(() => null);

      setApplyStats({ updated, added, removed });
      setProcessingPct(100);
      await new Promise(r => setTimeout(r, 500));
      setStep("success");
      if (onComplete) onComplete();
    } catch (error) {
      console.error("Revision apply failed:", error);
      setFlowError(error?.message || "Failed to apply revision changes.");
      setStep("comparison");
    }
  };

  const reset = () => {
    setStep(preSelectedSet ? "revMeta" : "selectSet");
    setSelectedSet(preSelectedSet || null);
    setRevMeta({ revisionLabel: "", issueDate: new Date().toISOString().split("T")[0], issuedBy: "", notes: "", disposition: "superseded" });
    setPdfFile(null); setMatchedSheets([]);
    setFlowError("");
    setFallbackMode("");
  };

  const handleClose = () => { reset(); onClose(); };

  const STEP_LABELS = { selectSet: "Select Set", revMeta: "Revision Info", dropPDF: "Upload PDF", comparison: "Review Changes", success: "Done" };
  const STEP_ORDER = ["selectSet", "revMeta", "dropPDF", "comparison", "success"];
  const stepIdx = STEP_ORDER.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent style={{ maxWidth: 620, maxHeight: "92vh", overflowY: "auto", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)" }}>
        <DialogHeader>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 17, fontWeight: 700, color: "var(--text-primary)" }}>New Revision Upload</span>
              {step !== "processing" && (
                <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
                  {STEP_ORDER.filter(s => s !== "processing").map((s, i) => (
                    <div key={s} style={{ width: 18, height: 4, borderRadius: 2, background: STEP_ORDER.indexOf(step) >= i ? "var(--accent)" : "rgba(255,255,255,0.08)" }} />
                  ))}
                </div>
              )}
            </div>
          </DialogTitle>
          <DialogDescription style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Upload a revised set PDF, review detected sheet changes, and supersede the prior revision records.
          </DialogDescription>
        </DialogHeader>

        <div style={{ paddingTop: 8 }}>
          {flowError && step !== "processing" && (
            <div style={{
              marginBottom: 12,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--danger-border)",
              background: "var(--danger-muted)",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--danger)"
            }}>
              {flowError}
            </div>
          )}
          {fallbackMode === "existing-sheets" && step === "comparison" && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,180,0,0.20)",
                background: "rgba(255,180,0,0.08)",
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "var(--status-warning)",
              }}
            >
              This revision was uploaded using the large-file fallback. Existing sheets will receive the new revision metadata and file, but added/removed sheets were not AI-compared.
            </div>
          )}
          {step === "selectSet" && (
            <StepSelectSet drawingSets={availableSets} preSelectedSet={preSelectedSet} onSelect={s => { setSelectedSet(s); setRevMeta(p => ({ ...p, issuedBy: s.current_issued_by || "" })); setStep("revMeta"); }} onClose={handleClose} loading={false} error={null} />
          )}
          {step === "revMeta" && selectedSet && (
            <StepRevMeta selectedSet={selectedSet} revMeta={revMeta} setRevMeta={setRevMeta} onBack={() => preSelectedSet ? handleClose() : setStep("selectSet")} onNext={() => setStep("dropPDF")} />
          )}
          {step === "dropPDF" && (
            <StepDropPDF selectedSet={selectedSet} revMeta={revMeta} file={pdfFile} setFile={setPdfFile} onBack={() => setStep("revMeta")} onExtract={handleExtract} />
          )}
          {step === "processing" && <StepProcessing message={processingMsg} progress={processingPct} />}
          {step === "comparison" && (
            <StepSheetComparison selectedSet={selectedSet} revMeta={revMeta} matchedSheets={matchedSheets} setMatchedSheets={setMatchedSheets} onBack={() => setStep("dropPDF")} onConfirm={handleApply} />
          )}
          {step === "success" && (
            <StepSuccess selectedSet={selectedSet} revMeta={revMeta} stats={applyStats} onClose={handleClose} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
