/** Read-only drawing-log review. Parsed source/lifecycle fields require reviewed upload. */

import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { X, Upload, FileText, CheckCircle2, FileStack } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { parseDrawingLog, classifyDrawingRows } from "@/lib/importDrawingLog";

const mono = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const ACCENT = "var(--accent, #3B82F6)";

export default function DrawingLogImportModal({ open, projectId, projectName, onClose, onImported }) {
  const trapRef = useFocusTrap(open);
  const fileInput = useRef(null);

  const [step, setStep] = useState("upload"); // upload | parsing | preview | committing | done
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [staged, setStaged] = useState(null);
  const [excluded, setExcluded] = useState(new Set());
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr] = useState(null);

  const { data: existingDrawings = [] } = useQuery({
    queryKey: ["drawings", projectId, "log-import"],
    queryFn: () => entities.Drawing.filterAll({ project_id: projectId }),
    enabled: !!open && !!projectId,
  });
  if (!open) return null;

  const reset = () => {
    setStep("upload"); setFile(null); setParsed(null); setStaged(null);
    setExcluded(new Set()); setLastResult(null); setErr(null);
  };

  const acceptFile = (f) => {
    setErr(null);
    if (!f) return;
    if (!/\.(xls|xlsx|csv)$/i.test(f.name)) { setErr("File must be a Drawing Log spreadsheet (.xls / .xlsx / .csv)."); return; }
    if (f.size > 16 * 1024 * 1024) { setErr("File exceeds 16 MB limit."); return; }
    setFile(f);
  };

  const runParse = async () => {
    if (!file) return;
    setStep("parsing"); setErr(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
      const res = parseDrawingLog(rows);
      if (!res.ok) throw new Error(res.error || "Could not parse the log.");
      if (res.rows.length === 0) throw new Error("No drawing rows found in the log.");
      setParsed(res);
      setStaged(classifyDrawingRows(res.rows, existingDrawings));
      setStep("preview");
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("upload");
    }
  };

  const toggleExclude = (sheet) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(sheet)) next.delete(sheet); else next.add(sheet);
      return next;
    });
  };

  const runCommit = async () => {
    if (!staged || !projectId) return;
    const kept = staged.rows.filter((r) => !excluded.has(r.sheet_number));
    if (kept.length === 0) { setErr("Every sheet is excluded — nothing to import."); return; }

    // This log format contains source identity, issue dates and protected drawing_log JSON.
    // None is an allowed direct metadata field; do not partially reinterpret or apply a row.
    setErr(`${kept.length} source rows held: ${kept.map(row => row.sheet_number).join(", ")}. Log import cannot create or rewrite drawing source, revisions, issue dates or routing. Use the reviewed New Set / Revision Upload workflow. No rows were saved.`);
  };

  const rows = staged?.rows || [];
  const keptCount = rows.length - excluded.size;
  const skipped = parsed?.skipped || [];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        ref={trapRef}
        onKeyDown={(e) => { if (e.key === "Escape" && step !== "committing") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 1020, maxWidth: "96vw", maxHeight: "92vh", background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)", borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 4, zIndex: 1201, outline: "none", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <FileStack size={18} style={{ color: ACCENT, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              Import Drawing Log{projectName ? ` — ${projectName}` : ""}
            </div>
            <div style={{ ...mono, fontSize: 9, color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload" && "STEP 1 · UPLOAD DRAWING COMPLETE / SUBMITTAL LOG"}
              {step === "parsing" && "STEP 2 · PARSING"}
              {step === "preview" && `STEP 2 · REVIEW · ${keptCount} OF ${rows.length} SHEETS`}
              {step === "committing" && "STEP 3 · IMPORTING"}
              {step === "done" && "DONE"}
            </div>
          </div>
          <button onClick={onClose} disabled={step === "committing"} aria-label="Close"
                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {err && (
            <div role="alert" style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid color-mix(in srgb, var(--status-error) 45%, transparent)", background: "color-mix(in srgb, var(--status-error) 12%, transparent)", color: "var(--text-primary)", fontSize: 12 }}>
              {err}
            </div>
          )}

          {(step === "upload" || step === "parsing") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6 }}>
                Upload your detailer Drawing Complete or Submittal Log (.xls). Each sheet's number, title,
                revision, date-sent-for-approval, fab/field date, and detailer/checker are read. This preview cannot create sheets or apply source, revision or lifecycle fields.
                Use the reviewed drawing upload workflow to apply those changes.
              </p>
              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files?.[0]); }}
                style={{ border: "1.5px dashed var(--border-default)", borderRadius: 10, padding: "34px 20px", textAlign: "center", cursor: "pointer", background: "var(--bg-surface-low)" }}
              >
                <Upload size={22} style={{ color: "var(--text-muted)" }} />
                <div style={{ marginTop: 8, color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>{file ? file.name : "Drop the log here, or click to browse"}</div>
                {file && <div style={{ ...mono, marginTop: 4, color: "var(--text-muted)", fontSize: 10 }}>{(file.size / 1024).toFixed(0)} KB</div>}
                <input ref={fileInput} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(e) => acceptFile(e.target.files?.[0])} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="sbd-btn sbd-btn-ghost" onClick={onClose}>Cancel</button>
                <button className="sbd-btn sbd-btn-primary" disabled={!file || step === "parsing"} onClick={runParse}>{step === "parsing" ? "Parsing…" : "Review sheets"}</button>
              </div>
            </div>
          )}

          {(step === "preview" || step === "committing") && staged && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <StatChip label="New sheets" value={staged.stats.create} tone="var(--status-success)" />
                <StatChip label="Existing sheets" value={staged.stats.update} tone={ACCENT} />
                <StatChip label="Skipped" value={skipped.length} tone="var(--text-muted)" />
              </div>

              <div style={{ border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)", zIndex: 1 }}>
                        <th style={th}> </th>
                        <th style={th}>Action</th>
                        <th style={th}>Sheet</th>
                        <th style={th}>Title</th>
                        <th style={th}>Rev</th>
                        <th style={th}>Category / Set</th>
                        <th style={th}>Approval</th>
                        <th style={th}>Fab/Field</th>
                        <th style={th}>Det/Chk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 400).map((r) => {
                        const off = excluded.has(r.sheet_number);
                        return (
                          <tr key={r.sheet_number} style={{ opacity: off ? 0.4 : 1 }}>
                            <td style={td}><input type="checkbox" checked={!off} onChange={() => toggleExclude(r.sheet_number)} aria-label={`Include ${r.sheet_number}`} /></td>
                            <td style={{ ...td, ...mono, fontSize: 10, color: r.action === "update" ? ACCENT : "var(--status-success)" }}>{r.action === "update" ? "ENRICH" : "NEW"}</td>
                            <td style={{ ...td, fontWeight: 700, color: "var(--text-primary)" }}>{r.sheet_number}</td>
                            <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || "—"}</td>
                            <td style={{ ...td, ...mono, fontSize: 11 }}>{r.revision_number || "—"}</td>
                            <td style={{ ...td, fontSize: 11 }}>{r.category || "—"}</td>
                            <td style={{ ...td, ...mono, fontSize: 11 }}>{r.submitted_date || "—"}</td>
                            <td style={{ ...td, ...mono, fontSize: 11 }}>{r.issued_date || "—"}</td>
                            <td style={{ ...td, ...mono, fontSize: 10 }}>{[r.detailer, r.checker].filter(Boolean).join(" / ") || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {rows.length > 400 && <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "8px 12px" }}>… and {rows.length - 400} more (all included unless excluded above)</div>}
              </div>

              {skipped.length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 12 }}>{skipped.length} skipped row{skipped.length === 1 ? "" : "s"}</summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--text-muted)", fontSize: 11 }}>
                    {skipped.slice(0, 20).map((s) => <li key={s.line}>Line {s.line}: {s.reason}</li>)}
                  </ul>
                </details>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}><FileText size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />{file?.name}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="sbd-btn sbd-btn-ghost" onClick={reset} disabled={step === "committing"}>Back</button>
                  <button className="sbd-btn sbd-btn-primary" onClick={runCommit} disabled={step === "committing" || keptCount === 0}>
                    {step === "committing" ? "Importing…" : `Import ${keptCount} sheet${keptCount === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "done" && lastResult && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <CheckCircle2 size={32} style={{ color: "var(--status-success)" }} />
              <div style={{ marginTop: 10, color: "var(--text-primary)", fontWeight: 700 }}>
                {lastResult.created} added{lastResult.updated ? `, ${lastResult.updated} enriched` : ""}{lastResult.failed ? `, ${lastResult.failed} failed` : ""}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const th = { textAlign: "left", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--divider)" };
const td = { padding: "7px 10px", borderBottom: "1px solid var(--divider)", color: "var(--text-secondary)" };

function StatChip({ label, value, tone }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
      {label}<strong style={{ color: tone, fontSize: 12 }}>{value}</strong>
    </span>
  );
}
