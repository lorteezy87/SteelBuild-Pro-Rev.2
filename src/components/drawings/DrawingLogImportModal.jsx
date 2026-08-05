/**
 * DrawingLogImportModal — import a detailer Drawing Log (Complete / Submittal)
 * spreadsheet into the drawing register (Phase 4).
 *
 * §30 staged review: parse the .xls/.xlsx (SheetJS) → parseDrawingLog →
 * classify create/update vs the project's existing sheets by number → the user
 * reviews + approves → commit. New sheets are created (metadata-only register
 * entries; PDFs attachable later) into drawing sets resolved by the log's
 * CATEGORY (lookup-or-create, with the (project, set_name) unique-constraint
 * race handled). Existing sheets are ENRICHED — revision, approval date, and
 * detailer/checker in metadata — never clobbered (title / set / file / stage
 * are left as-is). Reuses the drawingEnums sanitizers + ModelElement-style
 * batched writes. RLS: field+.
 */

import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { X, Upload, FileText, CheckCircle2, FileStack } from "lucide-react";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { invalidateEntity } from "@/services/cacheRegistry";
import { sanitizeDrawingPayload, sanitizeDrawingSetPayload } from "@/lib/drawingEnums";
import { parseDrawingLog, classifyDrawingRows } from "@/lib/importDrawingLog";

const mono = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const ACCENT = "var(--accent, #3B82F6)";

const isUniqueViolation = (e) => {
  const m = String(e?.message || e || "").toLowerCase();
  return m.includes("duplicate key") || m.includes("unique constraint") || m.includes("23505");
};
const lc = (v) => String(v || "").trim().toLowerCase();

export default function DrawingLogImportModal({ open, projectId, projectName, onClose, onImported }) {
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

  const { data: existingDrawings = [] } = useQuery({
    queryKey: ["drawings", projectId, "log-import"],
    queryFn: () => entities.Drawing.filter({ project_id: projectId }),
    enabled: !!open && !!projectId,
  });
  const { data: existingSets = [] } = useQuery({
    queryKey: ["drawing_sets", projectId, "log-import"],
    queryFn: () => entities.DrawingSet.filter({ project_id: projectId }),
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

    setStep("committing"); setErr(null);
    try {
      // 1. Resolve a drawing set per category (lookup existing by name, else create).
      const setCache = new Map(); // lc(category) -> { id, name }
      for (const s of existingSets) if (s.set_name) setCache.set(lc(s.set_name), { id: s.id, name: s.set_name });

      const ensureSet = async (category) => {
        const name = category || "Imported Drawings";
        const hit = setCache.get(lc(name));
        if (hit) return hit;
        const { record } = sanitizeDrawingSetPayload({
          project_id: projectId, project_name: projectName, set_name: name,
          status: "Active", discipline: name,
        });
        let resolved;
        try {
          const created = await entities.DrawingSet.create(record);
          resolved = { id: created.id, name: created.set_name };
        } catch (e) {
          if (!isUniqueViolation(e)) throw e;
          const all = await entities.DrawingSet.filter({ project_id: projectId });
          const winner = all.find((s) => lc(s.set_name) === lc(name));
          if (!winner) throw e;
          resolved = { id: winner.id, name: winner.set_name };
        }
        setCache.set(lc(name), resolved);
        return resolved;
      };

      const existingById = new Map(existingDrawings.map((d) => [d.id, d]));
      const creates = kept.filter((r) => r.action === "create");
      const updates = kept.filter((r) => r.action === "update" && r.existing_id);

      // 2. Create new sheets, grouped by their category set.
      let created = 0;
      let failed = 0;
      for (let i = 0; i < creates.length; i += 10) {
        const chunk = creates.slice(i, i + 10);
        const results = await Promise.allSettled(chunk.map(async (r) => {
          const set = await ensureSet(r.category);
          const { record } = sanitizeDrawingPayload({
            project_id: projectId, project_name: projectName,
            sheet_number: r.sheet_number, title: r.title,
            revision_number: r.revision_number || "0",
            submitted_date: r.submitted_date || null,
            drawing_set_id: set.id, drawing_set_name: set.name,
            discipline: r.category || null,
            metadata: logMeta(r),
          });
          return entities.Drawing.create(record);
        }));
        created += results.filter((x) => x.status === "fulfilled").length;
        failed += results.filter((x) => x.status === "rejected").length;
      }

      // 3. Enrich existing sheets — revision/date + metadata only; never clobber.
      let updated = 0;
      for (let i = 0; i < updates.length; i += 10) {
        const chunk = updates.slice(i, i + 10);
        const results = await Promise.allSettled(chunk.map((r) => {
          const prior = existingById.get(r.existing_id);
          const patch = {
            revision_number: r.revision_number || prior?.revision_number || "0",
            ...(r.submitted_date ? { submitted_date: r.submitted_date } : {}),
            metadata: { ...(prior?.metadata || {}), drawing_log: logMeta(r).drawing_log },
          };
          return entities.Drawing.update(r.existing_id, sanitizeDrawingPayload(patch).record);
        }));
        updated += results.filter((x) => x.status === "fulfilled").length;
        failed += results.filter((x) => x.status === "rejected").length;
      }

      setLastResult({ created, updated, failed });
      await invalidateEntity(qc, "drawing", projectId);
      await invalidateEntity(qc, "drawingSet", projectId);
      await invalidateEntity(qc, "submittal", projectId);
      const summary = `${created} sheet${created === 1 ? "" : "s"} added` + (updated ? `, ${updated} enriched` : "");
      if (created + updated === 0) {
        setErr(`No rows were saved. ${failed} row${failed === 1 ? "" : "s"} failed.`);
        setStep("preview");
        return;
      }
      if (failed > 0) toast.warning(`${summary}, ${failed} failed`);
      else toast.success(summary);
      onImported?.({ created, updated, failed });
      setStep("done");
      setTimeout(() => { reset(); onClose(); }, 1800);
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("preview");
    }
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
                revision, date-sent-for-approval, fab/field date, and detailer/checker are read. New sheets
                are added to drawing sets by the log's category; sheets already in the app are enriched with
                the log's revision + dates (their drawings, set, and stage are left untouched). You approve
                everything on the next screen.
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
                <StatChip label="Enrich existing" value={staged.stats.update} tone={ACCENT} />
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

/** Log metadata bundle stored under metadata.drawing_log. */
function logMeta(r) {
  return {
    drawing_log: {
      detailer: r.detailer || null,
      checker: r.checker || null,
      sheet_size: r.sheet_size || null,
      issued_date: r.issued_date || null,
      category: r.category || null,
      remark: r.remark || null,
      rev_remark: r.rev_remark || null,
      source: "drawing_log",
    },
  };
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
