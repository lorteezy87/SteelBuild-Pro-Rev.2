import React, { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { X, Upload, FileText, CheckCircle2, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  uploadRfiLog,
  extractRfiLog,
  resolveProjectForRfiLog,
  commitRfiLog,
} from "@/lib/importRfiLog";
import { readRfiCsvFile } from "@/lib/importRfiCsv";

const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const AI      = "var(--ai-accent, #22D3EE)";

/**
 * RFI log import wizard: upload PDF → AI extract → preview → confirm.
 * Mirrors the ShippingTicketImportModal pattern but with dedup on
 * (project_id, rfi_number) so re-running the import is safe.
 */
export default function RfiLogImportModal({ open, projectId, projectName, projects = [], onClose, onCreated }) {
  const qc = useQueryClient();
  const trapRef = useFocusTrap(open);
  const fileInput = useRef(null);

  const [step, setStep] = useState("upload");  // upload | extracting | preview | committing | done
  const [file, setFile] = useState(null);
  const [uploaded, setUploaded] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [matchedProject, setMatched] = useState(null);
  const [chosenProjectId, setChosen] = useState(projectId || null);
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr] = useState(null);

  if (!open) return null;

  const reset = () => {
    setStep("upload"); setFile(null); setUploaded(null); setParsed(null);
    setMatched(null); setChosen(projectId || null); setLastResult(null); setErr(null);
  };

  // Files we accept: PDF (AI path) or CSV/TSV/TXT (plain parser, no AI).
  // The CSV path is much more reliable and requires zero API credits —
  // most GC tools (Procore, PlanGrid, Bluebeam) can export the RFI log
  // directly as CSV.
  const fileKind = (f) => {
    if (!f) return null;
    if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") return "pdf";
    if (/\.(csv|tsv|txt)$/i.test(f.name) || f.type === "text/csv" || f.type === "application/csv" || f.type === "text/plain") return "csv";
    return null;
  };

  const acceptFile = (f) => {
    setErr(null);
    if (!f) return;
    const kind = fileKind(f);
    if (!kind) {
      setErr("File must be a PDF or CSV.");
      return;
    }
    const limit = kind === "pdf" ? 32 : 8;
    if (f.size > limit * 1024 * 1024) {
      setErr(`File exceeds ${limit} MB limit.`);
      return;
    }
    setFile(f);
  };

  const runExtract = async () => {
    if (!file) return;
    setStep("extracting"); setErr(null);
    try {
      const kind = fileKind(file);
      let res;
      if (kind === "csv") {
        // Plain-CSV path: parse client-side, no AI, no network except
        // the eventual commit. Warnings are bubbled up so the user can
        // see "we couldn't find a Subject column" etc.
        res = await readRfiCsvFile(file);
        setUploaded(null); // no upload needed for CSV
        if (res.warnings?.length) {
          console.warn("[RfiLogImport] CSV warnings:", res.warnings);
        }
        if (!res.rfis || res.rfis.length === 0) {
          const detail = res.warnings?.length
            ? ` ${res.warnings.join(" ")}`
            : "";
          throw new Error(`No RFI rows found in the CSV.${detail}`);
        }
      } else {
        // PDF path: upload + AI extraction (legacy, requires API credits).
        const up = await uploadRfiLog(file);
        setUploaded(up);
        res = await extractRfiLog(up);
      }
      setParsed(res);
      const match = await resolveProjectForRfiLog(res.header?.job_number);
      if (match) {
        setMatched(match);
        setChosen(match.id);
      } else if (projectId) {
        setChosen(projectId);
      }
      setStep("preview");
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("upload");
    }
  };

  const runCommit = async () => {
    if (!parsed) return;
    if (!chosenProjectId) { setErr("Pick a project first."); return; }
    setStep("committing"); setErr(null);
    try {
      const project = projects.find(p => p.id === chosenProjectId);
      const res = await commitRfiLog({
        header:      parsed.header,
        rfis:        parsed.rfis,
        projectId:   chosenProjectId,
        projectName: project?.name || projectName || null,
      });
      setLastResult(res);
      toast.success(`${res.created} RFI${res.created === 1 ? "" : "s"} imported${res.skipped ? `, ${res.skipped} skipped (already in project)` : ""}`);
      qc.invalidateQueries({ queryKey: ["rfis"] });
      qc.invalidateQueries({ queryKey: ["rfis", chosenProjectId] });
      onCreated?.(res);
      setStep("done");
      setTimeout(() => { reset(); onClose(); }, 1500);
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("preview");
    }
  };

  const header = parsed?.header || {};
  const rfis   = parsed?.rfis   || [];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        ref={trapRef}
        onKeyDown={(e) => { if (e.key === "Escape" && step !== "committing") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 880, maxWidth: "96vw", maxHeight: "92vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderLeft: `3px solid ${AI}`,
          borderRadius: 4,
          zIndex: 1201, outline: "none",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--divider)",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              Import RFI Log
            </div>
            <div style={{ ...mono, fontSize: 9, color: AI, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload"     && "STEP 1 · UPLOAD"}
              {step === "extracting" && "STEP 2 · EXTRACTING"}
              {step === "preview"    && "STEP 2 · REVIEW"}
              {step === "committing" && "STEP 3 · IMPORTING"}
              {step === "done"       && "DONE"}
            </div>
          </div>
          <button onClick={onClose} disabled={step === "committing"} aria-label="Close"
                  style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {step === "upload" && (
            <div>
              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = `color-mix(in srgb, ${AI} 8%, transparent)`; }}
                onDragLeave={(e) => { e.currentTarget.style.background = "var(--bg-page)"; }}
                onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files?.[0]); e.currentTarget.style.background = "var(--bg-page)"; }}
                style={{
                  border: `1px dashed ${AI}`,
                  borderRadius: 4,
                  padding: "32px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: "var(--bg-page)",
                }}
              >
                <input ref={fileInput} type="file"
                       accept=".csv,.tsv,.txt,text/csv,application/csv,text/plain,application/pdf,.pdf"
                       style={{ display: "none" }}
                       onChange={(e) => acceptFile(e.target.files?.[0])} />
                {file ? (
                  <div>
                    <FileText size={24} color={AI} style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 13, color: "var(--text-primary)" }}>{file.name}</div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                      {(file.size / 1e6).toFixed(1)} MB — click to replace
                    </div>
                    <div style={{ ...mono, fontSize: 9, color: fileKind(file) === "csv" ? "var(--status-success)" : AI, marginTop: 6, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      {fileKind(file) === "csv" ? "CSV — parsed locally, no AI needed" : "PDF — will use AI extraction"}
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      Drop RFI log CSV or PDF here
                    </div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                      CSV is preferred — parsed instantly, no AI needed. Export from Procore, PlanGrid, Bluebeam, or "Save As CSV" from Excel. PDF also accepted (AI extraction, 32 MB max).
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "extracting" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <div style={{ ...mono, fontSize: 12, color: AI, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                ● READING LOG…
              </div>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                {fileKind(file) === "csv"
                  ? "Parsing CSV locally — should be instant."
                  : "AI pulls the header + every RFI row. Usually 5–15 seconds."}
              </div>
            </div>
          )}

          {step === "preview" && parsed && (
            <div>
              {/* Project match */}
              <div style={{
                border: `1px solid ${matchedProject ? "var(--status-success)" : "var(--status-warning)"}`,
                background: matchedProject ? "color-mix(in srgb, var(--status-success) 6%, transparent)" : "color-mix(in srgb, var(--status-warning) 6%, transparent)",
                padding: "10px 14px", marginBottom: 14, borderRadius: 4,
              }}>
                <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                              color: matchedProject ? "var(--status-success)" : "var(--status-warning)", marginBottom: 4 }}>
                  {matchedProject ? "PROJECT MATCHED" : "NO MATCH — PICK A PROJECT"}
                </div>
                {matchedProject ? (
                  <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                    <span style={{ ...mono, color: "var(--accent)", marginRight: 8 }}>{matchedProject.project_number}</span>
                    {matchedProject.name}
                  </div>
                ) : (
                  <>
                  <DarkProjectSelect
                    value={chosenProjectId || ""}
                    onChange={setChosen}
                    options={projects.map((p) => ({
                      value: p.id,
                      label: `${p.project_number ? `${p.project_number} - ` : ""}${p.name || "Unnamed project"}`,
                    }))}
                  />
                  <select
                    value={chosenProjectId || ""}
                    onChange={(e) => setChosen(e.target.value)}
                    style={{
                      display: "none", width: "100%", padding: "6px 10px", fontSize: 12,
                      background: "var(--bg-page)", border: "1px solid var(--border-default)", borderRadius: 2,
                      color: "var(--text-primary)", fontFamily: "var(--font-body)",
                    }}
                  >
                    <option value="">— select project —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.project_number ? `${p.project_number} — ` : ""}{p.name}
                      </option>
                    ))}
                  </select>
                  </>
                )}
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
                  Log job: {header.job_number ? <strong>{header.job_number}</strong> : "—"}
                  {header.job_name ? ` · ${header.job_name}` : ""}
                </div>
              </div>

              {/* RFI rows */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  RFIs IN LOG ({rfis.length})
                </div>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                  dedup on (project, rfi_number)
                </div>
              </div>
              <div style={{ border: "1px solid var(--border-default)", borderRadius: 2, maxHeight: 420, overflowY: "auto" }}>
                <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)" }}>
                    <tr>
                      {["#","Subject","Assigned To","Submitted","Due","Answered"].map(h => (
                        <th key={h} style={{
                          ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                          color: "var(--text-muted)", padding: "6px 8px", textAlign: "left",
                          borderBottom: "1px solid var(--divider)", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rfis.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--divider)" }}>
                        <Td mono accent>{r.rfi_number}</Td>
                        <Td>{r.title}</Td>
                        <Td>{r.assigned_to || "—"}</Td>
                        <Td mono>{r.date_submitted || "—"}</Td>
                        <Td mono>{r.date_required || "—"}</Td>
                        <Td mono success={!!r.date_answered}>{r.date_answered || "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "committing" && (
            <div style={{ textAlign: "center", padding: "48px 20px", ...mono, fontSize: 12, color: AI }}>
              ● IMPORTING RFIs…
            </div>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <CheckCircle2 size={36} color="var(--status-success)" style={{ marginBottom: 10 }} />
              <div style={{ ...mono, fontSize: 12, color: "var(--status-success)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                IMPORT COMPLETE
              </div>
              {lastResult && (
                <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                  {lastResult.created} new · {lastResult.skipped} skipped
                </div>
              )}
            </div>
          )}

          {err && (
            <div style={{
              marginTop: 12, padding: "8px 12px",
              border: "1px solid var(--status-error)",
              background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
              color: "var(--status-error)", ...mono, fontSize: 11,
            }}>
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--divider)",
          display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0,
        }}>
          {step === "upload" && (
            <>
              <button onClick={onClose} style={btnGhost}>CANCEL</button>
              <button onClick={runExtract} disabled={!file}
                      style={{ ...btnPrimary, opacity: file ? 1 : 0.5, cursor: file ? "pointer" : "not-allowed" }}>
                EXTRACT <ArrowRight size={12} style={{ marginLeft: 4, verticalAlign: "middle" }} />
              </button>
            </>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => { setParsed(null); setUploaded(null); setStep("upload"); }} style={btnGhost}>
                BACK
              </button>
              <button onClick={runCommit} disabled={!chosenProjectId || rfis.length === 0}
                      style={{ ...btnPrimary, opacity: (!chosenProjectId || rfis.length === 0) ? 0.5 : 1 }}>
                IMPORT {rfis.length}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Td({ children, mono: isMono, accent, success }) {
  return (
    <td style={{
      padding: "5px 8px",
      fontFamily: isMono ? "var(--font-mono)" : "var(--font-body)",
      color: accent ? "var(--accent)" : success ? "var(--status-success)" : "var(--text-primary)",
      whiteSpace: "nowrap",
    }}>
      {children ?? "—"}
    </td>
  );
}

function DarkProjectSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((next) => !next)} style={projectSelectButtonStyle}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label || "Select project"}
        </span>
        <span style={{ color: AI, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.12s" }}>v</span>
      </button>
      {open && (
        <div style={projectSelectMenuStyle}>
          <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={projectSelectOptionStyle(!value)}>
            Select project
          </button>
          {options.map((option) => (
            <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false); }} style={projectSelectOptionStyle(option.value === value)}>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const btnPrimary = {
  padding: "8px 22px", background: AI, color: "#000",
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

const projectSelectButtonStyle = {
  width: "100%",
  minHeight: 36,
  padding: "7px 10px",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  background: "rgba(5, 10, 18, 0.98)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textAlign: "left",
  cursor: "pointer",
};

const projectSelectMenuStyle = {
  position: "absolute",
  zIndex: 4000,
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  maxHeight: 240,
  overflowY: "auto",
  padding: 4,
  background: "linear-gradient(180deg, rgba(7, 13, 24, 0.998), rgba(4, 9, 18, 0.998))",
  border: `1px solid color-mix(in srgb, ${AI} 38%, var(--border-default))`,
  borderRadius: 8,
  boxShadow: "0 18px 46px rgba(0,0,0,0.74), inset 0 1px 0 rgba(255,255,255,0.06)",
};

const projectSelectOptionStyle = (active) => ({
  width: "100%",
  padding: "8px 10px",
  border: "1px solid transparent",
  borderRadius: 6,
  background: active ? `color-mix(in srgb, ${AI} 14%, transparent)` : "transparent",
  color: active ? AI : "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: active ? 800 : 600,
  textAlign: "left",
  cursor: "pointer",
});
