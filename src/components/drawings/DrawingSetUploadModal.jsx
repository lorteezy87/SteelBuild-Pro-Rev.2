import React, { useState, useRef } from "react";
import { entities, integrations } from "@/api/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, ChevronRight, ChevronLeft, Check, AlertTriangle } from "lucide-react";
import { extractSheetsFromPdf, EMPTY_SET_META, parseFilename, validatePdfPage } from "@/lib/pdfSheetExtractor";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";
import { sanitizeDrawingPayload, sanitizeDrawingSetPayload } from "@/lib/drawingEnums";
import { STAGE_ORDER as CANONICAL_STAGE_ORDER } from "@/components/drawings/drawingsConfig";
import { withDrawingSetNumberMetadata } from "@/lib/drawingSetOrdering";
import { isPdfFile, normalizeRevisionNumber, withTimeout, newUploadBatchId } from "@/lib/drawingUploadUtils";
import { sheetReviewFlags } from "@/components/drawings/intakeReview";
import { logActivity } from "@/services/auditLogger";

const DISCIPLINES = ["Structural", "Arch", "MEP", "Civil", "Misc Metals"];
// Canonical 7-stage flow (Not Started → IFA → OFA → BFA → OFS → IFC → Released)
const STAGES      = CANONICAL_STAGE_ORDER;
const MAX_PDF_SIZE_MB = 32;
const UPLOAD_TIMEOUT_MS  = 90_000;   // 90 s
const EXTRACT_TIMEOUT_MS = 300_000;  // 5 min — includes rate-limit retry backoff time

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── PDF → sheets extraction ──────────────────────────────────────────
//
// All the heavy lifting (columnar pdfjs text extraction, Anthropic
// tool-use schema, post-processing fixup, de-dup) lives in the shared
// `src/lib/pdfSheetExtractor.js` module so this modal and
// RevisionUploadModal share a single code path.

// Router: short-circuit on oversize files (skip the LLM round-trip);
// otherwise delegate to the shared extractor.
async function validateAndExtract(file, options = {}) {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_PDF_SIZE_MB) {
    console.warn(`PDF too large (${sizeMB.toFixed(1)}MB). Using filename fallback.`);
    const parsed = parseFilename(file.name);
    return {
      setMeta: { ...EMPTY_SET_META },
      sheets: [{
        sheetNumber: parsed.sheetNumber,
        sheetTitle:  parsed.sheetNumber ? "" : file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "),
        discipline:  "Structural",
        sheetType:   "General",
        revision:    parsed.revision || "0",
        scale:       "",
        date:        "",
        _note:       "File too large for AI extraction." + (parsed.sheetNumber ? ` Sheet # "${parsed.sheetNumber}" extracted from filename.` : " Please fill in sheet details manually."),
      }],
      scanned:  false,
      tooLarge: true,
    };
  }
  return extractSheetsFromPdf(file, options);
}

// ─── Step 0: New Set vs New Revision choice ───────────────────────────
function StepChoice({ onNewSet, onNewRevision, onClose }) {
  const [hovered, setHovered] = useState(null);
  const options = [
    { id: "new", icon: "📐", title: "New Drawing Set", desc: "First time uploading this drawing package — creates a new entry in the Drawing Log.", action: onNewSet },
    { id: "revision", icon: "↑", title: "New Revision", desc: "Updating an existing set (OFA → IFC, IFC → IFC Rev 1…) — replaces old revision in place.", action: onNewRevision },
  ];
  return (
    <div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Is this a new drawing set or a new revision of an existing set?
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {options.map(opt => (
          <div key={opt.id} onClick={opt.action}
            onMouseEnter={() => setHovered(opt.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              padding: "16px 18px", borderRadius: 10, cursor: "pointer",
              background: hovered === opt.id ? "var(--warning-muted)" : "var(--hover-bg)",
              border: `1px solid ${hovered === opt.id ? "var(--warning-border)" : "var(--bg-surface-high)"}`,
              transition: "all 0.12s", display: "flex", alignItems: "flex-start", gap: 14
            }}>
            <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{opt.icon}</span>
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{opt.title}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{opt.desc}</div>
            </div>
            <ChevronRight style={{ width: 14, height: 14, color: "var(--text-muted)", flexShrink: 0, marginLeft: "auto", marginTop: 4 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Step 2: File Queue ───────────────────────────────────────────────
// Kicking "Upload & Extract" starts AI processing immediately — no extra
// click required per the new flow.
function StepFiles({ files, setFiles, onBack, onUpload, setName }) {
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
          style={{ background: "var(--accent)", color: "#fff", border: "none", opacity: files.length === 0 ? 0.5 : 1 }}>
          Upload &amp; Extract <ChevronRight style={{ width: 14, height: 14, marginLeft: 4 }} />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 1: Set Name + optional defaults (BEFORE file selection) ─────
// The only required field is the Drawing Set Name. All other fields are
// defaults that get applied per-sheet unless the AI extraction finds
// something better (or the user edits the child rows on the review step).
function StepMeta({ meta, setMeta, onBack, onNext, projectName, existingSetNames = [] }) {
  const set = (k, v) => setMeta(p => ({ ...p, [k]: v }));
  const trimmedName = (meta.setName || "").trim();
  const canContinue = trimmedName.length > 0;
  const duplicate = canContinue && existingSetNames
    .map(s => s.toLowerCase())
    .includes(trimmedName.toLowerCase());

  return (
    <div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
        Name this drawing package. You can adjust individual sheet details after
        the AI reads your files.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Label>Project</Label>
          <Input value={projectName || "No project selected"} disabled />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <Label>
            Drawing Set Name <span style={{ color: "var(--status-error)" }}>*</span>
          </Label>
          <Input
            autoFocus
            placeholder="e.g. 100% CD Set — Rev 2"
            value={meta.setName}
            onChange={e => set("setName", e.target.value)}
            list="existing-set-names"
          />
          {existingSetNames.length > 0 && (
            <datalist id="existing-set-names">
              {existingSetNames.map(n => <option key={n} value={n} />)}
            </datalist>
          )}
          {duplicate && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", marginTop: 4, letterSpacing: "0.06em" }}>
              ⚠ A set with this name already exists in this project — new sheets will be added to it.
            </div>
          )}
        </div>

        <div>
          <Label>Drawing Set # (optional)</Label>
          <Input placeholder="e.g. 1 / 02 / P-03" value={meta.setNumber || ""} onChange={e => set("setNumber", e.target.value)} />
        </div>

        <div>
          <Label>Default Discipline (optional)</Label>
          <Select value={meta.discipline} onValueChange={v => set("discipline", v)}>
            <SelectTrigger><SelectValue placeholder="Structural" /></SelectTrigger>
            <SelectContent>{DISCIPLINES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div>
          <Label>Default Stage (optional)</Label>
          <Select value={meta.defaultStage} onValueChange={v => set("defaultStage", v)}>
            <SelectTrigger><SelectValue placeholder="Not Started" /></SelectTrigger>
            <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div>
          <Label>Revision / Issuance (optional)</Label>
          <Input placeholder="Rev 2 / IFC / IFB" value={meta.revision} onChange={e => set("revision", e.target.value)} />
        </div>

        <div>
          <Label>Issue Date (optional)</Label>
          <Input type="date" value={meta.issueDate} onChange={e => set("issueDate", e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Button variant="outline" onClick={onBack}><ChevronLeft style={{ width: 14, height: 14, marginRight: 4 }} /> Back</Button>
        <Button onClick={onNext} disabled={!canContinue}
          style={{ background: "var(--accent)", color: "#fff", border: "none", opacity: canContinue ? 1 : 0.5 }}>
          Next: Add Files <ChevronRight style={{ width: 14, height: 14, marginLeft: 4 }} />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Processing UI ────────────────────────────────────────────
function StepProcessing({ processingStatus, onCancel, error }) {
  const { steps = [], currentStepId, progress = 0, message = "" } = processingStatus;

  if (error) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>⚠</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--status-error)", marginBottom: 8 }}>
          Processing Failed
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", marginBottom: 24, maxWidth: 360, margin: "0 auto 24px" }}>
          {error}
        </div>
        <Button variant="outline" onClick={onCancel}>← Start Over</Button>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>✦</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
          Processing Drawing Set
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>{message}</div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ background: "var(--bg-surface-high)", borderRadius: 20, height: 6, overflow: "hidden", maxWidth: 400, margin: "0 auto" }}>
          <div style={{ height: "100%", background: "var(--accent)", borderRadius: 20, width: `${progress}%`, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", marginTop: 5 }}>{progress}%</div>
      </div>

      {/* Step list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400, margin: "0 auto" }}>
        {steps.map((step) => {
          const isDone    = step.done;
          const isActive  = step.id === currentStepId && !isDone;
          const isWarning = step.warning;
          return (
            <div key={step.id} style={{
              display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px",
              borderRadius: 8,
              background: isActive ? "var(--warning-muted)" : isDone ? "rgba(0,214,143,0.04)" : "transparent",
              border: `1px solid ${isActive ? "rgba(245,158,11,0.2)" : isDone ? "rgba(0,214,143,0.12)" : "var(--hover-bg)"}`,
              transition: "all 0.2s",
            }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 1, flexShrink: 0,
                color: isDone && !isWarning ? "var(--status-success)" : isWarning ? "var(--status-warning)" : isActive ? "var(--status-warning)" : "var(--text-muted)",
              }}>
                {isDone && !isWarning ? "✓" : isWarning ? "⚠" : isActive ? (
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>
                ) : "○"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: isActive ? "var(--text-primary)" : isDone ? "var(--text-secondary)" : "var(--text-muted)" }}>
                  {step.label}
                </div>
                {step.detail && isActive && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2, letterSpacing: "0.06em" }}>
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel escape hatch */}
      <div style={{ textAlign: "center", marginTop: 20 }}>
        <button
          onClick={onCancel}
          style={{
            background: "none", border: "none", color: "var(--text-muted)",
            fontFamily: "var(--font-mono)", fontSize: 9, cursor: "pointer",
            letterSpacing: "0.08em", textDecoration: "underline",
          }}
        >
          cancel &amp; start over
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Review Sheets ────────────────────────────────────────────
function StepReview({ sheets, setSheets, fileResults, meta, setMeta, aiFilledFields = {}, onBack, onCreate, existingDrawings = [] }) {
  const [search, setSearch]         = useState("");
  const [discFilter, setDiscFilter] = useState("all");
  const [fileFilter, setFileFilter] = useState("all");

  const setMetaField = (k, v) => setMeta(prev => ({ ...prev, [k]: v }));
  const anyAiFilled = Object.values(aiFilledFields).some(Boolean);

  const multiFile = fileResults.length > 1;

  const filtered = sheets.filter(s => {
    const matchSearch = !search || s.sheetNumber?.toLowerCase().includes(search.toLowerCase()) || s.sheetTitle?.toLowerCase().includes(search.toLowerCase());
    const matchDisc   = discFilter === "all" || s.discipline === discFilter;
    const matchFile   = fileFilter === "all" || s.sourceFile === fileFilter;
    return matchSearch && matchDisc && matchFile;
  });

  const selectedCount = sheets.filter(s => s.selected).length;
  const toggleAll = (val) => setSheets(prev => prev.map(s => ({ ...s, selected: val })));
  const toggleOne = (filteredIdx) => {
    const realIdx = sheets.indexOf(filtered[filteredIdx]);
    setSheets(prev => prev.map((s, i) => i === realIdx ? { ...s, selected: !s.selected } : s));
  };
  const updateSheet = (filteredIdx, key, val) => {
    const realIdx = sheets.indexOf(filtered[filteredIdx]);
    setSheets(prev => prev.map((s, i) => i === realIdx ? { ...s, [key]: val } : s));
  };

  const uniqueFiles = [...new Set(sheets.map(s => s.sourceFile).filter(Boolean))];
  // Every soft problem (scanned, too large, extraction timed out) shows the
  // same amber "manual entry required" warning. Uploads are still allowed —
  // extractFailed PDFs produce a single pre-populated sheet row the user can
  // edit inline, so blocking the Create button here would dead-end them.
  const warnedFiles = fileResults.filter(r => r.scanned || r.tooLarge || r.extractFailed);

  // Per-sheet review signal (intakeReview) — the honest "confidence" surface:
  // the extractor returns no model confidence, so we flag sheets with a concrete
  // quality problem (bad-source row, fallback, or missing sheet #) for a closer
  // look before commit. Same fn the persisted ai_extraction_status uses, so the
  // badge and the saved status never disagree.
  const fileResultsByName = new Map(fileResults.map(r => [r.fileName, r]));
  const reviewCount = sheets.reduce(
    (n, s) => n + (sheetReviewFlags(s, fileResultsByName.get(s.sourceFile)).needsReview ? 1 : 0),
    0,
  );

  const aiBadge = (filled) => filled ? (
    <span title="Auto-filled by AI — edit if wrong" style={{
      fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.1em",
      padding: "1px 4px", borderRadius: 3, marginLeft: 6,
      background: "rgba(132,204,22,0.12)", color: "#84CC16",
      border: "1px solid rgba(132,204,22,0.3)", verticalAlign: "middle",
    }}>✦ AI</span>
  ) : null;

  const metaFieldStyle = {
    width: "100%",
    background: "var(--bg-surface-low)",
    border: "1px solid var(--bg-surface-high)",
    borderRadius: 6,
    padding: "5px 8px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    boxSizing: "border-box",
  };
  const metaLabelStyle = {
    display: "block",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    letterSpacing: "0.12em",
    color: "var(--text-muted)",
    marginBottom: 3,
    textTransform: "uppercase",
  };

  return (
    <div>
      {/* AI-detected set metadata — editable */}
      <div style={{
        padding: "10px 12px",
        border: `1px solid ${anyAiFilled ? "rgba(132,204,22,0.30)" : "var(--bg-surface-high)"}`,
        background: anyAiFilled ? "rgba(132,204,22,0.05)" : "var(--bg-surface-low)",
        borderRadius: 8,
        marginBottom: 10,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em",
          color: anyAiFilled ? "#84CC16" : "var(--text-muted)", textTransform: "uppercase", fontWeight: 700,
        }}>
          {anyAiFilled ? "✦ AI-DETECTED SET METADATA" : "SET METADATA"}
          <span style={{ fontWeight: 400, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "none" }}>
            — verify before creating
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / 3" }}>
            <label style={metaLabelStyle}>Drawing Set Name{aiBadge(aiFilledFields.setName)}</label>
            <input style={metaFieldStyle} value={meta.setName}
              onChange={e => setMetaField("setName", e.target.value)}
              placeholder="e.g. 100% CD Set — Rev 2" />
          </div>
          <div>
            <label style={metaLabelStyle}>Drawing Set #</label>
            <input style={metaFieldStyle} value={meta.setNumber || ""}
              onChange={e => setMetaField("setNumber", e.target.value)}
              placeholder="e.g. 1 / 02 / P-03" />
          </div>
          <div>
            <label style={metaLabelStyle}>Revision{aiBadge(aiFilledFields.revision)}</label>
            <input style={metaFieldStyle} value={meta.revision}
              onChange={e => setMetaField("revision", e.target.value)}
              placeholder="Rev 2 / IFC" />
          </div>
          <div>
            <label style={metaLabelStyle}>Issue Date{aiBadge(aiFilledFields.issueDate)}</label>
            <input type="date" style={metaFieldStyle} value={meta.issueDate}
              onChange={e => setMetaField("issueDate", e.target.value)} />
          </div>
          <div>
            <label style={metaLabelStyle}>Issued By{aiBadge(aiFilledFields.issuedBy)}</label>
            <input style={metaFieldStyle} value={meta.issuedBy}
              onChange={e => setMetaField("issuedBy", e.target.value)}
              placeholder="Smith Engineering" />
          </div>
          <div>
            <label style={metaLabelStyle}>Default Discipline{aiBadge(aiFilledFields.discipline)}</label>
            <select style={metaFieldStyle} value={meta.discipline}
              onChange={e => setMetaField("discipline", e.target.value)}>
              {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Warnings — all soft failures share the amber "fill in manually" treatment */}
      {warnedFiles.map(r => (
        <div key={r.fileName} style={{
          display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px",
          background: "var(--warning-muted)", border: "1px solid var(--warning-border)",
          borderRadius: 8, marginBottom: 10,
        }}>
          <AlertTriangle style={{ width: 14, height: 14, color: "var(--status-warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>
            {r.extractFailed ? (
              <>
                <span style={{ color: "var(--status-warning)", fontWeight: 600 }}>{r.fileName}</span> could not be auto-extracted by AI. A blank sheet row has been added below — please fill in the sheet details manually, then click Create.
                {r.error && (
                  <div style={{ marginTop: 4, padding: "4px 6px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", background: "rgba(0,0,0,0.2)", borderRadius: 4, letterSpacing: "0.04em" }}>
                    {r.error}
                  </div>
                )}
              </>
            ) : r.scanned ? (
              <><span style={{ color: "var(--status-warning)", fontWeight: 600 }}>{r.fileName}</span> appears to be a scanned image PDF. AI text extraction is not available. Please enter sheet details manually or upload a digitally-created PDF.</>
            ) : (
              <><span style={{ color: "var(--status-warning)", fontWeight: 600 }}>{r.fileName}</span> is too large ({r.sizeMB?.toFixed(1)}MB) for AI extraction. Please fill in sheet details manually.</>
            )}
          </div>
        </div>
      ))}

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={() => toggleAll(true)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-warning)", background: "none", border: "1px solid var(--warning-border)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", letterSpacing: "0.08em" }}>☑ ALL</button>
        <button onClick={() => toggleAll(false)} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", background: "none", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", letterSpacing: "0.08em" }}>☐ NONE</button>
        <input placeholder="Search sheets..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 100, background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "4px 10px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12 }} />
        <select value={discFilter} onChange={e => setDiscFilter(e.target.value)}
          style={{ background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "4px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
          <option value="all">All Disciplines</option>
          {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {multiFile && (
          <select value={fileFilter} onChange={e => setFileFilter(e.target.value)}
            style={{ background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "4px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9, maxWidth: 140 }}>
            <option value="all">All Files</option>
            {uniqueFiles.map(f => <option key={f} value={f}>{f.replace(/\.pdf$/i, "")}</option>)}
          </select>
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {sheets.length} sheets · <span style={{ color: "var(--status-warning)" }}>{selectedCount} selected</span>
          {reviewCount > 0 && <> · <span style={{ color: "#D97706" }}>{reviewCount} to review</span></>}
        </span>
      </div>

      {/* Table */}
      <div style={{ maxHeight: 320, overflowY: "auto", background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 8, marginBottom: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg-surface-low)", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ width: 32, padding: "7px 10px" }}></th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>SHEET #</th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>TITLE</th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>DISCIPLINE</th>
              <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>REV</th>
              {multiFile && <th style={{ padding: "7px 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>SOURCE</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => {
              const review = sheetReviewFlags(s, fileResultsByName.get(s.sourceFile));
              return (
              <tr key={i} style={{ borderBottom: "1px solid var(--divider)", background: s.selected ? "var(--warning-muted)" : "transparent" }}>
                <td style={{ padding: "6px 10px", textAlign: "center" }}>
                  <input type="checkbox" checked={!!s.selected} onChange={() => toggleOne(i)} style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input value={s.sheetNumber || ""} onChange={e => updateSheet(i, "sheetNumber", e.target.value)}
                      style={{ background: "transparent", border: "1px solid transparent", borderRadius: 4, padding: "2px 6px", color: "var(--status-warning)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, width: 76 }}
                      onFocus={e => e.target.style.borderColor = "rgba(245,158,11,0.4)"}
                      onBlur={e => e.target.style.borderColor = "transparent"} />
                    {s.sheetNumber && existingDrawings.some(d => d.sheet_number === s.sheetNumber) && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#D97706", background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", letterSpacing: "0.06em", fontWeight: 600 }}>
                        ⚠ EXISTS IN PROJECT
                      </span>
                    )}
                    {review.needsReview && (
                      <span title={`Needs review: ${review.reasons.join(", ")}`}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#D97706", background: "rgba(217,119,6,0.10)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", letterSpacing: "0.06em", fontWeight: 600 }}>
                        ⚠ REVIEW
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <input value={s.sheetTitle || ""} onChange={e => updateSheet(i, "sheetTitle", e.target.value)}
                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: 4, padding: "2px 6px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, width: "100%", minWidth: 140 }}
                    onFocus={e => e.target.style.borderColor = "rgba(245,158,11,0.4)"}
                    onBlur={e => e.target.style.borderColor = "transparent"} />
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <select value={s.discipline || "Structural"} onChange={e => updateSheet(i, "discipline", e.target.value)}
                    style={{ background: "var(--bg-surface-low)", border: "1px solid var(--bg-surface-high)", borderRadius: 4, padding: "2px 6px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
                    {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
                <td style={{ padding: "6px 10px" }}>
                  <input value={s.revision || "0"} onChange={e => updateSheet(i, "revision", e.target.value)}
                    style={{ background: "transparent", border: "1px solid transparent", borderRadius: 4, padding: "2px 6px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, width: 36 }}
                    onFocus={e => e.target.style.borderColor = "rgba(245,158,11,0.4)"}
                    onBlur={e => e.target.style.borderColor = "transparent"} />
                </td>
                {multiFile && (
                  <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.sourceFile?.replace(/\.pdf$/i, "") || "—"}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>No sheets match filter</div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Button variant="outline" onClick={onBack}><ChevronLeft style={{ width: 14, height: 14, marginRight: 4 }} /> Back</Button>
        <Button
          onClick={() => onCreate(sheets.filter(s => s.selected))}
          disabled={selectedCount === 0}
          style={{ background: "var(--accent)", color: "#fff", border: "none" }}
        >
          Create {selectedCount} {selectedCount === 1 ? "Entry" : "Entries"} <ChevronRight style={{ width: 14, height: 14, marginLeft: 4 }} />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 5: Success ─────────────────────────────────────────────────
function StepSuccess({ createdCount, fileResults, onViewLog, onUploadAnother }) {
  return (
    <div style={{ textAlign: "center", padding: "30px 0" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--success-muted)", border: "2px solid var(--success-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Check style={{ width: 24, height: 24, color: "var(--status-success)" }} />
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Upload Complete</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", marginBottom: 24 }}>
        {fileResults.map(r => (
          <div key={r.fileName} style={{ fontFamily: "var(--font-body)", fontSize: 12, color: r.status === "failed" ? "var(--status-error-bright)" : "var(--text-muted)" }}>
            {r.status === "failed" ? "✗" : "✓"} {r.fileName} — {r.status === "failed" ? `failed: ${r.error}` : `${r.sheetCount} sheets`}
          </div>
        ))}
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--status-success)", marginTop: 6, fontWeight: 600 }}>
          ✓ {createdCount} Drawing Log {createdCount === 1 ? "entry" : "entries"} created
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>✓ Drawing Log updated</div>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <Button variant="outline" onClick={onUploadAnother}>Upload Another Set</Button>
        <Button onClick={onViewLog} style={{ background: "var(--accent)", color: "#fff", border: "none" }}>
          View Drawing Log
        </Button>
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────
//
// Wizard flow (new parent/child model):
//   0: Choice         — new drawing set vs new revision
//   1: Meta           — set name (required) + optional defaults
//   2: Files          — drag/drop multi-file picker
//   3: Processing     — upload + AI extraction (auto-started, no extra click)
//   4: Review         — verify AI-extracted sheets
//   5: Success        — report with per-file status
//
// On commit (handleCreate) we:
//   1. Create a single parent `drawing_sets` row via DrawingSet.create(...)
//   2. Create each child `drawings` row with drawing_set_id FK + upload_batch_id
//      + upload_status + ai_extraction_status set accurately
//   3. The DB trigger sync_drawing_set_counts() keeps parent aggregates fresh.
//
export default function DrawingSetUploadModal({
  open,
  onClose,
  onComplete,
  activeProject,
  onNewRevision,
  existingDrawings = [],
  existingSetNames = [],
}) {
  const qc = useQueryClient();
  const [step, setStep]                   = useState(0);
  const [files, setFiles]                 = useState([]);
  const [meta, setMeta]                   = useState({
    setName: "", setNumber: "", discipline: "Structural", defaultStage: "Not Started",
    revision: "0",
    issueDate: new Date().toISOString().split("T")[0], issuedBy: "", notes: "",
  });
  const [processingStatus, setProcessingStatus] = useState({ steps: [], currentStepId: null, progress: 0, message: "" });
  const [sheets, setSheets]               = useState([]);
  const [fileResults, setFileResults]     = useState([]);
  const [createdCount, setCreatedCount]   = useState(0);
  const [processError, setProcessError]   = useState(null);
  const [aiFilledFields, setAiFilledFields] = useState({}); // { setName: true, ... }
  const [uploadBatchId, setUploadBatchId] = useState(null); // set once per upload attempt
  const cancelledRef                      = useRef(false);

  const makeSteps = (activeId, doneIds = [], warnings = {}) => [
    { id: "upload",  label: "Uploading files to storage...",        done: doneIds.includes("upload")  },
    { id: "encode",  label: "Preparing PDF for AI reading...",       done: doneIds.includes("encode")  },
    { id: "extract", label: "✦ Claude is reading your drawing set...", detail: "Scanning title blocks and sheet index", done: doneIds.includes("extract"), warning: warnings["extract"] },
    { id: "parse",   label: "Building sheet list...",                done: doneIds.includes("parse")   },
    { id: "done",    label: null,                                    done: doneIds.includes("done")    },
  ];

  const reset = () => {
    cancelledRef.current = true;  // abort any in-progress operation
    setStep(0); setFiles([]); setSheets([]); setFileResults([]); setCreatedCount(0);
    setProcessError(null);
    setAiFilledFields({});
    setUploadBatchId(null);
    setProcessingStatus({ steps: [], currentStepId: null, progress: 0, message: "" });
    setMeta({ setName: "", setNumber: "", discipline: "Structural", defaultStage: "Not Started", revision: "0", issueDate: new Date().toISOString().split("T")[0], issuedBy: "", notes: "" });
  };

  const handleClose = () => { reset(); onClose(); };

  const handleUploadAndProcess = async () => {
    cancelledRef.current = false;
    setProcessError(null);
    setStep(3);
    // Generate a fresh batch id for this upload attempt so every child sheet
    // carries the same id — makes it trivial to group or rollback later.
    const batchId = newUploadBatchId();
    setUploadBatchId(batchId);
    const allSheets  = [];
    const results    = [];
    const totalFiles = files.length;
    const aggregateSetMeta = { ...EMPTY_SET_META };
    const aiFilled = {};

    // If the user typed a set name that matches an existing set with a saved
    // titleblock template, fetch it so extraction uses rect-based OCR instead
    // of asking the LLM to guess sheet titles/numbers.
    let titleblockTemplate = null;
    try {
      const setName = (meta.setName || "").trim();
      if (setName && activeProject?.id) {
        const existing = await entities.DrawingSet.filter({
          project_id: activeProject.id,
          set_name:   setName,
        });
        if (Array.isArray(existing) && existing.length > 0) {
          const tRect = existing[0].titleblock_title_rect;
          const nRect = existing[0].titleblock_number_rect;
          if (tRect && nRect) {
            titleblockTemplate = { titleRect: tRect, numberRect: nRect };
          }
        }
      }
    } catch (e) {
      console.warn("Titleblock template lookup failed — extraction will use LLM fallback:", e);
    }

    try {
      for (let i = 0; i < files.length; i++) {
        if (cancelledRef.current) break;
        const file = files[i];

        // ── Upload ──
        setProcessingStatus({
          steps: makeSteps("upload", []),
          currentStepId: "upload",
          progress: Math.round((i / totalFiles) * 15),
          message: `Uploading ${file.name}… (${i + 1} of ${totalFiles})`,
        });

        let fileUrl;
        try {
          const res = await withTimeout(
            integrations.Core.UploadFile({ file }),
            UPLOAD_TIMEOUT_MS,
            "File upload"
          );
          fileUrl = res?.file_url || res?.url;
          if (!fileUrl) throw new Error("Upload succeeded but no file URL was returned");
        } catch (err) {
          results.push({ fileName: file.name, sheetCount: 0, status: "failed", error: err.message });
          continue;
        }

        if (cancelledRef.current) break;

        const baseProgress = Math.round(((i + 0.2) / totalFiles) * 90);

        // ── Encode ──
        setProcessingStatus({
          steps: makeSteps("encode", ["upload"]),
          currentStepId: "encode",
          progress: baseProgress + 5,
          message: `Preparing ${file.name} for AI…`,
        });

        // ── Extract ──
        setProcessingStatus({
          steps: makeSteps("extract", ["upload", "encode"]),
          currentStepId: "extract",
          progress: baseProgress + 10,
          message: `Claude is reading ${file.name}… (${i + 1} of ${totalFiles})`,
        });

        const sizeMB = file.size / (1024 * 1024);
        let extractResult;
        try {
          extractResult = await withTimeout(
            validateAndExtract(file, {
              ...(titleblockTemplate ? { titleblockTemplate } : {}),
              onStatus: (status) => {
                if (status.phase === 'rate-limit-wait') {
                  setProcessingStatus(prev => ({
                    ...prev,
                    message: `Rate limit cooldown — ${status.remainingSec}s before reading ${file.name}… (${i + 1} of ${totalFiles})`,
                  }));
                } else if (status.phase === 'llm-calling') {
                  setProcessingStatus(prev => ({
                    ...prev,
                    message: `Claude is reading ${file.name}… (${i + 1} of ${totalFiles})`,
                  }));
                }
              },
            }),
            EXTRACT_TIMEOUT_MS,
            "AI extraction"
          );
        } catch (err) {
          // On timeout/extract failure, fall back to filename-parsed row
          const parsed = parseFilename(file.name);
          extractResult = {
            setMeta: { ...EMPTY_SET_META },
            sheets: [{
              sheetNumber: parsed.sheetNumber,
              sheetTitle: parsed.sheetNumber ? "" : file.name.replace(/\.pdf$/i, ""),
              discipline: meta.discipline, sheetType: "General",
              revision: parsed.revision || "0", scale: "", date: "",
              _note: `Extraction failed: ${err.message}.` + (parsed.sheetNumber ? ` Sheet # "${parsed.sheetNumber}" extracted from filename.` : " Please fill in manually."),
            }],
            scanned: false,
            extractFailed: true,
            error: err.message,
          };
        }

        if (cancelledRef.current) break;

        // ── Parse ──
        setProcessingStatus({
          steps: makeSteps("parse", ["upload", "encode", "extract"], extractResult.scanned ? { extract: true } : {}),
          currentStepId: "parse",
          progress: baseProgress + 20,
          message: `Building sheet list for ${file.name}…`,
        });

        // Aggregate set-level metadata across files (first non-empty wins)
        const extractedSetMeta = extractResult.setMeta || {};
        for (const key of Object.keys(aggregateSetMeta)) {
          const v = String(extractedSetMeta[key] ?? "").trim();
          if (v && !aggregateSetMeta[key]) aggregateSetMeta[key] = v;
        }

        const tagged = extractResult.sheets.map(s => ({
          ...s,
          discipline:    s.discipline || meta.discipline,
          sourceFile:    file.name,
          sourceFileUrl: fileUrl,
          selected:      true,
        }));

        allSheets.push(...tagged);
        results.push({
          fileName:      file.name,
          fileUrl,
          sheetCount:    extractResult.sheets.length,
          status:        "success",
          scanned:       extractResult.scanned       || false,
          tooLarge:      extractResult.tooLarge      || false,
          extractFailed: extractResult.extractFailed || false,
          sizeMB,
        });

        // Small UI buffer; main inter-call pacing lives in pdfSheetExtractor
        if (i < files.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      if (cancelledRef.current) return;  // user cancelled — stay at step 0 (reset already called)

      // ── Merge AI-detected set metadata into meta state ──
      // Only fill fields the user left blank; never overwrite user input.
      const defaultIssueDate = new Date().toISOString().split("T")[0];
      setMeta(prev => {
        const merged = { ...prev };
        const tryFill = (prevKey, aiKey) => {
          const current = String(prev[prevKey] ?? "").trim();
          const aiVal = String(aggregateSetMeta[aiKey] ?? "").trim();
          // Treat today's default issueDate as "blank" so AI can overwrite it
          const isDefault = prevKey === "issueDate" && current === defaultIssueDate;
          // Treat "0" revision as "blank" so AI can overwrite it
          const isDefaultRev = prevKey === "revision" && (current === "0" || current === "");
          if (aiVal && (!current || isDefault || isDefaultRev)) {
            merged[prevKey] = aiVal;
            aiFilled[prevKey] = true;
          }
        };
        tryFill("setName",    "setName");
        tryFill("setNumber",  "setNumber");
        tryFill("setNumber",  "drawingSetNumber");
        tryFill("revision",   "revision");
        tryFill("issueDate",  "issueDate");
        tryFill("issuedBy",   "issuedBy");
        tryFill("discipline", "discipline");
        return merged;
      });
      setAiFilledFields(aiFilled);

      // ── Done ──
      setProcessingStatus({
        steps: makeSteps(null, ["upload", "encode", "extract", "parse", "done"]),
        currentStepId: null,
        progress: 100,
        message: `Found ${allSheets.length} sheets across ${results.filter(r => r.status === "success").length} file(s)`,
      });

      setSheets(allSheets);
      setFileResults(results);
      await new Promise(r => setTimeout(r, 600));

      if (!cancelledRef.current) setStep(4);

    } catch (fatalErr) {
      // Completely unexpected error — show it in the processing screen
      console.error("Fatal upload error:", fatalErr);
      setProcessError(fatalErr.message || "An unexpected error occurred. Please try again.");
    }
  };

  const handleCreate = async (selectedSheets) => {
    cancelledRef.current = false;
    setProcessError(null);
    setStep(3);
    setProcessingStatus({ steps: [], currentStepId: null, progress: 0, message: `Creating ${selectedSheets.length} drawing entries…` });

    const resolvedSetName = (meta.setName || "").trim() || meta.revision || "Drawing Set";
    const batchId = uploadBatchId || newUploadBatchId();
    const setNumber = (meta.setNumber || "").trim();

    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 1 — Find or create the parent drawing_sets record.
      //
      // We check first so re-uploading into an existing named set just
      // appends children to the same parent (idempotent across sessions).
      // ─────────────────────────────────────────────────────────────
      setProcessingStatus(prev => ({ ...prev, progress: 5, message: "Creating drawing set…" }));

      let parentSetId = null;
      let parentSetMetadata = null;
      try {
        // First check active (non-deleted) sets
        const existing = await entities.DrawingSet.filter({
          project_id: activeProject?.id,
          set_name:   resolvedSetName,
        });
        if (Array.isArray(existing) && existing.length > 0) {
          parentSetId = existing[0].id;
          parentSetMetadata = existing[0].metadata;
        }

        // If none found, check for soft-deleted sets and restore them.
        // The DB unique index covers ALL rows (including is_deleted=true),
        // so creating a new row with the same name would violate the constraint.
        if (!parentSetId) {
          const deleted = await entities.DrawingSet.filter({
            project_id: activeProject?.id,
            set_name:   resolvedSetName,
            is_deleted:  true,
          });
          if (Array.isArray(deleted) && deleted.length > 0) {
            parentSetId = deleted[0].id;
            parentSetMetadata = deleted[0].metadata;
            // Restore the soft-deleted row
            await entities.DrawingSet.update(parentSetId, {
              is_deleted: false,
              deleted_at: null,
            });
          }
        }

        // Refresh the parent's metadata to reflect this upload
        if (parentSetId) {
          try {
            await entities.DrawingSet.update(parentSetId, {
              upload_batch_id: batchId,
              revision:        meta.revision || "",
              issued_date:     meta.issueDate || null,
              issued_by:       meta.issuedBy  || "",
              discipline:      meta.discipline || "",
              notes:           meta.notes || "",
              ...(setNumber ? { metadata: withDrawingSetNumberMetadata(parentSetMetadata, setNumber) } : {}),
              updated_at:      new Date().toISOString(),
            });
          } catch (updErr) {
            console.warn("Could not refresh existing drawing_set:", updErr);
          }
        }
      } catch (lookupErr) {
        console.warn("DrawingSet lookup failed, will create new:", lookupErr);
      }

      if (!parentSetId) {
        // The DB enforces UNIQUE(project_id, set_name) on drawing_sets
        // (migration 020 / see memory/supabase_drawings_constraints.md).
        // If a concurrent upload from another session wrote the same
        // set_name between our lookup above and this CREATE, Postgres
        // raises 23505 and the whole batch would die with a cryptic
        // error. Recover: on unique_violation, re-query and attach to
        // whichever row won the race. Only if even that lookup is empty
        // do we surface the error to the user.
        const { record: sanitizedSet } = sanitizeDrawingSetPayload({
          project_id:      activeProject?.id,
          project_name:    activeProject?.name,
          set_name:        resolvedSetName,
          revision:        meta.revision || "",
          discipline:      meta.discipline || "",
          issued_date:     meta.issueDate || null,
          issued_by:       meta.issuedBy || "",
          status:          "Active",
          notes:           meta.notes || "",
          metadata:        withDrawingSetNumberMetadata({}, setNumber),
          upload_batch_id: batchId,
          sheet_count:        0,
          processed_count:    0,
          needs_review_count: 0,
          failed_count:       0,
        });
        try {
          const created = await entities.DrawingSet.create(sanitizedSet);
          parentSetId = created?.id;
        } catch (createErr) {
          const msg = String(createErr?.message || createErr || "").toLowerCase();
          const isUniqueViolation =
            msg.includes("duplicate key") ||
            msg.includes("unique constraint") ||
            msg.includes("uq_drawing_sets_project_set_name") ||
            msg.includes("23505");
          if (!isUniqueViolation) throw createErr;

          console.warn(
            `[DrawingSetUploadModal] race on set "${resolvedSetName}" — another session created it first; re-looking up.`,
          );
          const winner = await entities.DrawingSet.filter({
            project_id: activeProject?.id,
            set_name:   resolvedSetName,
          });
          if (Array.isArray(winner) && winner.length > 0) {
            parentSetId = winner[0].id;
            parentSetMetadata = winner[0].metadata;
          } else {
            // Extremely unlikely: insert failed uniqueness but post-lookup
            // can't find the winner (e.g. it was soft-deleted between the
            // insert attempt and this query). Surface a clear message
            // instead of the raw Postgres error.
            throw new Error(
              `A drawing set named "${resolvedSetName}" already exists on this project but could not be loaded. ` +
              `Refresh the page and try again, or pick a different set name.`,
            );
          }
        }

        if (!parentSetId) {
          throw new Error("Drawing set was created but no id returned — cannot attach children.");
        }
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 2 — Create every child drawing row with FK + status cols.
      //
      // Each child gets ai_extraction_status === 'Processed' because by
      // the time we reach this step, AI has already run and the user has
      // reviewed the results. Rows whose AI pass failed upstream get
      // marked 'NeedsReview' so the UI can flag them.
      //
      // F16: single bulk insert instead of N serial requests. An N-sheet
      // set used to mean N round-trips; now one. If the bulk insert fails
      // we fall back to the per-row loop so a single bad row still lets
      // the rest land — matching the original "never abort the batch"
      // acceptance criterion.
      // ─────────────────────────────────────────────────────────────
      const now = new Date().toISOString();
      const buildRecord = (sheet) => {
        const sourceResult = fileResults.find(r => r.fileName === sheet.sourceFile);
        // Same signal the review screen shows (intakeReview.sheetReviewFlags) so
        // the persisted ai_extraction_status never disagrees with the badge — now
        // also catches an empty sheet number, not just bad-source rows.
        const needsReview = sheetReviewFlags(sheet, sourceResult).needsReview;
        // Validate pdf_page — must be a positive integer. Anything else
        // falls back to 1 with a warning so the user can hand-fix via
        // SheetFormModal. The extractor's assignPdfPages() should have
        // populated this correctly; if we're falling back here, something
        // upstream regressed.
        const validatedPage = validatePdfPage(sheet.pdfPage);
        if (validatedPage === null) {
          console.warn(
            `[DrawingSetUploadModal] Sheet "${sheet.sheetNumber || "?"}" has invalid pdfPage=${JSON.stringify(sheet.pdfPage)} — defaulting to 1.`,
          );
        }
        return {
          sheet_number:     sheet.sheetNumber || "",
          title:            sheet.sheetTitle  || "",
          project_id:       activeProject?.id,
          project_name:     activeProject?.name,
          drawing_set_id:   parentSetId,
          drawing_set_name: resolvedSetName, // kept for back-compat reads
          discipline:       sheet.discipline || meta.discipline,
          revision_number:  normalizeRevisionNumber(sheet.revision ?? meta.revision),
          stage:            meta.defaultStage || "Not Started",
          file_url:         sheet.sourceFileUrl,
          pdf_page:         validatedPage ?? 1,
          callouts:         Array.isArray(sheet.callouts) ? sheet.callouts : [],
          upload_batch_id:      batchId,
          upload_status:        "Uploaded",
          ai_extraction_status: needsReview ? "NeedsReview" : "Processed",
          ai_extraction_error:  sourceResult?.error || null,
          extracted_text:       sheet.extractedText || null,
          hyperlinks:           Array.isArray(sheet.hyperlinks) ? sheet.hyperlinks : [],
          last_extracted_at:    now,
          notes: [
            meta.notes,
            sheet.scale ? `Scale: ${sheet.scale}` : "",
            sheet._note || "",
          ].filter(Boolean).join(" · "),
        };
      };

      let createdRows = 0;
      let failedRows  = 0;
      const records = selectedSheets.map(buildRecord);

      // Sanity check per source PDF: if a multi-page PDF ended up with
      // pdf_page=1 across every one of its sheets, that's the original
      // bug regressing. Log loud per source file so QA can spot it in
      // DevTools without inspecting every record.
      const recordsBySource = new Map();
      selectedSheets.forEach((sheet, i) => {
        const key = sheet.sourceFile || "?";
        if (!recordsBySource.has(key)) recordsBySource.set(key, []);
        recordsBySource.get(key).push(records[i]);
      });
      for (const [sourceFile, group] of recordsBySource) {
        if (group.length <= 1) continue;
        const fileResult = fileResults.find(r => r.fileName === sourceFile);
        const pageCount = fileResult?.pageCount;
        if (Number.isFinite(pageCount) && pageCount > 1 && group.every(r => r.pdf_page === 1)) {
          console.warn(
            `[DrawingSetUploadModal] All ${group.length} sheets from "${sourceFile}" (a ${pageCount}-page PDF) have pdf_page=1. ` +
            `This looks like the multi-sheet pdf_page bug regressing — check that the extractor schema includes pdfPage and that assignPdfPages ran.`,
          );
        }
      }

      setProcessingStatus(prev => ({
        ...prev,
        progress: 40,
        message:  `Creating ${records.length} drawing entries…`,
      }));

      // Collect the inserted drawing rows (with DB IDs) so we can
      // fan out matching Detailing schedule tasks after.
      //
      // Defensive enum pass: every record's stage / upload_status /
      // ai_extraction_status is coerced to a DB-CHECK-valid value so a
      // typo / stale constant / future schema drift doesn't silently
      // fail the INSERT and lose the user's upload.
      const sanitizedRecords = records.map((r) => sanitizeDrawingPayload(r).record);

      const insertedRows = [];
      try {
        const inserted = await entities.Drawing.bulkCreate(sanitizedRecords);
        if (Array.isArray(inserted)) insertedRows.push(...inserted);
        createdRows = Array.isArray(inserted) ? inserted.length : sanitizedRecords.length;
      } catch (bulkErr) {
        // Bulk failed — fall back to per-row so one bad sheet doesn't lose
        // the whole batch. This is the slow path; the common case is the
        // bulk insert above succeeding.
        console.warn("[drawings] bulkCreate failed, falling back to per-row:", bulkErr);
        for (let i = 0; i < selectedSheets.length; i++) {
          if (cancelledRef.current) break;
          const sheet = selectedSheets[i];
          try {
            const row = await entities.Drawing.create(sanitizedRecords[i]);
            if (row) insertedRows.push(row);
            createdRows++;
          } catch (err) {
            console.error("Failed to create sheet:", sheet.sheetNumber, err);
            failedRows++;
          }
          setProcessingStatus(prev => ({
            ...prev,
            progress: 40 + Math.round(((createdRows + failedRows) / selectedSheets.length) * 50),
            message:  `Recovering… ${createdRows + failedRows} of ${selectedSheets.length}`,
          }));
        }
      }

      // Auto-create matching Detailing/Submittal schedule tasks. Idempotent —
      // re-running the upload won't double-insert because the helper dedupes
      // by drawing_id in metadata.
      if (insertedRows.length > 0 && !cancelledRef.current) {
        setProcessingStatus(prev => ({
          ...prev,
          progress: 92,
          message:  `Linking ${insertedRows.length} schedule tasks…`,
        }));
        try {
          const { created: taskCount } = await autoCreateDetailingTasks(
            insertedRows,
            { projectName: insertedRows[0]?.project_name }
          );
          if (taskCount > 0) {
            qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
          }
        } catch (err) {
          console.warn("[drawings] auto-schedule tasks failed:", err);
        }
      }

      setProcessingStatus(prev => ({
        ...prev,
        progress: 95,
        message:  `Created ${createdRows} of ${selectedSheets.length} entries`,
      }));

      if (cancelledRef.current) return;
      setCreatedCount(createdRows);

      // Audit the AI-intake commit on the LIVE create path (importAnalyzedDrawings
      // is dead code; this modal is the real intake). Fire-and-forget — logActivity
      // swallows its own errors and never blocks the upload.
      if (createdRows > 0) {
        const needsReviewCount = sanitizedRecords.filter((r) => r.ai_extraction_status === "NeedsReview").length;
        void logActivity(
          "drawing",
          "created",
          { id: parentSetId, project_id: activeProject?.id, name: resolvedSetName },
          {
            projectId: activeProject?.id,
            projectName: activeProject?.name,
            description:
              `Imported ${createdRows} sheet${createdRows === 1 ? "" : "s"} into "${resolvedSetName}" from AI intake` +
              `${needsReviewCount ? ` (${needsReviewCount} flagged for review)` : ""}` +
              `${failedRows ? ` — ${failedRows} failed to save` : ""}`,
          },
        );
      }

      if (failedRows > 0) {
        setProcessError(`${failedRows} sheet(s) failed to save. ${createdRows} created successfully.`);
      }

      // The sync_drawing_set_counts() DB trigger auto-updates the parent
      // aggregate counts, so we just need to refresh the UI caches.
      qc.invalidateQueries({ queryKey: ["drawings"] });
      qc.invalidateQueries({ queryKey: ["drawing_sets"] });
      qc.invalidateQueries({ queryKey: ["drawing-sets"] }); // hub/FabRelease spelling
      setStep(5);
      if (onComplete) onComplete();
    } catch (err) {
      console.error("Create drawings error:", err);
      setProcessError(`Failed to save drawings: ${err.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sbd-card-strong" style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>Upload Drawing Set</span>
              {step !== 3 && (
                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                  {[0, 1, 2, 4, 5].map(s => (
                    <div key={s} style={{ width: 18, height: 4, borderRadius: 2, background: step >= s ? "var(--accent)" : "var(--bg-surface-high)" }} />
                  ))}
                </div>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div style={{ paddingTop: 8 }}>
          {step === 0 && <StepChoice onNewSet={() => setStep(1)} onNewRevision={() => { handleClose(); if (onNewRevision) onNewRevision(); }} onClose={handleClose} />}
          {step === 1 && <StepMeta meta={meta} setMeta={setMeta} onBack={() => setStep(0)} onNext={() => setStep(2)} projectName={activeProject?.name} existingSetNames={existingSetNames} />}
          {step === 2 && <StepFiles files={files} setFiles={setFiles} onBack={() => setStep(1)} onUpload={handleUploadAndProcess} setName={meta.setName} />}
          {step === 3 && <StepProcessing processingStatus={processingStatus} onCancel={reset} error={processError} />}
          {step === 4 && <StepReview sheets={sheets} setSheets={setSheets} fileResults={fileResults} meta={meta} setMeta={setMeta} aiFilledFields={aiFilledFields} onBack={() => setStep(2)} onCreate={handleCreate} existingDrawings={existingDrawings} />}
          {step === 5 && <StepSuccess createdCount={createdCount} fileResults={fileResults} onViewLog={handleClose} onUploadAnother={reset} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
