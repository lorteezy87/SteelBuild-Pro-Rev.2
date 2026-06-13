/**
 * ProductionStatusImportModal — import per-piece fab status from a Tekla EPM /
 * FabSuite production-control CSV (Phase 4).
 *
 * Mirrors ModelElementImportModal: upload → review (staged rows with per-row
 * exclude) → commit. §30 throughout — parseProductionCsv stages the rows
 * (create/update decided against the project's existing piece_production), and
 * nothing writes until the user confirms. Local parse, no AI, no credits; the
 * commit goes through the typed repository (RLS: field+).
 */

import React, { useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { X, Upload, FileText, CheckCircle2, Factory } from "lucide-react";
import { toast } from "sonner";
import { parseProductionCsv } from "@/lib/importProductionStatus";
import { commitProductionRows } from "@/lib/production/repository";

const mono = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const ACCENT = "var(--accent, #3B82F6)";

export default function ProductionStatusImportModal({
  open,
  projectId,
  projectName,
  existing = [],
  onClose,
  onImported,
}) {
  const trapRef = useFocusTrap(open);
  const fileInput = useRef(null);

  const [step, setStep] = useState("upload"); // upload | parsing | preview | committing | done
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [excluded, setExcluded] = useState(new Set());
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr] = useState(null);

  if (!open) return null;

  const reset = () => {
    setStep("upload"); setFile(null); setParsed(null);
    setExcluded(new Set()); setLastResult(null); setErr(null);
  };

  const acceptFile = (f) => {
    setErr(null);
    if (!f) return;
    if (!/\.(csv|tsv|txt)$/i.test(f.name) && f.type !== "text/csv" && f.type !== "text/plain") {
      setErr("File must be a CSV (or plain text)."); return;
    }
    if (f.size > 8 * 1024 * 1024) { setErr("CSV exceeds 8 MB limit."); return; }
    setFile(f);
  };

  const runParse = async () => {
    if (!file) return;
    setStep("parsing"); setErr(null);
    try {
      const text = await file.text();
      const res = parseProductionCsv(text, { existing });
      if (!res.ok) throw new Error(res.error || "Could not parse the CSV.");
      if (res.rows.length === 0) throw new Error("No piece rows found in the CSV.");
      setParsed(res);
      setStep("preview");
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("upload");
    }
  };

  const toggleExclude = (mark) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(mark)) next.delete(mark); else next.add(mark);
      return next;
    });
  };

  const runCommit = async () => {
    if (!parsed || !projectId) return;
    const kept = parsed.rows.filter((r) => !excluded.has(r.piece_mark));
    if (kept.length === 0) { setErr("Every row is excluded — nothing to import."); return; }

    setStep("committing"); setErr(null);
    try {
      const { created, updated } = await commitProductionRows(projectId, kept);
      setLastResult({ created, updated });
      toast.success(
        `${created} piece${created === 1 ? "" : "s"} imported`
        + (updated ? `, ${updated} updated` : ""),
      );
      onImported?.({ created, updated });
      setStep("done");
      setTimeout(() => { reset(); onClose(); }, 1500);
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("preview");
    }
  };

  const rows = parsed?.rows || [];
  const keptCount = rows.length - excluded.size;
  const stats = parsed?.stats;
  const skipped = parsed?.skipped || [];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        ref={trapRef}
        onKeyDown={(e) => { if (e.key === "Escape" && step !== "committing") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 940, maxWidth: "96vw", maxHeight: "92vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)", borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 4, zIndex: 1201, outline: "none",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <Factory size={18} style={{ color: ACCENT, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              Import Production Status{projectName ? ` — ${projectName}` : ""}
            </div>
            <div style={{ ...mono, fontSize: 9, color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload" && "STEP 1 · UPLOAD TEKLA EPM / FABSUITE CSV"}
              {step === "parsing" && "STEP 2 · PARSING"}
              {step === "preview" && `STEP 2 · REVIEW · ${keptCount} OF ${rows.length} ROWS`}
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
            <div role="alert" style={{
              marginBottom: 12, padding: "10px 12px", borderRadius: 8,
              border: "1px solid color-mix(in srgb, var(--status-error) 45%, transparent)",
              background: "color-mix(in srgb, var(--status-error) 12%, transparent)",
              color: "var(--text-primary)", fontSize: 12,
            }}>
              {err}
            </div>
          )}

          {(step === "upload" || step === "parsing") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6 }}>
                Export a production-control report from Tekla EPM / FabSuite (CSV) and upload it here.
                Recognized columns: <span style={mono}>Piece Mark</span> (required), Assembly, Status/Stage,
                % Complete, Qty, Weight, Sequence/Lot, Area, and station dates (Cut/Fit/Weld/Clean/Paint/Ship).
                The stage is read from the status column, the furthest completed station, or % complete — in that order.
              </p>
              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files?.[0]); }}
                style={{
                  border: "1.5px dashed var(--border-default)", borderRadius: 10,
                  padding: "34px 20px", textAlign: "center", cursor: "pointer", background: "var(--bg-surface-low)",
                }}
              >
                <Upload size={22} style={{ color: "var(--text-muted)" }} />
                <div style={{ marginTop: 8, color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>
                  {file ? file.name : "Drop a CSV here, or click to browse"}
                </div>
                {file && <div style={{ ...mono, marginTop: 4, color: "var(--text-muted)", fontSize: 10 }}>{(file.size / 1024).toFixed(0)} KB</div>}
                <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => acceptFile(e.target.files?.[0])} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="sbd-btn sbd-btn-ghost" onClick={onClose}>Cancel</button>
                <button className="sbd-btn sbd-btn-primary" disabled={!file || step === "parsing"} onClick={runParse}>
                  {step === "parsing" ? "Parsing…" : "Review pieces"}
                </button>
              </div>
            </div>
          )}

          {(step === "preview" || step === "committing") && parsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <StatChip label="New" value={stats.create} tone="var(--status-success)" />
                <StatChip label="Updates" value={stats.update} tone={ACCENT} />
                <StatChip label="Skipped rows" value={stats.skipped} tone="var(--text-muted)" />
              </div>

              <div style={{ border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)", zIndex: 1 }}>
                        <th style={th}> </th>
                        <th style={th}>Action</th>
                        <th style={th}>Mark</th>
                        <th style={th}>Assembly</th>
                        <th style={th}>Stage</th>
                        <th style={{ ...th, textAlign: "right" }}>%</th>
                        <th style={th}>Ship</th>
                        <th style={th}>Seq</th>
                        <th style={th}>Area</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const off = excluded.has(r.piece_mark);
                        return (
                          <tr key={r.piece_mark} style={{ opacity: off ? 0.4 : 1 }}>
                            <td style={td}>
                              <input type="checkbox" checked={!off} onChange={() => toggleExclude(r.piece_mark)} aria-label={`Include ${r.piece_mark}`} />
                            </td>
                            <td style={{ ...td, ...mono, fontSize: 10, color: r.action === "update" ? ACCENT : "var(--status-success)" }}>
                              {r.action.toUpperCase()}
                            </td>
                            <td style={{ ...td, fontWeight: 700, color: "var(--text-primary)" }}>{r.piece_mark}</td>
                            <td style={td}>{r.assembly_mark || "—"}</td>
                            <td style={td}>
                              <span style={{ color: r.status ? "var(--text-primary)" : "var(--text-muted)" }}>{r.status || "—"}</span>
                            </td>
                            <td style={{ ...td, textAlign: "right" }} className="sbd-num">{r.percent_complete ?? "—"}</td>
                            <td style={{ ...td, ...mono, fontSize: 10 }}>{r.ship_date || "—"}</td>
                            <td style={td}>{r.sequence_number || "—"}</td>
                            <td style={td}>{r.erection_area || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {skipped.length > 0 && (
                <details>
                  <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 12 }}>
                    {skipped.length} skipped row{skipped.length === 1 ? "" : "s"} (missing / duplicate piece marks)
                  </summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--text-muted)", fontSize: 11 }}>
                    {skipped.slice(0, 20).map((s) => <li key={s.line}>Line {s.line}: {s.reason}</li>)}
                    {skipped.length > 20 && <li>… and {skipped.length - 20} more</li>}
                  </ul>
                </details>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                  <FileText size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  {file?.name}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="sbd-btn sbd-btn-ghost" onClick={reset} disabled={step === "committing"}>Back</button>
                  <button className="sbd-btn sbd-btn-primary" onClick={runCommit} disabled={step === "committing" || keptCount === 0}>
                    {step === "committing" ? "Importing…" : `Import ${keptCount} piece${keptCount === 1 ? "" : "s"}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "done" && lastResult && (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <CheckCircle2 size={32} style={{ color: "var(--status-success)" }} />
              <div style={{ marginTop: 10, color: "var(--text-primary)", fontWeight: 700 }}>
                {lastResult.created} imported{lastResult.updated ? `, ${lastResult.updated} updated` : ""}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const th = {
  textAlign: "left", padding: "8px 10px", fontFamily: "var(--font-mono)",
  fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
  color: "var(--text-muted)", borderBottom: "1px solid var(--divider)",
};
const td = { padding: "7px 10px", borderBottom: "1px solid var(--divider)", color: "var(--text-secondary)" };

function StatChip({ label, value, tone }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999,
      border: "1px solid var(--border-default)", background: "var(--bg-surface-low)",
      fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
    }}>
      {label}
      <strong style={{ color: tone, fontSize: 12 }}>{value}</strong>
    </span>
  );
}
