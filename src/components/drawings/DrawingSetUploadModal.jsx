import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, ChevronRight, ChevronLeft, Check, AlertTriangle } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
// Bundle pdf.js worker with Vite so versions always match the installed
// pdfjs-dist package. Same pattern as DrawingViewer.jsx. Safe to set the
// global workerSrc in multiple modules — it's idempotent.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DISCIPLINES = ["Structural", "Arch", "MEP", "Civil", "Misc Metals"];
const STAGES      = ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
const MAX_PDF_SIZE_MB = 32;
const UPLOAD_TIMEOUT_MS  = 90_000;   // 90 s
const EXTRACT_TIMEOUT_MS = 150_000;  // 2.5 min
// Per-page text hard-cap so we don't blow past Claude's context window on
// giant drawing sets. 1800 chars/page ≈ 450 tokens; 60 pages ≈ 27k tokens,
// well within the 200k context budget even with the prompt overhead.
const MAX_CHARS_PER_PAGE = 1800;
// Absolute ceiling on total extracted text fed to the LLM.
const MAX_TOTAL_TEXT_CHARS = 140_000;

// Generate a random upload batch id (one per wizard session).
// Each file in the batch carries this id so the UI can later group/aggregate.
function newUploadBatchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function withTimeout(promise, ms, label = "Operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s — please retry`)), ms)
    ),
  ]);
}

function isPdfFile(file) {
  if (!file) return false;
  const mime = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return mime === "application/pdf" || mime.includes("pdf") || name.endsWith(".pdf");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeRevisionNumber(value, fallback = "0") {
  if (value == null || value === "") return fallback;
  return String(value).trim() || fallback;
}

// ─── Claude PDF extraction via llm-proxy Supabase Edge Function ──────
//
// Pipeline:
//   1. Read the File bytes in the browser.
//   2. Use pdfjs-dist to extract text from every page (client-side, no
//      Anthropic file-upload API needed).
//   3. Package the pages into a compact prompt and hand it to the
//      llm-proxy edge function (text-only — no file_urls).
//   4. Parse the JSON response into { setMeta, sheets[] }.
//
// Why client-side text extraction instead of file_urls? Anthropic's file
// API requires the model to have a signed URL it can fetch, and the
// Supabase public storage bucket isn't publicly readable. Extracting text
// in the browser sidesteps that entirely and is faster on small PDFs.

const EMPTY_SET_META = {
  setName:     "",
  revision:    "",
  issueDate:   "",
  issuedBy:    "",
  discipline:  "",
  projectName: "",
};

/**
 * Read a browser File into a fresh ArrayBuffer. pdfjs mutates the buffer
 * internally, so every call needs its own copy.
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader error"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extract plain-text content from every page of a PDF, preserving reading
 * order as best as pdfjs reports it and inserting soft line breaks when
 * the horizontal text position jumps backwards (new line).
 *
 * Returns `{ pages: string[], totalChars: number, scanned: boolean }`.
 * `scanned === true` if we got <50 chars total — likely a scanned PDF
 * with no embedded text.
 */
async function extractPdfText(file) {
  const buf = await readFileAsArrayBuffer(file);
  // pdfjs consumes the ArrayBuffer, so pass a copy.
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pageCount = pdf.numPages;
  const pages = [];
  let totalChars = 0;

  for (let p = 1; p <= pageCount; p++) {
    if (totalChars >= MAX_TOTAL_TEXT_CHARS) break;

    try {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();

      // Join items into lines. pdfjs gives us items with transform[5] as
      // the baseline y-coordinate; group by rounded y so characters on
      // the same visual line stay together.
      const lineMap = new Map();
      for (const item of content.items) {
        if (!item?.str) continue;
        const y    = Math.round((item.transform?.[5] ?? 0) * 2) / 2;
        const prev = lineMap.get(y) || "";
        lineMap.set(y, prev + (prev ? " " : "") + item.str.trim());
      }

      // Sort lines top-to-bottom (higher y first in PDF coords) and cap.
      const lines = [...lineMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, line]) => line)
        .filter(Boolean);

      let pageText = lines.join("\n");
      if (pageText.length > MAX_CHARS_PER_PAGE) {
        pageText = pageText.slice(0, MAX_CHARS_PER_PAGE) + " …[truncated]";
      }

      pages.push(pageText);
      totalChars += pageText.length;

      // Be nice to the main thread between pages.
      if (p % 5 === 0) await new Promise(r => setTimeout(r, 0));
    } catch (pageErr) {
      console.warn(`pdfjs page ${p} failed:`, pageErr);
      pages.push("");
    }
  }

  // Clean up worker-owned resources.
  try { await pdf.destroy(); } catch { /* ignore */ }

  return {
    pages,
    totalChars,
    scanned: totalChars < 50,
    pageCount,
  };
}

/**
 * Format extracted page text into a compact prompt body for Claude.
 */
function buildPdfTextBlock(pages) {
  return pages
    .map((txt, i) => `===== PAGE ${i + 1} =====\n${txt.trim() || "[empty / image-only page]"}`)
    .join("\n\n");
}

async function extractSheetsFromPDF(file, _uploadedFileUrl) {
  // 1. Client-side text extraction.
  let extracted;
  try {
    extracted = await extractPdfText(file);
  } catch (pdfErr) {
    console.error("pdfjs text extraction failed:", pdfErr);
    return {
      setMeta: { ...EMPTY_SET_META },
      sheets: [{
        sheetNumber: "", sheetTitle: file.name.replace(/\.pdf$/i, ""),
        discipline: "Structural", sheetType: "General",
        revision: "0", scale: "", date: "",
        _note: "PDF text extraction failed — please fill in sheet details manually.",
      }],
      scanned: false,
      extractFailed: true,
      error: pdfErr?.message || String(pdfErr),
    };
  }

  // Scanned PDFs — pdfjs found no embedded text. We still call the LLM
  // with the filename so it can guess the set name, but flag the result
  // as NeedsReview so the user knows to double-check.
  if (extracted.scanned) {
    return {
      setMeta: { ...EMPTY_SET_META, setName: file.name.replace(/\.pdf$/i, "") },
      sheets: [{
        sheetNumber: "", sheetTitle: file.name.replace(/\.pdf$/i, ""),
        discipline: "Structural", sheetType: "General",
        revision: "0", scale: "", date: "",
        _note: "Scanned PDF — no extractable text. Please fill in sheet details manually.",
      }],
      scanned: true,
    };
  }

  const pdfTextBlock = buildPdfTextBlock(extracted.pages);

  // 2. Build prompt.
  const systemPrompt = `You are a drawing log parser for a structural steel construction management application.
You will be given the plain-text extract of a structural drawing set PDF (page by page).
Identify two things:
1. Set-level metadata (what this drawing package is called, its revision/issuance, issue date, and issuing firm — from the cover sheet or title block).
2. Every individual sheet in the set (sheet number, title, discipline, revision, date — from the sheet index or per-sheet title blocks).
Return ONLY a valid JSON object. No explanation, no markdown, no preamble.`;

  const userPrompt = `Below is the text extracted from a drawing set PDF, one page at a time.

Extract BOTH the set-level metadata AND every individual sheet you can identify.

Look for:
- Cover sheet / title page showing what this package is called (e.g. "100% Construction Documents", "Issued for Construction — Rev 2", "IFB Package", "Addendum 3")
- Revision / issuance label for the whole package (e.g. "Rev 2", "IFC", "Addendum 3")
- Issue date on the cover or title block
- Engineer of record / issuing firm
- Project name on the cover
- A sheet index / drawing list page — each row is typically one sheet
- Individual title blocks on each sheet

Return this exact JSON structure:
{
  "setMeta": {
    "setName":     "100% CD Set",
    "revision":    "Rev 2",
    "issueDate":   "2025-11-04",
    "issuedBy":    "Smith Engineering",
    "discipline":  "Structural",
    "projectName": ""
  },
  "sheets": [
    {
      "sheetNumber": "S-001",
      "sheetTitle":  "Foundation Plan",
      "discipline":  "Structural|Arch|MEP|Civil|Misc Metals",
      "sheetType":   "Plan|Elevation|Section|Detail|Schedule|General|Cover",
      "revision":    "0",
      "scale":       "",
      "date":        ""
    }
  ]
}

Rules:
- Extract real data only — no guessing. Use "" for any field you cannot read.
- Dates: use ISO YYYY-MM-DD format when possible.
- Sheet revision: if a per-sheet revision is not shown, fall back to the set-level revision; if neither, use "0".
- Discipline: infer from sheet number prefix (S=Structural, A=Arch, C=Civil, M/P/E=MEP, G=General, Misc=Misc Metals).
- If the extracted text clearly contains a sheet index / drawing list, enumerate EVERY row in it — one sheet per row.
- NEVER invent sheet numbers, titles, or set names.
- Return ONLY the JSON object. Nothing else.

===== BEGIN PDF TEXT (${extracted.pageCount} pages, ${extracted.totalChars} chars) =====
${pdfTextBlock}
===== END PDF TEXT =====`;

  // 3. Call the LLM.
  const raw = await base44.integrations.Core.InvokeLLM({
    prompt:    userPrompt,
    system:    systemPrompt,
    maxTokens: 4000,
  });

  // The edge function may return a string or an object with { text } / { content }.
  const rawText = typeof raw === "string"
    ? raw
    : (raw?.text ?? raw?.content ?? JSON.stringify(raw ?? ""));

  // Edge function may also surface an { error } envelope — propagate it.
  if (raw?.error) {
    console.error("llm-proxy error:", raw.error);
    return {
      setMeta: { ...EMPTY_SET_META },
      sheets: [{
        sheetNumber: "", sheetTitle: file.name.replace(/\.pdf$/i, ""),
        discipline: "Structural", sheetType: "General",
        revision: "0", scale: "", date: "",
        _note: `AI unavailable: ${raw.error}`,
      }],
      scanned: false,
      extractFailed: true,
      error: raw.error,
    };
  }

  // Strip any ```json fences even though we ask for bare JSON.
  const clean = String(rawText || "{}")
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  // Some models prefix / suffix with prose; grab the first {...} block.
  let toParse = clean;
  const firstBrace = clean.indexOf("{");
  const lastBrace  = clean.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    toParse = clean.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(toParse);
    // Tolerate the older flat-array shape in case the model drifts.
    if (Array.isArray(parsed)) {
      return { setMeta: { ...EMPTY_SET_META }, sheets: parsed, scanned: false };
    }
    return {
      setMeta: { ...EMPTY_SET_META, ...(parsed.setMeta || {}) },
      sheets:  Array.isArray(parsed.sheets) ? parsed.sheets : [],
      scanned: false,
    };
  } catch (parseErr) {
    console.error("JSON parse failed:", parseErr, "\nRaw:", rawText);
    return {
      setMeta: { ...EMPTY_SET_META },
      sheets: [{
        sheetNumber: "", sheetTitle: `Sheets from ${file.name}`,
        discipline: "Structural", sheetType: "General",
        revision: "0", scale: "", date: "", _note: "AI response was not valid JSON — manual entry required",
      }],
      scanned: false,
      extractFailed: true,
    };
  }
}

// ─── Filename fallback for oversized PDFs ─────────────────────────────
function extractSheetsFromFilename(fileName) {
  const name = fileName.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
  return {
    setMeta: { ...EMPTY_SET_META },
    sheets: [{
      sheetNumber: "",
      sheetTitle:  name,
      discipline:  "Structural",
      sheetType:   "General",
      revision:    "0",
      scale:       "",
      date:        "",
      _note:       "File too large for AI extraction. Please fill in sheet details manually.",
    }],
    scanned: false,
    tooLarge: true,
  };
}

// ─── Router: pick extraction method based on size ─────────────────────
async function validateAndExtract(file, uploadedFileUrl) {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_PDF_SIZE_MB) {
    console.warn(`PDF too large (${sizeMB.toFixed(1)}MB). Using filename fallback.`);
    return extractSheetsFromFilename(file.name);
  }
  return extractSheetsFromPDF(file, uploadedFileUrl);
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
          background: "var(--bg-sidebar)", border: "1px solid var(--bg-surface-high)",
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
        <div style={{ background: "var(--bg-sidebar)", border: "1px solid var(--bg-surface-high)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
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
  const warnedFiles = fileResults.filter(r => r.scanned || r.tooLarge);

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
    background: "var(--bg-sidebar)",
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
        background: anyAiFilled ? "rgba(132,204,22,0.05)" : "var(--bg-sidebar)",
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

      {/* Warnings */}
      {warnedFiles.map(r => (
        <div key={r.fileName} style={{
          display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px",
          background: "var(--warning-muted)", border: "1px solid var(--warning-border)",
          borderRadius: 8, marginBottom: 10,
        }}>
          <AlertTriangle style={{ width: 14, height: 14, color: "var(--status-warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)" }}>
          {r.scanned ? (
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
          style={{ flex: 1, minWidth: 100, background: "var(--bg-sidebar)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "4px 10px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12 }} />
        <select value={discFilter} onChange={e => setDiscFilter(e.target.value)}
          style={{ background: "var(--bg-sidebar)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "4px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
          <option value="all">All Disciplines</option>
          {DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {multiFile && (
          <select value={fileFilter} onChange={e => setFileFilter(e.target.value)}
            style={{ background: "var(--bg-sidebar)", border: "1px solid var(--bg-surface-high)", borderRadius: 6, padding: "4px 8px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9, maxWidth: 140 }}>
            <option value="all">All Files</option>
            {uniqueFiles.map(f => <option key={f} value={f}>{f.replace(/\.pdf$/i, "")}</option>)}
          </select>
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {sheets.length} sheets · <span style={{ color: "var(--status-warning)" }}>{selectedCount} selected</span>
        </span>
      </div>

      {/* Table */}
      <div style={{ maxHeight: 320, overflowY: "auto", background: "var(--bg-sidebar)", border: "1px solid var(--bg-surface-high)", borderRadius: 8, marginBottom: 14 }}>
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
            {filtered.map((s, i) => (
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
                    style={{ background: "var(--bg-sidebar)", border: "1px solid var(--bg-surface-high)", borderRadius: 4, padding: "2px 6px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
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
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>No sheets match filter</div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Button variant="outline" onClick={onBack}><ChevronLeft style={{ width: 14, height: 14, marginRight: 4 }} /> Back</Button>
        <Button onClick={() => onCreate(sheets.filter(s => s.selected))} disabled={selectedCount === 0}
          style={{ background: "var(--accent)", color: "#fff", border: "none" }}>
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
          <div key={r.fileName} style={{ fontFamily: "var(--font-body)", fontSize: 12, color: r.status === "failed" ? "#FF3D3D" : "var(--text-muted)" }}>
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
    setName: "", discipline: "Structural", defaultStage: "Not Started",
    revision: "0",
    issueDate: new Date().toISOString().split("T")[0], issuedBy: "", notes: "",
  });
  const [processingStatus, setProcessingStatus] = useState({ steps: [], currentStepId: null, progress: 0, message: "" });
  const [sheets, setSheets]               = useState([]);
  const [fileResults, setFileResults]     = useState([]);
  const [createdCount, setCreatedCount]   = useState(0);
  const [processError, setProcessError]   = useState(null);
  const [aiFilledFields, setAiFilledFields] = useState({}); // { setName: true, ... }
  const [detectedSetMeta, setDetectedSetMeta] = useState(null); // raw AI output, for banner
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
    setDetectedSetMeta(null);
    setUploadBatchId(null);
    setProcessingStatus({ steps: [], currentStepId: null, progress: 0, message: "" });
    setMeta({ setName: "", discipline: "Structural", defaultStage: "Not Started", revision: "0", issueDate: new Date().toISOString().split("T")[0], issuedBy: "", notes: "" });
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
            base44.integrations.Core.UploadFile({ file }),
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
            validateAndExtract(file, fileUrl),
            EXTRACT_TIMEOUT_MS,
            "AI extraction"
          );
        } catch (err) {
          // On timeout/extract failure, fall back to a single manual-entry row
          extractResult = {
            setMeta: { ...EMPTY_SET_META },
            sheets: [{
              sheetNumber: "", sheetTitle: file.name.replace(/\.pdf$/i, ""),
              discipline: meta.discipline, sheetType: "General",
              revision: "0", scale: "", date: "",
              _note: `Extraction failed: ${err.message}. Please fill in manually.`,
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

        if (i < files.length - 1) {
          await new Promise(r => setTimeout(r, 600));
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
        tryFill("revision",   "revision");
        tryFill("issueDate",  "issueDate");
        tryFill("issuedBy",   "issuedBy");
        tryFill("discipline", "discipline");
        return merged;
      });
      setAiFilledFields(aiFilled);
      setDetectedSetMeta(aggregateSetMeta);

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

    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 1 — Find or create the parent drawing_sets record.
      //
      // We check first so re-uploading into an existing named set just
      // appends children to the same parent (idempotent across sessions).
      // ─────────────────────────────────────────────────────────────
      setProcessingStatus(prev => ({ ...prev, progress: 5, message: "Creating drawing set…" }));

      let parentSetId = null;
      try {
        const existing = await base44.entities.DrawingSet.filter({
          project_id: activeProject?.id,
          set_name:   resolvedSetName,
        });
        if (Array.isArray(existing) && existing.length > 0) {
          parentSetId = existing[0].id;
          // Refresh the parent's upload_batch_id + metadata to reflect this upload
          try {
            await base44.entities.DrawingSet.update(parentSetId, {
              upload_batch_id: batchId,
              revision:        meta.revision || existing[0].revision || "",
              issued_date:     meta.issueDate || existing[0].issued_date || null,
              issued_by:       meta.issuedBy  || existing[0].issued_by  || "",
              discipline:      meta.discipline || existing[0].discipline || "",
              notes:           meta.notes || existing[0].notes || "",
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
        const created = await base44.entities.DrawingSet.create({
          project_id:      activeProject?.id,
          project_name:    activeProject?.name,
          set_name:        resolvedSetName,
          revision:        meta.revision || "",
          discipline:      meta.discipline || "",
          issued_date:     meta.issueDate || null,
          issued_by:       meta.issuedBy || "",
          status:          "Active",
          notes:           meta.notes || "",
          upload_batch_id: batchId,
          sheet_count:        0,
          processed_count:    0,
          needs_review_count: 0,
          failed_count:       0,
        });
        parentSetId = created?.id;
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
      // ─────────────────────────────────────────────────────────────
      let createdRows = 0;
      let failedRows  = 0;
      for (const sheet of selectedSheets) {
        if (cancelledRef.current) break;

        // If the file this sheet came from had an extraction failure, mark
        // it as NeedsReview so the user can address it from the log grid.
        const sourceResult = fileResults.find(r => r.fileName === sheet.sourceFile);
        const needsReview =
          sourceResult?.extractFailed ||
          sourceResult?.scanned ||
          sourceResult?.tooLarge ||
          !!sheet._note;

        try {
          await base44.entities.Drawing.create({
            // Identity
            sheet_number:     sheet.sheetNumber || "",
            title:            sheet.sheetTitle  || "",
            project_id:       activeProject?.id,
            project_name:     activeProject?.name,

            // NEW: parent/child relationship
            drawing_set_id:   parentSetId,
            drawing_set_name: resolvedSetName, // kept for back-compat reads

            // Metadata.
            // NOTE: issue_date / issued_by do NOT exist on drawings — they
            // live on the parent drawing_sets row (written above). Don't
            // write them here or PostgREST 400s on unknown columns.
            discipline:       sheet.discipline || meta.discipline,
            revision_number:  normalizeRevisionNumber(sheet.revision ?? meta.revision),
            stage:            meta.defaultStage || "Not Started",
            file_url:         sheet.sourceFileUrl,
            pdf_page:         Number.isFinite(sheet.pdfPage) ? sheet.pdfPage : 1,
            drawing_page:     sheet.drawingPage ?? sheet.page ?? null,
            // Detected section/detail callouts — written as JSONB; empty
            // array if the PDF had no detectable callouts or was too large.
            callouts:         Array.isArray(sheet.callouts) ? sheet.callouts : [],

            // NEW: upload/extraction tracking
            upload_batch_id:      batchId,
            upload_status:        "Uploaded",
            ai_extraction_status: needsReview ? "NeedsReview" : "Processed",
            ai_extraction_error:  sourceResult?.error || null,
            extracted_text:       sheet.extractedText || null,
            hyperlinks:           Array.isArray(sheet.hyperlinks) ? sheet.hyperlinks : [],
            last_extracted_at:    new Date().toISOString(),

            notes: [
              meta.notes,
              sheet.scale ? `Scale: ${sheet.scale}` : "",
              sheet._note || "",
            ].filter(Boolean).join(" · "),
          });
          createdRows++;
        } catch (err) {
          console.error("Failed to create sheet:", sheet.sheetNumber, err);
          failedRows++;
          // One row failure never aborts the batch — see acceptance criteria.
        }

        setProcessingStatus(prev => ({
          ...prev,
          progress: 10 + Math.round(((createdRows + failedRows) / selectedSheets.length) * 90),
          message:  `Creating entries… ${createdRows + failedRows} of ${selectedSheets.length}`,
        }));
      }

      if (cancelledRef.current) return;
      setCreatedCount(createdRows);
      if (failedRows > 0) {
        setProcessError(`${failedRows} sheet(s) failed to save. ${createdRows} created successfully.`);
      }

      // The sync_drawing_set_counts() DB trigger auto-updates the parent
      // aggregate counts, so we just need to refresh the UI caches.
      qc.invalidateQueries({ queryKey: ["drawings"] });
      qc.invalidateQueries({ queryKey: ["drawing_sets"] });
      setStep(5);
      if (onComplete) onComplete();
    } catch (err) {
      console.error("Create drawings error:", err);
      setProcessError(`Failed to save drawings: ${err.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent style={{ maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}>
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
