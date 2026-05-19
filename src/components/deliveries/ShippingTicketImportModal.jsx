import React, { useRef, useState, useCallback } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { X, Upload, FileText, CheckCircle2, ArrowRight, Trash2, ChevronDown, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  uploadShippingTicket,
  extractShippingTicket,
  resolveProjectForTicket,
  commitShippingTicket,
} from "@/lib/importShippingTicket";

const mono    = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const AI      = "var(--ai-accent, #22D3EE)";

/**
 * Multi-file shipping ticket import wizard:
 *   1. Upload — drag/drop one or many PDFs.
 *   2. Extract — AI reads each ticket in parallel; shows per-file progress.
 *   3. Review — collapsible preview of every extracted ticket.
 *   4. Confirm — batch-create all deliveries.
 */
export default function ShippingTicketImportModal({ open, projectId, projectName, projects = [], onClose, onCreated }) {
  const qc = useQueryClient();
  const trapRef = useFocusTrap(open);
  const fileInput = useRef(null);

  // step: upload | extracting | preview | committing | done
  const [step, setStep]         = useState("upload");
  const [files, setFiles]       = useState([]);       // File[]
  const [tickets, setTickets]   = useState([]);       // per-ticket results
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [err, setErr]           = useState(null);

  // Each ticket: { file, uploaded, parsed, matchedProject, chosenProjectId, error, expanded }

  if (!open) return null;

  const reset = () => {
    setStep("upload"); setFiles([]); setTickets([]);
    setProgress({ done: 0, total: 0 }); setErr(null);
  };

  const validateFile = (f) => {
    if (!f) return null;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return "not a PDF";
    if (f.size > 32 * 1024 * 1024) return "exceeds 32 MB";
    return null;
  };

  const acceptFiles = useCallback((fileList) => {
    setErr(null);
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    const valid = [];
    const rejected = [];
    for (const f of incoming) {
      const reason = validateFile(f);
      if (reason) rejected.push(`${f.name}: ${reason}`);
      else valid.push(f);
    }
    if (rejected.length > 0) {
      setErr(`Skipped ${rejected.length}: ${rejected.slice(0, 3).join("; ")}${rejected.length > 3 ? "…" : ""}`);
    }
    setFiles(prev => {
      // Dedupe by name+size
      const existing = new Set(prev.map(f => `${f.name}|${f.size}`));
      const newFiles = valid.filter(f => !existing.has(`${f.name}|${f.size}`));
      return [...prev, ...newFiles];
    });
  }, []);

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const runExtractAll = async () => {
    if (files.length === 0) return;
    setStep("extracting"); setErr(null);
    setProgress({ done: 0, total: files.length });

    const results = [];
    // Process sequentially to avoid hammering the LLM proxy with too many
    // concurrent PDF uploads. Each ticket is ~5-15s, and sequential is
    // more predictable for the user watching the progress bar.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const uploaded = await uploadShippingTicket(file);
        const parsed = await extractShippingTicket(uploaded);
        const match = await resolveProjectForTicket(parsed.header?.job_number);
        results.push({
          file,
          uploaded,
          parsed,
          matchedProject: match || null,
          chosenProjectId: match?.id || projectId || null,
          error: null,
          expanded: files.length <= 3, // auto-expand if small batch
        });
      } catch (e) {
        results.push({
          file,
          uploaded: null,
          parsed: null,
          matchedProject: null,
          chosenProjectId: projectId || null,
          error: e?.message || String(e),
          expanded: true,
        });
      }
      setProgress({ done: i + 1, total: files.length });
    }

    setTickets(results);
    const successCount = results.filter(r => !r.error).length;
    if (successCount === 0) {
      setErr("All tickets failed extraction. Check the files and try again.");
      setStep("upload");
    } else {
      setStep("preview");
    }
  };

  const removeTicket = (idx) => {
    setTickets(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleExpand = (idx) => {
    setTickets(prev => prev.map((t, i) => i === idx ? { ...t, expanded: !t.expanded } : t));
  };

  const setTicketProject = (idx, pid) => {
    setTickets(prev => prev.map((t, i) => i === idx ? { ...t, chosenProjectId: pid } : t));
  };

  const committable = tickets.filter(t => !t.error && t.parsed && t.chosenProjectId);

  const runCommitAll = async () => {
    if (committable.length === 0) return;
    setStep("committing"); setErr(null);
    let successCount = 0;
    let failCount = 0;

    for (const ticket of committable) {
      try {
        const project = projects.find(p => p.id === ticket.chosenProjectId);
        await commitShippingTicket({
          header: ticket.parsed.header,
          items:  ticket.parsed.items,
          projectId:   ticket.chosenProjectId,
          projectName: project?.name || projectName || null,
          file_url:     ticket.uploaded.file_url,
          storage_path: ticket.uploaded.storage_path,
          file_name:    ticket.uploaded.file_name,
        });
        successCount++;
      } catch (e) {
        failCount++;
        console.error(`[ShippingTicketImport] commit failed for ${ticket.file?.name}:`, e);
      }
    }

    qc.invalidateQueries({ queryKey: ["deliveries"] });
    qc.invalidateQueries({ queryKey: ["delivery_items"] });

    if (failCount > 0) {
      toast.warning(`${successCount} imported, ${failCount} failed`, { position: "top-right", duration: 4000 });
    } else {
      toast.success(`${successCount} delivery ticket${successCount !== 1 ? "s" : ""} imported`, { position: "top-right", duration: 3000 });
    }
    setStep("done");
    onCreated?.();
    setTimeout(() => { reset(); onClose(); }, 1200);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        ref={trapRef}
        onKeyDown={(e) => { if (e.key === "Escape" && step !== "committing") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 920, maxWidth: "96vw", maxHeight: "92vh",
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
              Import Shipping Tickets
            </div>
            <div style={{ ...mono, fontSize: 9, color: AI, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload"     && `STEP 1 · UPLOAD ${files.length > 0 ? `(${files.length} FILE${files.length !== 1 ? "S" : ""})` : ""}`}
              {step === "extracting" && `STEP 2 · EXTRACTING ${progress.done}/${progress.total}`}
              {step === "preview"    && `STEP 2 · REVIEW (${committable.length} READY)`}
              {step === "committing" && "STEP 3 · CREATING"}
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
                onDrop={(e) => { e.preventDefault(); acceptFiles(e.dataTransfer.files); e.currentTarget.style.background = "var(--bg-page)"; }}
                style={{
                  border: `1px dashed ${AI}`,
                  borderRadius: 4,
                  padding: "28px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: "var(--bg-page)",
                }}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => { acceptFiles(e.target.files); e.target.value = ""; }}
                />
                <Upload size={24} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  Drop shipping ticket PDFs here
                </div>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                  Select one or many. Fab shop / Tekla load lists. Max 32 MB each.
                </div>
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                    {files.length} FILE{files.length !== 1 ? "S" : ""} QUEUED
                  </div>
                  {files.map((f, i) => (
                    <div key={`${f.name}-${i}`} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 10px", marginBottom: 2,
                      background: "var(--bg-page)", borderRadius: 2,
                      border: "1px solid var(--border-default)",
                    }}>
                      <FileText size={14} color={AI} />
                      <div style={{ flex: 1, ...mono, fontSize: 12, color: "var(--text-primary)" }}>
                        {f.name}
                      </div>
                      <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                        {(f.size / 1e6).toFixed(1)} MB
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2 }}
                        aria-label="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "extracting" && (
            <div style={{ padding: "32px 20px" }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <Loader2 size={24} color={AI} style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                <div style={{ ...mono, fontSize: 12, color: AI, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  READING TICKETS… {progress.done}/{progress.total}
                </div>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                  AI extracts the load header + every line item from each PDF.
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                  background: AI,
                  borderRadius: 2,
                  transition: "width 0.4s ease",
                }} />
              </div>
              {/* File status list */}
              <div style={{ marginTop: 14 }}>
                {files.map((f, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "4px 0", ...mono, fontSize: 11,
                  }}>
                    {i < progress.done ? (
                      <CheckCircle2 size={12} color="var(--status-success)" />
                    ) : i === progress.done ? (
                      <Loader2 size={12} color={AI} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1px solid var(--border-default)" }} />
                    )}
                    <span style={{ color: i <= progress.done ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {f.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === "preview" && tickets.length > 0 && (
            <div>
              {tickets.map((ticket, idx) => (
                <TicketPreviewCard
                  key={idx}
                  ticket={ticket}
                  index={idx}
                  projects={projects}
                  onToggle={() => toggleExpand(idx)}
                  onRemove={() => removeTicket(idx)}
                  onProjectChange={(pid) => setTicketProject(idx, pid)}
                />
              ))}
            </div>
          )}

          {step === "committing" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <Loader2 size={24} color={AI} style={{ animation: "spin 1s linear infinite", marginBottom: 10 }} />
              <div style={{ ...mono, fontSize: 12, color: AI, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                CREATING {committable.length} DELIVER{committable.length !== 1 ? "IES" : "Y"}…
              </div>
            </div>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <CheckCircle2 size={36} color="var(--status-success)" style={{ marginBottom: 10 }} />
              <div style={{ ...mono, fontSize: 12, color: "var(--status-success)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                IMPORT COMPLETE
              </div>
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
          display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", flexShrink: 0,
        }}>
          {step === "upload" && (
            <>
              <button onClick={onClose} style={btnGhost}>CANCEL</button>
              <button onClick={runExtractAll} disabled={files.length === 0}
                      style={{ ...btnPrimary, opacity: files.length > 0 ? 1 : 0.5, cursor: files.length > 0 ? "pointer" : "not-allowed" }}>
                EXTRACT {files.length > 1 ? `(${files.length})` : ""} <ArrowRight size={12} style={{ marginLeft: 4, verticalAlign: "middle" }} />
              </button>
            </>
          )}
          {step === "preview" && (
            <>
              <div style={{ flex: 1, ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                {committable.length} of {tickets.length} ready
                {tickets.some(t => t.error) && ` · ${tickets.filter(t => t.error).length} failed`}
              </div>
              <button onClick={() => { setTickets([]); setStep("upload"); }} style={btnGhost}>
                BACK
              </button>
              <button onClick={runCommitAll} disabled={committable.length === 0}
                      style={{ ...btnPrimary, opacity: committable.length > 0 ? 1 : 0.5 }}>
                CREATE {committable.length > 1 ? `${committable.length} ` : ""}DELIVER{committable.length !== 1 ? "IES" : "Y"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

/* ─── Per-ticket collapsible card ─────────────────────────────────── */

function TicketPreviewCard({ ticket, index, projects, onToggle, onRemove, onProjectChange }) {
  const { file, parsed, matchedProject, chosenProjectId, error, expanded } = ticket;
  const header = parsed?.header || {};
  const items  = parsed?.items  || [];
  const totalWeight = items.reduce((s, i) => s + (Number(i.weight_lbs) || 0), 0);
  const totalQty    = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  return (
    <div style={{
      border: `1px solid ${error ? "var(--status-error)" : "var(--border-default)"}`,
      borderRadius: 4,
      marginBottom: 8,
      background: error ? "color-mix(in srgb, var(--status-error) 4%, transparent)" : "transparent",
    }}>
      {/* Collapsed header row */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", cursor: "pointer",
        }}
      >
        {expanded
          ? <ChevronDown size={14} color="var(--text-muted)" />
          : <ChevronRight size={14} color="var(--text-muted)" />
        }
        {error
          ? <AlertCircle size={14} color="var(--status-error)" />
          : <FileText size={14} color={AI} />
        }
        <div style={{ flex: 1, ...mono, fontSize: 12, color: "var(--text-primary)" }}>
          {error ? file?.name : `Load ${header.load_number || "?"} — ${file?.name}`}
        </div>
        {!error && (
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
            {items.length} items · {fmtLbs(totalWeight)}
          </div>
        )}
        {error && (
          <div style={{ ...mono, fontSize: 10, color: "var(--status-error)" }}>
            FAILED
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2 }}
          aria-label="Remove ticket"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 12px 12px 34px" }}>
          {error ? (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-error)", lineHeight: 1.5 }}>
              {error}
            </div>
          ) : (
            <>
              {/* Project match */}
              <div style={{
                border: `1px solid ${matchedProject ? "var(--status-success)" : "var(--status-warning)"}`,
                background: matchedProject ? "color-mix(in srgb, var(--status-success) 6%, transparent)" : "color-mix(in srgb, var(--status-warning) 6%, transparent)",
                padding: "8px 10px", marginBottom: 10, borderRadius: 3,
              }}>
                <div style={{ ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                              color: matchedProject ? "var(--status-success)" : "var(--status-warning)", marginBottom: 3 }}>
                  {matchedProject ? "PROJECT MATCHED" : "NO MATCH — PICK A PROJECT"}
                </div>
                {matchedProject ? (
                  <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                    <span style={{ ...mono, color: "var(--accent)", marginRight: 6 }}>{matchedProject.project_number}</span>
                    {matchedProject.name}
                  </div>
                ) : (
                  <select
                    value={chosenProjectId || ""}
                    onChange={(e) => onProjectChange(e.target.value)}
                    style={{
                      width: "100%", padding: "4px 8px", fontSize: 11,
                      background: "#161B22", border: "1px solid var(--border-default)", borderRadius: 2,
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
                <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", marginTop: 3 }}>
                  Ticket job: {header.job_number ? <strong>{header.job_number}</strong> : "—"}
                  {header.job_name ? ` · ${header.job_name}` : ""}
                </div>
              </div>

              {/* Header stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 10 }}>
                <Stat label="Load #"     value={header.load_number ?? "—"} />
                <Stat label="Date"       value={header.date_shipped ?? "—"} />
                <Stat label="Trailer"    value={header.trailer ?? "—"} />
                <Stat label="Assy Qty"   value={header.assembly_quantity ?? totalQty} />
                <Stat label="Load (lbs)" value={fmtLbs(header.weight_loaded_lbs)} />
                <Stat label="Capacity"   value={fmtLbs(header.capacity_lbs)} />
              </div>

              {/* Line items (compact) */}
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                LINE ITEMS ({items.length}) · ∑ qty {totalQty} · ∑ weight {fmtLbs(totalWeight)}
              </div>
              <div style={{ border: "1px solid var(--border-default)", borderRadius: 2, maxHeight: 200, overflowY: "auto" }}>
                <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)" }}>
                    <tr>
                      {["Qty","Mark","Profile","Length","Grade","Weight"].map(h => (
                        <th key={h} style={{
                          ...mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                          color: "var(--text-muted)", padding: "4px 6px", textAlign: "left",
                          borderBottom: "1px solid var(--divider)", whiteSpace: "nowrap",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--divider)" }}>
                        <Td mono>{it.qty}</Td>
                        <Td mono accent>{it.assembly_mark}</Td>
                        <Td>{it.profile}</Td>
                        <Td mono>{it.length_text}</Td>
                        <Td>{it.grade}</Td>
                        <Td mono right>{fmtLbs(it.weight_lbs)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Shared UI atoms ─────────────────────────────────────────────── */

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: 7, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function Td({ children, mono: isMono, accent, right }) {
  return (
    <td style={{
      padding: "3px 6px",
      fontFamily: isMono ? "var(--font-mono)" : "var(--font-body)",
      color: accent ? "var(--accent)" : "var(--text-primary)",
      textAlign: right ? "right" : "left",
      whiteSpace: "nowrap",
    }}>
      {children ?? "—"}
    </td>
  );
}

function fmtLbs(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString()}#`;
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
