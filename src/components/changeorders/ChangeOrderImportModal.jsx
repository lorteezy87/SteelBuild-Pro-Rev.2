/**
 * ChangeOrderImportModal — bulk import CO rows from CSV.
 *
 * Review source references and Draft/Submitted rows, then create through
 * the numbered-record API. Keep returned numbers and row failures visible;
 * source identity and content provenance make repeat imports reviewable.
 */

import React, { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { X, Upload, FileText, CheckCircle2, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { readChangeOrderCsvFile } from "@/lib/importChangeOrderCsv";
import { invalidateEntity } from "@/services/cacheRegistry";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { commitChangeOrderImport, prepareChangeOrderImport, matchImportProject } from "@/lib/changeOrders/importBatch";

const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "var(--font-display)" };
const AI      = "var(--accent)";

/**
 * @param {{
 *   open: boolean,
 *   projectId?: string | null,
 *   projectName?: string | null,
 *   projects?: Array<Pick<import("@/api/client/supabaseTypes").RowWithAliases<"projects">, "id"> & Partial<Pick<import("@/api/client/supabaseTypes").RowWithAliases<"projects">, "name" | "org_id" | "project_number">>>,
 *   onClose: () => void,
 *   onCreated?: (result: { created: number, skipped: number, failed: number }) => void,
 *   assertMutationScope?: (projectId: string) => void
 * }} props
 */
export default function ChangeOrderImportModal({
  open,
  projectId,
  projectName,
  projects = [],
  onClose,
  onCreated,
  assertMutationScope,
}) {
  const qc = useQueryClient();
  const trapRef = useFocusTrap(open);
  const fileInput = useRef(null);

  const [step, setStep]             = useState("upload");
  const [file, setFile]             = useState(null);
  const [parsed, setParsed]         = useState(null);
  const [matchedProject, setMatched] = useState(null);
  const [chosenProjectId, setChosen] = useState(projectId || null);
  const [excluded, setExcluded]     = useState(new Set());
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr]               = useState(null);

  const [preparedRows, setPreparedRows] = useState([]);
  const sessionRef = useRef(0);
  const mountedRef = useRef(false);
  const currentRef = useRef({ open, projects, assertMutationScope });
  currentRef.current = { open, projects, assertMutationScope };
  useEffect(() => {
    sessionRef.current += 1;
    mountedRef.current = true;
    setStep("upload"); setFile(null); setParsed(null); setPreparedRows([]);
    setMatched(null); setChosen(projectId || null); setExcluded(new Set());
    setLastResult(null); setErr(null);
    return () => { mountedRef.current = false; sessionRef.current += 1; };
  }, [open, projectId]);
  const createImportGuard = () => {
    const session = sessionRef.current;
    const isCurrent = () => mountedRef.current && currentRef.current.open && sessionRef.current === session;
    const assert = (targetProjectId) => {
      if (!isCurrent()) throw new Error("Import session changed. Reopen the CSV and try again.");
      if (!currentRef.current.projects.some(project => project.id === targetProjectId)) throw new Error("Select a project from the current workspace.");
      currentRef.current.assertMutationScope?.(targetProjectId);
    };
    return { assert, isCurrent };
  };

  if (!open) return null;

  const acceptFile = (f) => {
    setErr(null);
    if (!f) return;
    if (!/\.(csv|tsv|txt)$/i.test(f.name) && f.type !== "text/csv" && f.type !== "text/plain") {
      setErr("File must be a CSV (or plain text).");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setErr("CSV exceeds 8 MB limit.");
      return;
    }
    setFile(f);
  };

  const runParse = async () => {
    if (!file) return;
    const guard = createImportGuard();
    setStep("parsing"); setErr(null);
    try {
      guard.assert(projectId || chosenProjectId);
      const res = await readChangeOrderCsvFile(file);
      guard.assert(projectId || chosenProjectId);
      if (!res.cos || res.cos.length === 0) {
        const detail = res.warnings?.length ? ` ${res.warnings.join(" ")}` : "";
        throw new Error(`No change-order rows found in the CSV.${detail}`);
      }
      const match = matchImportProject(res.header?.job_number, projects);
      if (res.header?.job_number && !match) throw new Error(`CSV job ${res.header.job_number} does not uniquely match the selected project. Open the correct project or correct the CSV job number before importing.`);
      const destination = match?.id || projectId || chosenProjectId;
      guard.assert(destination);
      const prepared = await prepareChangeOrderImport(res.cos, destination);
      guard.assert(destination);
      setParsed(res); setPreparedRows(prepared); setLastResult(null); setExcluded(new Set());
      setMatched(match); setChosen(destination); setStep("preview");
    } catch (e) {
      if (!guard.isCurrent()) return;
      setErr(toUserErrorMessage(e, String(e))); setStep("upload");
    }
  };

  const toggleExclude = (rowIndex) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const runCommit = async () => {
    if (!parsed || !chosenProjectId) return;
    const guard = createImportGuard();
    const candidates = lastResult?.failed.length ? lastResult.failed.map(result => result.row) : preparedRows;
    const kept = candidates.filter(row => !excluded.has(row.index));
    if (!kept.length) { setErr("Every row is excluded — nothing to import."); return; }
    setStep("committing"); setErr(null);
    try {
      guard.assert(chosenProjectId);
      const result = await commitChangeOrderImport({
        rows: kept, projectId: chosenProjectId, assertScope: guard.assert,
        readExisting: targetProjectId => entities.ChangeOrder.filterAll({ project_id: targetProjectId }),
        create: (payload, options) => entities.ChangeOrder.create(payload, options),
      });
      // A completed insert still belongs to the original project, even if its modal closed.
      if (result.succeeded.length) {
        await invalidateEntity(qc, "change_order", chosenProjectId);
        void qc.invalidateQueries({ queryKey: ["projects"] });
      }
      if (!guard.isCurrent()) return;
      const receipts = [...(lastResult?.receipts || []), ...result.succeeded, ...result.skipped];
      setLastResult({ ...result, receipts });
      if (result.failed.length) {
        toast.warning(`${result.succeeded.length} imported, ${result.failed.length} need attention. Review the remaining rows before retrying.`);
        setStep("preview");
      } else {
        toast.success(`${result.succeeded.length} imported${result.skipped.length ? `, ${result.skipped.length} already imported` : ""}`);
        setStep("done");
      }
      onCreated?.({ created: result.succeeded.length, skipped: result.skipped.length, failed: result.failed.length });
    } catch (e) {
      if (!guard.isCurrent()) return;
      setErr(toUserErrorMessage(e, String(e))); setStep("preview");
    }
  };

  const header = parsed?.header || {};
  const displayRows = lastResult?.failed.length ? lastResult.failed.map(result => result.row) : preparedRows;
  const cos = displayRows.map(row => row.source);
  const keptCount = displayRows.filter(row => !excluded.has(row.index)).length;
  const warnings = parsed?.warnings || [];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg-base) 65%, transparent)", zIndex: 1200 }} />
      <div
        ref={trapRef}
        onKeyDown={(e) => { if (e.key === "Escape" && step !== "committing") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 960, maxWidth: "96vw", maxHeight: "92vh",
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
              Import Change Orders
            </div>
            <div style={{ ...mono, fontSize: 9, color: AI, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload"     && "STEP 1 · UPLOAD CSV"}
              {step === "parsing"    && "STEP 2 · PARSING"}
              {step === "preview"    && `STEP 2 · REVIEW · ${keptCount} OF ${cos.length} ROWS`}
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
                <input
                  ref={fileInput}
                  type="file" aria-label="Change order CSV"
                  accept=".csv,.tsv,.txt,text/csv,text/plain"
                  style={{ display: "none" }}
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />
                {file ? (
                  <div>
                    <FileText size={24} color={AI} style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 13, color: "var(--text-primary)" }}>{file.name}</div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                      {(file.size / 1024).toFixed(1)} KB — click to replace
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      Drop CO log CSV here
                    </div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                      Export from Sage / Vista / Procore / Excel ("Save As CSV"). Max 8 MB.
                      <br />
                      Expected columns: CO #, Title, Amount, Status, Submitted, Approved, etc.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "parsing" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <div style={{ ...mono, fontSize: 12, color: AI, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                ● PARSING CSV…
              </div>
            </div>
          )}

          {step === "preview" && parsed && (
            <div>
              <p style={{ color: "var(--text-secondary)", marginBottom: 14 }}>
                SteelBuild assigns a new official CO number. The CSV reference is preserved in notes.
                Only Draft and Submitted changes can be imported; approvals and other decisions require individual review.
              </p>
              {/* Warnings strip */}
              {warnings.length > 0 && (
                <div style={{
                  padding: "8px 12px", marginBottom: 10,
                  background: "color-mix(in srgb, var(--status-warning) 6%, transparent)",
                  border: "1px solid var(--status-warning)",
                  borderRadius: 3,
                }}>
                  {warnings.map((w, i) => (
                    <div key={i} style={{ ...mono, fontSize: 10, color: "var(--status-warning)", marginBottom: 2 }}>
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Project match */}
              <div style={{
                border: `1px solid ${matchedProject ? "var(--status-success)" : "var(--status-warning)"}`,
                background: matchedProject ? "color-mix(in srgb, var(--status-success) 6%, transparent)" : "color-mix(in srgb, var(--status-warning) 6%, transparent)",
                padding: "10px 14px", marginBottom: 14, borderRadius: 4,
              }}>
                <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                              color: matchedProject ? "var(--status-success)" : "var(--status-warning)", marginBottom: 4 }}>
                  {matchedProject ? "PROJECT MATCHED" : chosenProjectId ? "PROJECT: (ACTIVE)" : "NO MATCH — PICK A PROJECT"}
                </div>
                {matchedProject ? (
                  <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                    <span style={{ ...mono, color: "var(--accent)", marginRight: 8 }}>{matchedProject.project_number}</span>
                    {matchedProject.name}
                  </div>
                ) : (
                  <select
                    aria-label="Import project" disabled
                    value={chosenProjectId || ""}
                    onChange={(e) => setChosen(e.target.value)}
                    style={{
                      width: "100%", padding: "6px 10px", fontSize: 12,
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
                )}
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>
                  {header.job_number ? <>CSV job #: <strong>{header.job_number}</strong>{header.job_name ? ` · ${header.job_name}` : ""}</> : null}
                </div>
              </div>

              {/* CO rows */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  Change Orders in CSV ({cos.length})
                </div>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                  Source references prevent duplicate imports
                </div>
              </div>
              <div style={{ border: "1px solid var(--border-default)", borderRadius: 2, maxHeight: 420, overflowY: "auto" }}>
                <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)", zIndex: 1 }}>
                    <tr>
                      {["Source CO", "Title", "Source status", "Amount", "Submitted", "Approved", ""].map((h, i) => (
                        <th key={h} style={{
                          ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                          color: "var(--text-muted)", padding: "6px 8px",
                          textAlign: i === 3 ? "right" : "left",
                          borderBottom: "1px solid var(--divider)", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cos.map((r, index) => {
                      const row = displayRows[index];
                      const ex = excluded.has(row.index);
                      const failure = lastResult?.failed.find(result => result.row.index === row.index)?.error || row.error;
                      return (
                        <tr
                          key={row.index}
                          style={{
                            borderBottom: "1px solid var(--divider)",
                            opacity: ex ? 0.45 : 1,
                            textDecoration: ex ? "line-through" : "none",
                          }}
                        >
                          <Td mono accent>{r.co_number}</Td>
                          <Td>{r.title || <span style={{ color: "var(--text-muted)" }}>—</span>}{failure && <div role="alert" style={{ color: "var(--status-error)", whiteSpace: "normal", marginTop: 6 }}>{failure}</div>}</Td>
                          <Td>
                            <span style={{
                              ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                              color: statusColor(r.status),
                              padding: "1px 6px",
                              background: `color-mix(in srgb, ${statusColor(r.status)} 14%, transparent)`,
                              border: `1px solid ${statusColor(r.status)}`,
                              borderRadius: 2,
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                            }}>
                              {r.status || "Draft"}
                            </span>
                          </Td>
                          <Td mono align="right">
                            {r.co_amount === null ? "—" : formatMoney(r.co_amount)}
                          </Td>
                          <Td mono>{r.submitted_date || "—"}</Td>
                          <Td mono success={!!r.approved_date}>{r.approved_date || "—"}</Td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>
                            <button
                              onClick={() => toggleExclude(row.index)}
                              style={{
                                ...mono, fontSize: 9, padding: "2px 6px",
                                background: "transparent",
                                border: "1px solid var(--divider)",
                                borderRadius: 2,
                                color: "var(--text-muted)",
                                cursor: "pointer",
                              }}
                            >
                              {ex ? "RESTORE" : "REMOVE"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div style={{ display: "flex", gap: 18, marginTop: 10, ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                <span>Selected: <strong style={{ color: "var(--text-primary)" }}>{keptCount}</strong> of {cos.length}</span>
                <span>
                  Total $ (selected):{" "}
                  <strong style={{ color: "var(--accent)" }}>
                    {formatMoney(
                      cos
                        .filter((_r, index) => !excluded.has(displayRows[index].index))
                        .reduce((s, r) => s + (Number(r.co_amount) || 0), 0)
                    )}
                  </strong>
                </span>
                {parsed.skippedBlankRows > 0 && (
                  <span>Blank rows skipped: <strong>{parsed.skippedBlankRows}</strong></span>
                )}
              </div>
            </div>
          )}

          {step === "committing" && (
            <div style={{ textAlign: "center", padding: "48px 20px", ...mono, fontSize: 12, color: AI }}>
              ● IMPORTING CHANGE ORDERS…
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
                  {lastResult.receipts.length} reviewed records
                  {lastResult.failed.length > 0 && (
                    <span style={{ color: "var(--status-error)" }}> · {lastResult.failed.length} failed</span>
                  )}
                </div>
              )}
            </div>
          )}

          {lastResult?.receipts.length > 0 && (
            <div aria-label="Imported change orders" style={{ marginTop: 16 }}>
              <div style={{ ...mono, color: "var(--text-muted)", marginBottom: 8 }}>Source reference → SteelBuild CO number</div>
              {lastResult.receipts.map(({ row, record }) => (
                <div key={row.index} style={{ display: "flex", gap: 20, padding: "6px 0", borderBottom: "1px solid var(--divider)" }}>
                  <span>{row.source.co_number}</span><strong>{record.co_number || "Number unavailable — open the project register"}</strong>
                </div>
              ))}
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
          {step === "done" && <button onClick={onClose} style={btnPrimary}>DONE</button>}
          {step === "upload" && (
            <>
              <button onClick={onClose} style={btnGhost}>CANCEL</button>
              <button onClick={runParse} disabled={!file}
                      style={{ ...btnPrimary, opacity: file ? 1 : 0.5, cursor: file ? "pointer" : "not-allowed" }}>
                PARSE <ArrowRight size={12} style={{ marginLeft: 4, verticalAlign: "middle" }} />
              </button>
            </>
          )}
          {step === "preview" && (
            <>
              <button onClick={() => { setParsed(null); setStep("upload"); }} style={btnGhost}>
                BACK
              </button>
              <button onClick={runCommit} disabled={!chosenProjectId || keptCount === 0}
                      style={{ ...btnPrimary, opacity: (!chosenProjectId || keptCount === 0) ? 0.5 : 1 }}>
                {lastResult?.failed.length ? `RETRY ${keptCount} FAILED` : `IMPORT ${keptCount}`}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Visual helpers ──────────────────────────────────────────────────
function statusColor(s) {
  switch (String(s || "").toLowerCase()) {
    case "approved":       return "var(--status-success)";
    case "rejected":       return "var(--status-error)";
    case "void":           return "var(--text-muted)";
    case "draft":          return "var(--text-muted)";
    case "submitted":      return "var(--status-info)";
    case "under review":   return "var(--status-warning)";
    default:               return "var(--text-muted)";
  }
}
function formatMoney(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n));
}

function Td({ children, mono: isMono, accent, success, align = "left" }) {
  return (
    <td style={{
      padding: "5px 8px",
      fontFamily: isMono ? "var(--font-mono)" : "var(--font-body)",
      color: accent ? "var(--accent)" : success ? "var(--status-success)" : "var(--text-primary)",
      whiteSpace: "nowrap",
      textAlign: align,
      fontVariantNumeric: isMono ? "tabular-nums" : undefined,
    }}>
      {children ?? "—"}
    </td>
  );
}

const btnPrimary = {
  padding: "8px 22px", background: AI, color: "var(--on-accent)",
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
