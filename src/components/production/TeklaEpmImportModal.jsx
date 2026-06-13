/**
 * TeklaEpmImportModal — import a Tekla EPM / FabSuite Data Exchange XML
 * (the Tekla Structures → Tekla EPM handoff). Phase 4, slice 2.
 *
 * Parses the file (parseFabSuiteXml), then a §30 staged review:
 *   • Pieces → model_elements (the BOM): create/update classified by model GUID
 *     against the project's existing elements; commit reuses the ModelElement
 *     entity path (RLS: field+).
 *   • Drawings → PREVIEW ONLY this slice. The app already has a PDF-based
 *     drawing-set/submittal workflow; syncing XML drawing-metadata into it is a
 *     separate, deliberate step (it could enrich or fragment the register), so
 *     this screen shows the drawings + revisions but does not write them.
 *
 * Local parse (DOMParser), no AI, no credits. Upload the extracted *-EPM.xml
 * (the ZIP also holds the drawing PDFs / CNC, which this slice doesn't ingest).
 */

import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { X, Upload, FileText, CheckCircle2, Boxes, FileStack } from "lucide-react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { invalidateEntity } from "@/services/cacheRegistry";
import { parseFabSuiteXml, stageModelElements } from "@/lib/importFabSuiteXml";

const mono = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const ACCENT = "var(--accent, #3B82F6)";

export default function TeklaEpmImportModal({ open, projectId, projectName, onClose, onImported }) {
  const qc = useQueryClient();
  const trapRef = useFocusTrap(open);
  const fileInput = useRef(null);

  const [step, setStep] = useState("upload"); // upload | parsing | preview | committing | done
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [staged, setStaged] = useState(null);
  const [excluded, setExcluded] = useState(new Set());
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr] = useState(null);

  const { data: existingElements = [] } = useQuery({
    queryKey: ["model-elements", projectId],
    queryFn: () => entities.ModelElement.filter({ project_id: projectId }),
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
    if (!/\.xml$/i.test(f.name) && f.type !== "text/xml" && f.type !== "application/xml") {
      setErr("File must be the extracted *-EPM.xml (not the .zip)."); return;
    }
    if (f.size > 32 * 1024 * 1024) { setErr("XML exceeds 32 MB limit."); return; }
    setFile(f);
  };

  const runParse = async () => {
    if (!file) return;
    setStep("parsing"); setErr(null);
    try {
      const text = await file.text();
      const res = parseFabSuiteXml(text);
      if (!res.ok) throw new Error(res.error || "Could not parse the XML.");
      if (res.pieces.length === 0 && res.drawings.length === 0) throw new Error("No pieces or drawings found in the file.");
      setParsed(res);
      setStaged(stageModelElements(res.pieces, existingElements));
      setStep("preview");
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("upload");
    }
  };

  const toggleExclude = (guid) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid); else next.add(guid);
      return next;
    });
  };

  const rowKey = (r) => r.element_guid || r.piece_mark;

  const runCommit = async () => {
    if (!staged || !projectId) return;
    const kept = staged.rows.filter((r) => !excluded.has(rowKey(r)));
    if (kept.length === 0) { setErr("Every piece is excluded — nothing to import."); return; }

    setStep("committing"); setErr(null);
    try {
      const toRow = ({ action: _action, existing_id: _existingId, ...fields }) => ({ ...fields, project_id: projectId, source: "tekla_epm_xml" });
      const creates = kept.filter((r) => r.action === "create").map(toRow);
      const updates = kept.filter((r) => r.action === "update" && r.existing_id);

      let created = 0;
      for (let i = 0; i < creates.length; i += 500) {
        const chunk = creates.slice(i, i + 500);
        await entities.ModelElement.bulkCreate(chunk);
        created += chunk.length;
      }

      let updated = 0;
      let failed = 0;
      for (let i = 0; i < updates.length; i += 10) {
        const chunk = updates.slice(i, i + 10);
        const results = await Promise.allSettled(chunk.map((r) => entities.ModelElement.update(r.existing_id, toRow(r))));
        updated += results.filter((x) => x.status === "fulfilled").length;
        failed += results.filter((x) => x.status === "rejected").length;
      }

      setLastResult({ created, updated, failed });
      invalidateEntity(qc, "model_element", projectId);
      toast.success(`${created} piece${created === 1 ? "" : "s"} imported` + (updated ? `, ${updated} updated` : "") + (failed ? `, ${failed} failed` : ""));
      onImported?.({ created, updated, failed });
      setStep("done");
      setTimeout(() => { reset(); onClose(); }, 1600);
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("preview");
    }
  };

  const pieceRows = staged?.rows || [];
  const keptCount = pieceRows.length - excluded.size;
  const drawings = parsed?.drawings || [];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        ref={trapRef}
        onKeyDown={(e) => { if (e.key === "Escape" && step !== "committing") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          width: 1000, maxWidth: "96vw", maxHeight: "92vh",
          background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)",
          borderLeft: `3px solid ${ACCENT}`, borderRadius: 4, zIndex: 1201, outline: "none",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <Boxes size={18} style={{ color: ACCENT, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              Import Tekla EPM File{projectName ? ` — ${projectName}` : ""}
            </div>
            <div style={{ ...mono, fontSize: 9, color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload" && "STEP 1 · UPLOAD FABSUITE / TEKLA EPM XML"}
              {step === "parsing" && "STEP 2 · PARSING"}
              {step === "preview" && `STEP 2 · REVIEW · ${keptCount} OF ${pieceRows.length} PIECES`}
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
                Export the data file from Tekla EPM / FabSuite (the <span style={mono}>*-EPM.xml</span> inside the package),
                and upload it here. The <strong>pieces (BOM)</strong> import to the model-element register, matched to existing
                pieces by model GUID. <strong>Drawings</strong> are shown for review but not written this step (the PDF drawing
                set workflow owns the register). The package's stage (IFA / IFC) is read from the drawing revisions.
              </p>
              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); acceptFile(e.dataTransfer.files?.[0]); }}
                style={{ border: "1.5px dashed var(--border-default)", borderRadius: 10, padding: "34px 20px", textAlign: "center", cursor: "pointer", background: "var(--bg-surface-low)" }}
              >
                <Upload size={22} style={{ color: "var(--text-muted)" }} />
                <div style={{ marginTop: 8, color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>
                  {file ? file.name : "Drop the *-EPM.xml here, or click to browse"}
                </div>
                {file && <div style={{ ...mono, marginTop: 4, color: "var(--text-muted)", fontSize: 10 }}>{(file.size / 1024).toFixed(0)} KB</div>}
                <input ref={fileInput} type="file" accept=".xml,text/xml,application/xml" hidden onChange={(e) => acceptFile(e.target.files?.[0])} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="sbd-btn sbd-btn-ghost" onClick={onClose}>Cancel</button>
                <button className="sbd-btn sbd-btn-primary" disabled={!file || step === "parsing"} onClick={runParse}>
                  {step === "parsing" ? "Parsing…" : "Review file"}
                </button>
              </div>
            </div>
          )}

          {(step === "preview" || step === "committing") && parsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <StatChip label="New pieces" value={staged.stats.create} tone="var(--status-success)" />
                <StatChip label="Updates" value={staged.stats.update} tone={ACCENT} />
                <StatChip label="Drawings" value={drawings.length} tone="var(--text-muted)" />
                {parsed.source.stage && <StatChip label="Stage" value={parsed.source.stage} tone="var(--status-warning)" />}
                {parsed.project?.number && (
                  <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                    {parsed.project.number} · {parsed.project.name}
                  </span>
                )}
              </div>

              {/* Pieces — staged create/update */}
              <Section icon={<Boxes size={13} />} title={`Pieces → model elements (${keptCount})`}>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)", zIndex: 1 }}>
                        <th style={th}> </th>
                        <th style={th}>Action</th>
                        <th style={th}>Mark</th>
                        <th style={th}>Profile</th>
                        <th style={th}>Grade</th>
                        <th style={{ ...th, textAlign: "right" }}>Qty</th>
                        <th style={{ ...th, textAlign: "right" }}>Wt (kg)</th>
                        <th style={th}>Seq</th>
                        <th style={th}>Drawing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pieceRows.map((r) => {
                        const off = excluded.has(rowKey(r));
                        return (
                          <tr key={rowKey(r)} style={{ opacity: off ? 0.4 : 1 }}>
                            <td style={td}><input type="checkbox" checked={!off} onChange={() => toggleExclude(rowKey(r))} aria-label={`Include ${r.piece_mark}`} /></td>
                            <td style={{ ...td, ...mono, fontSize: 10, color: r.action === "update" ? ACCENT : "var(--status-success)" }}>{r.action.toUpperCase()}</td>
                            <td style={{ ...td, fontWeight: 700, color: "var(--text-primary)" }}>{r.piece_mark}</td>
                            <td style={{ ...td, ...mono, fontSize: 11 }}>{r.profile || "—"}</td>
                            <td style={td}>{r.material_grade || "—"}</td>
                            <td style={{ ...td, textAlign: "right" }} className="sbd-num">{r.quantity ?? "—"}</td>
                            <td style={{ ...td, textAlign: "right" }} className="sbd-num">{r.weight_kg ?? "—"}</td>
                            <td style={td}>{r.sequence_number || "—"}</td>
                            <td style={td}>{r.drawing_no || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* Drawings — preview only */}
              <Section icon={<FileStack size={13} />} title={`Drawings in file (${drawings.length}) — preview, not imported`}>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "0 0 8px" }}>
                  Drawing-register sync is a separate step (the PDF drawing-set workflow owns sheets + revisions).
                </div>
                <div style={{ maxHeight: 180, overflowY: "auto" }}>
                  <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)", zIndex: 1 }}>
                        <th style={th}>Sheet</th>
                        <th style={th}>Title</th>
                        <th style={th}>Category</th>
                        <th style={th}>Rev</th>
                        <th style={th}>Revised</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawings.slice(0, 200).map((d) => (
                        <tr key={d.drawing_number}>
                          <td style={{ ...td, fontWeight: 700, color: "var(--text-primary)" }}>{d.drawing_number}</td>
                          <td style={td}>{d.title || "—"}</td>
                          <td style={td}>{d.category || "—"}</td>
                          <td style={{ ...td, ...mono, fontSize: 11 }}>{d.revision_number || "—"}</td>
                          <td style={{ ...td, ...mono, fontSize: 11 }}>{d.date_revised || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {drawings.length > 200 && <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "8px 0 0" }}>… and {drawings.length - 200} more</div>}
                </div>
              </Section>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                  <FileText size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />{file?.name}
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
                {lastResult.created} imported{lastResult.updated ? `, ${lastResult.updated} updated` : ""}{lastResult.failed ? `, ${lastResult.failed} failed` : ""}
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

function Section({ icon, title, children }) {
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--bg-surface-low)", borderBottom: "1px solid var(--divider)", color: "var(--text-primary)", fontSize: 12, fontWeight: 700 }}>
        <span style={{ color: ACCENT }}>{icon}</span>{title}
      </div>
      <div style={{ padding: "8px 12px" }}>{children}</div>
    </div>
  );
}

function StatChip({ label, value, tone }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
      {label}<strong style={{ color: tone, fontSize: 12 }}>{value}</strong>
    </span>
  );
}
