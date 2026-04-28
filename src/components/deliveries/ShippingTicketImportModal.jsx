import React, { useRef, useState } from "react";
import { X, Upload, FileText, CheckCircle2, ArrowRight } from "lucide-react";
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
 * Three-step wizard for importing a Tekla/fab-shop shipping ticket PDF:
 *   1. Upload — drag/drop the PDF, quick client-side size check.
 *   2. Extract — gpt-4o-mini reads it via tool_use; shows a preview of
 *      the matched project, load header, and every line item.
 *   3. Confirm — user picks/overrides the project link and hits Create.
 *      One deliveries row + N delivery_items rows are written atomically
 *      (the items step is rolled back if it fails, so no orphan parent).
 *
 * Plain fixed overlay (no Radix Dialog), no <form> tag — consistent with
 * the Drawing Analysis modals so the app keeps one consistent modal
 * pattern.
 */
export default function ShippingTicketImportModal({ open, projectId, projectName, projects = [], onClose, onCreated }) {
  const qc = useQueryClient();
  const fileInput = useRef(null);

  const [step, setStep]             = useState("upload"); // upload | extracting | preview | committing | done
  const [file, setFile]             = useState(null);
  const [uploaded, setUploaded]     = useState(null);      // { file_url, storage_path, file_name }
  const [parsed, setParsed]         = useState(null);      // { header, items, raw }
  const [matchedProject, setMatched]= useState(null);      // row from projects
  const [chosenProjectId, setChosen]= useState(projectId || null);
  const [err, setErr]               = useState(null);

  if (!open) return null;

  const reset = () => {
    setStep("upload"); setFile(null); setUploaded(null); setParsed(null);
    setMatched(null); setChosen(projectId || null); setErr(null);
  };

  const acceptFile = (f) => {
    setErr(null);
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
      setErr("File must be a PDF.");
      return;
    }
    if (f.size > 32 * 1024 * 1024) {
      setErr("PDF exceeds 32 MB limit.");
      return;
    }
    setFile(f);
  };

  const runExtract = async () => {
    if (!file) return;
    setStep("extracting"); setErr(null);
    try {
      const up = await uploadShippingTicket(file);
      setUploaded(up);
      const res = await extractShippingTicket(up);
      setParsed(res);
      const match = await resolveProjectForTicket(res.header?.job_number);
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
    if (!parsed || !uploaded) return;
    if (!chosenProjectId) { setErr("Pick a project before creating."); return; }
    setStep("committing"); setErr(null);
    try {
      const project = projects.find(p => p.id === chosenProjectId);
      await commitShippingTicket({
        header: parsed.header,
        items:  parsed.items,
        projectId:   chosenProjectId,
        projectName: project?.name || projectName || null,
        file_url:     uploaded.file_url,
        storage_path: uploaded.storage_path,
        file_name:    uploaded.file_name,
      });
      toast.success(`Load ${parsed.header?.load_number || "—"} imported (${parsed.items.length} items)`);
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["delivery_items"] });
      setStep("done");
      onCreated?.();
      setTimeout(() => { reset(); onClose(); }, 900);
    } catch (e) {
      setErr(e?.message || String(e));
      setStep("preview");
    }
  };

  const header = parsed?.header || {};
  const items  = parsed?.items  || [];
  const totalWeight = items.reduce((s, i) => s + (Number(i.weight_lbs) || 0), 0);
  const totalQty    = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        tabIndex={-1}
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
              Import Shipping Ticket
            </div>
            <div style={{ ...mono, fontSize: 9, color: AI, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload"     && "STEP 1 · UPLOAD"}
              {step === "extracting" && "STEP 2 · EXTRACTING"}
              {step === "preview"    && "STEP 2 · REVIEW"}
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
                  accept="application/pdf,.pdf"
                  style={{ display: "none" }}
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />
                {file ? (
                  <div>
                    <FileText size={24} color={AI} style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 13, color: "var(--text-primary)" }}>{file.name}</div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                      {(file.size / 1e6).toFixed(1)} MB — click to replace
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      Drop shipping ticket PDF here
                    </div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                      Fab shop / Tekla load list. Max 32 MB.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "extracting" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <div style={{ ...mono, fontSize: 12, color: AI, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                ● READING TICKET…
              </div>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                gpt-4o-mini pulls the load header + every line. Usually 5–15 seconds.
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
                  Ticket job: {header.job_number ? <strong>{header.job_number}</strong> : "—"}
                  {header.job_name ? ` · ${header.job_name}` : ""}
                </div>
              </div>

              {/* Header summary */}
              <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                LOAD HEADER
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 14 }}>
                <Stat label="Load #"       value={header.load_number ?? "—"} />
                <Stat label="Date"         value={header.date_shipped ?? "—"} />
                <Stat label="Trailer"      value={header.trailer ?? "—"} />
                <Stat label="Assy Qty"     value={header.assembly_quantity ?? totalQty} />
                <Stat label="Load (lbs)"   value={fmtLbs(header.weight_loaded_lbs)} />
                <Stat label="Capacity"     value={fmtLbs(header.capacity_lbs)} />
              </div>

              {/* Line items */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ ...mono, fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  LINE ITEMS ({items.length})
                </div>
                <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                  ∑ qty {totalQty} · ∑ weight {fmtLbs(totalWeight)}
                </div>
              </div>
              <div style={{ border: "1px solid var(--border-default)", borderRadius: 2, maxHeight: 360, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-surface-secondary)" }}>
                    <tr>
                      {["Qty","Mark","Seq","Profile","Length","Grade","Finish","Weight"].map(h => (
                        <th key={h} style={{
                          ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                          color: "var(--text-muted)", padding: "6px 8px", textAlign: "left",
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
                        <Td mono>{it.sequence}</Td>
                        <Td>{it.profile}</Td>
                        <Td mono>{it.length_text}</Td>
                        <Td>{it.grade}</Td>
                        <Td>{it.finish}</Td>
                        <Td mono right>{fmtLbs(it.weight_lbs)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "committing" && (
            <div style={{ textAlign: "center", padding: "48px 20px", ...mono, fontSize: 12, color: AI }}>
              ● CREATING DELIVERY…
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
              <button onClick={runCommit} disabled={!chosenProjectId || items.length === 0}
                      style={{ ...btnPrimary, opacity: (!chosenProjectId || items.length === 0) ? 0.5 : 1 }}>
                CREATE DELIVERY
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function Td({ children, mono: isMono, accent, right }) {
  return (
    <td style={{
      padding: "5px 8px",
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
