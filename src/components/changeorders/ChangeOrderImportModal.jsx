/**
 * ChangeOrderImportModal — bulk import CO rows from CSV.
 *
 * Mirrors RfiLogImportModal exactly: upload → preview (project match
 * + row-by-row table with removable rows) → commit (bulk insert
 * via base44.entities.ChangeOrder.create, deduped on co_number
 * within the target project).
 *
 * No AI, no credits — every step is local or a direct Supabase
 * write. CSV is the friendliest format for users coming from
 * Sage / Vista / Procore / Excel.
 */

import React, { useRef, useState } from "react";
import { X, Upload, FileText, CheckCircle2, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { readChangeOrderCsvFile } from "@/lib/importChangeOrderCsv";

const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const AI      = "var(--ai-accent, #22D3EE)";

export default function ChangeOrderImportModal({
  open,
  projectId,
  projectName,
  projects = [],
  onClose,
  onCreated,
}) {
  const qc = useQueryClient();
  const fileInput = useRef(null);

  const [step, setStep]             = useState("upload");
  const [file, setFile]             = useState(null);
  const [parsed, setParsed]         = useState(null);
  const [matchedProject, setMatched] = useState(null);
  const [chosenProjectId, setChosen] = useState(projectId || null);
  const [excluded, setExcluded]     = useState(new Set());
  const [lastResult, setLastResult] = useState(null);
  const [err, setErr]               = useState(null);

  if (!open) return null;

  const reset = () => {
    setStep("upload"); setFile(null); setParsed(null);
    setMatched(null); setChosen(projectId || null); setExcluded(new Set());
    setLastResult(null); setErr(null);
  };

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
    setStep("parsing"); setErr(null);
    try {
      const res = await readChangeOrderCsvFile(file);
      if (!res.cos || res.cos.length === 0) {
        const detail = res.warnings?.length ? ` ${res.warnings.join(" ")}` : "";
        throw new Error(`No change-order rows found in the CSV.${detail}`);
      }
      setParsed(res);

      // Try to auto-match project from job_number (when every row
      // agreed on one) — same pattern as the RFI importer.
      const jobNumber = res.header?.job_number;
      if (jobNumber) {
        try {
          const { data } = await supabase
            .from("projects")
            .select("id, name, project_number")
            .or(`project_number.eq.${jobNumber},project_number.ilike.%${jobNumber}%`)
            .limit(1);
          if (data && data.length > 0) {
            setMatched(data[0]);
            setChosen(data[0].id);
          } else if (projectId) {
            setChosen(projectId);
          }
        } catch { /* silent — the manual picker below handles it */ }
      } else if (projectId) {
        setChosen(projectId);
      }

      setStep("preview");
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("upload");
    }
  };

  const toggleExclude = (coNumber) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(coNumber)) next.delete(coNumber);
      else next.add(coNumber);
      return next;
    });
  };

  const runCommit = async () => {
    if (!parsed) return;
    if (!chosenProjectId) { setErr("Pick a project first."); return; }

    const kept = parsed.cos.filter((r) => !excluded.has(r.co_number));
    if (kept.length === 0) { setErr("Every row is excluded — nothing to import."); return; }

    setStep("committing"); setErr(null);
    try {
      // Dedup: get the CO numbers already on this project so a
      // re-run of the same CSV doesn't create duplicates.
      const { data: existing } = await supabase
        .from("change_orders")
        .select("co_number")
        .eq("project_id", chosenProjectId)
        .eq("is_deleted", false);
      const existingNums = new Set(
        (existing || [])
          .map((r) => String(r.co_number || "").replace(/[^\w\-#]/g, "").toLowerCase())
          .filter(Boolean),
      );

      const projLabel = projects.find((p) => p.id === chosenProjectId)?.name || projectName || null;
      const toInsert = [];
      let skipped = 0;
      for (const r of kept) {
        const coKey = String(r.co_number).replace(/[^\w\-#]/g, "").toLowerCase();
        if (existingNums.has(coKey)) { skipped++; continue; }
        // Normalize to the canonical "CO-NNN" format for display,
        // but only if the source was a bare number (Sage / Vista
        // often exports just "14"). If user already prefixed, keep.
        const displayNumber = /^\d+$/.test(r.co_number)
          ? `CO-${r.co_number.padStart(3, "0")}`
          : r.co_number;
        toInsert.push({
          project_id:           chosenProjectId,
          project_name:         projLabel,
          co_number:            displayNumber,
          title:                r.title || null,
          description:          r.description,
          reason_code:          r.reason_code,
          status:               r.status,
          co_amount:            r.co_amount,
          submitted_date:       r.submitted_date,
          approved_date:        r.approved_date,
          approved_by:          r.approved_by,
          notes:                r.notes,
          schedule_impact_days: r.schedule_impact_days,
          margin_percent:       r.margin_percent,
        });
      }

      let created = 0;
      for (const row of toInsert) {
        // eslint-disable-next-line no-await-in-loop
        await base44.entities.ChangeOrder.create(row);
        created += 1;
      }

      setLastResult({ created, skipped });
      toast.success(`${created} change order${created === 1 ? "" : "s"} imported${skipped ? `, ${skipped} skipped (already in project)` : ""}`);
      qc.invalidateQueries({ queryKey: ["cos-all"] });
      qc.invalidateQueries({ queryKey: ["change-orders"] });
      qc.invalidateQueries({ queryKey: ["change-orders", chosenProjectId] });
      onCreated?.({ created, skipped });
      setStep("done");
      setTimeout(() => { reset(); onClose(); }, 1500);
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("preview");
    }
  };

  const header = parsed?.header || {};
  const cos    = parsed?.cos || [];
  const keptCount = cos.length - excluded.size;
  const warnings = parsed?.warnings || [];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        tabIndex={-1}
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
                  type="file"
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
                  dedup on (project, co_number)
                </div>
              </div>
              <div style={{ border: "1px solid var(--border-default)", borderRadius: 2, maxHeight: 420, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)", zIndex: 1 }}>
                    <tr>
                      {["#", "Title", "Status", "Amount", "Submitted", "Approved", ""].map((h, i) => (
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
                    {cos.map((r) => {
                      const ex = excluded.has(r.co_number);
                      return (
                        <tr
                          key={r.co_number}
                          style={{
                            borderBottom: "1px solid var(--divider)",
                            opacity: ex ? 0.45 : 1,
                            textDecoration: ex ? "line-through" : "none",
                          }}
                        >
                          <Td mono accent>{r.co_number}</Td>
                          <Td>{r.title || <span style={{ color: "var(--text-muted)" }}>—</span>}</Td>
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
                              onClick={() => toggleExclude(r.co_number)}
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
                        .filter((r) => !excluded.has(r.co_number))
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
                IMPORT {keptCount}
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
    case "submitted":      return "var(--status-info, #3B82F6)";
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
