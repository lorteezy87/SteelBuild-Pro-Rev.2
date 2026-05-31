import React, { useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { logActivity } from "@/services/auditLogger";
import {
  buildPsrProjectPatch,
  formatPsrSummary,
  matchPsrToProject,
  readPsrSpreadsheetFile,
} from "@/lib/importPsrSpreadsheet";

const mono = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const AI = "var(--ai-accent, #22D3EE)";

export default function PsrSpreadsheetImportModal({
  open,
  projects = [],
  projectId = null,
  projectName = "",
  onClose,
  onImported,
}) {
  const qc = useQueryClient();
  const trapRef = useFocusTrap(open);
  const fileInput = useRef(null);

  const [step, setStep] = useState("upload");
  const [files, setFiles] = useState([]);
  const [imports, setImports] = useState([]);
  const [err, setErr] = useState("");
  const [lastResult, setLastResult] = useState(null);

  if (!open) return null;

  const reset = () => {
    setStep("upload");
    setFiles([]);
    setImports([]);
    setErr("");
    setLastResult(null);
  };

  const close = () => {
    if (step === "parsing" || step === "committing") return;
    reset();
    onClose?.();
  };

  const acceptFiles = (fileList) => {
    setErr("");
    const picked = Array.from(fileList || []);
    if (picked.length === 0) return;
    const accepted = [];
    const rejected = [];
    picked.forEach((file) => {
      if (!/\.(xls|xlsx|xlsm)$/i.test(file.name)) rejected.push(`${file.name} is not an Excel spreadsheet.`);
      else if (file.size > 16 * 1024 * 1024) rejected.push(`${file.name} exceeds 16 MB.`);
      else accepted.push(file);
    });
    setFiles(accepted);
    if (rejected.length > 0) setErr(rejected.join(" "));
  };

  const runParse = async () => {
    if (files.length === 0) return;
    setStep("parsing");
    setErr("");
    const parsedImports = [];

    for (const file of files) {
      try {
        const parsed = await readPsrSpreadsheetFile(file);
        const match = matchPsrToProject(parsed, projects);
        const fallbackProjectId = projectId || "";
        parsedImports.push({
          id: `${file.name}-${file.lastModified}-${file.size}`,
          fileName: file.name,
          parsed,
          match,
          chosenProjectId: match.project?.id || fallbackProjectId,
          include: true,
          applyHealthStatus: false,
          error: "",
        });
      } catch (error) {
        parsedImports.push({
          id: `${file.name}-${file.lastModified}-${file.size}`,
          fileName: file.name,
          parsed: null,
          match: null,
          chosenProjectId: projectId || "",
          include: false,
          applyHealthStatus: false,
          error: error?.message || String(error),
        });
      }
    }

    setImports(parsedImports);
    setStep("review");
  };

  const updateImport = (id, patch) => {
    setImports((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const runCommit = async () => {
    const approved = imports.filter((item) => item.include && item.parsed && item.chosenProjectId);
    if (approved.length === 0) {
      setErr("Select at least one parsed PSR and target project before applying updates.");
      return;
    }

    setStep("committing");
    setErr("");
    let updated = 0;
    const skipped = [];

    try {
      for (const item of approved) {
        const project = projects.find((p) => p.id === item.chosenProjectId);
        if (!project) {
          skipped.push(item.fileName);
          continue;
        }

        const patch = buildPsrProjectPatch(project, item.parsed, {
          applyHealthStatus: item.applyHealthStatus,
        });
        await entities.Project.update(project.id, patch);
        updated += 1;

        logActivity("project", "updated", { ...project, ...patch }, {
          projectId: project.id,
          projectName: project.name || projectName || "",
          description: `Imported SOL PSR from ${item.fileName}; ${formatPsrSummary(item.parsed)}${
            item.applyHealthStatus ? `; health -> ${item.parsed.proposed_health_status}` : ""
          }`,
        });
      }

      await qc.invalidateQueries({ queryKey: ["projects"] });
      setLastResult({ updated, skipped });
      toast.success(`${updated} PSR import${updated === 1 ? "" : "s"} applied`);
      onImported?.({ updated, skipped });
      setStep("done");
    } catch (error) {
      setErr(error?.message || String(error));
      setStep("review");
    }
  };

  const approvedCount = imports.filter((item) => item.include && item.parsed && item.chosenProjectId).length;
  const parsedCount = imports.filter((item) => item.parsed).length;

  return (
    <>
      <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200 }} />
      <div
        ref={trapRef}
        onKeyDown={(event) => { if (event.key === "Escape") close(); }}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 1060,
          maxWidth: "96vw",
          maxHeight: "92vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderLeft: `3px solid ${AI}`,
          borderRadius: 4,
          zIndex: 1201,
          outline: "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--divider)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              Import SOL PSR Spreadsheets
            </div>
            <div style={{ ...mono, fontSize: 9, color: AI, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload" && "STEP 1 - SELECT .XLS ATTACHMENTS"}
              {step === "parsing" && "STEP 2 - PARSING WORKBOOKS"}
              {step === "review" && `STEP 2 - REVIEW - ${approvedCount} READY`}
              {step === "committing" && "STEP 3 - APPLYING APPROVED UPDATES"}
              {step === "done" && "DONE"}
            </div>
          </div>
          <button
            onClick={close}
            disabled={step === "parsing" || step === "committing"}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {step === "upload" && (
            <div>
              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.currentTarget.style.background = `color-mix(in srgb, ${AI} 8%, transparent)`;
                }}
                onDragLeave={(event) => { event.currentTarget.style.background = "var(--bg-page)"; }}
                onDrop={(event) => {
                  event.preventDefault();
                  acceptFiles(event.dataTransfer.files);
                  event.currentTarget.style.background = "var(--bg-page)";
                }}
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
                  multiple
                  accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  style={{ display: "none" }}
                  onChange={(event) => acceptFiles(event.target.files)}
                />
                {files.length > 0 ? (
                  <div>
                    <FileSpreadsheet size={24} color={AI} style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 13, color: "var(--text-primary)" }}>
                      {files.length} file{files.length === 1 ? "" : "s"} selected
                    </div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                      {files.map((file) => file.name).join(" | ")}
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      Drop SOL PSR .xls attachments here
                    </div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                      Supports legacy Excel .xls from email attachments. Max 16 MB per file.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "parsing" && (
            <CenteredStatus icon={<Loader2 size={22} className="spin-icon" />} title="PARSING PSR WORKBOOKS..." />
          )}

          {step === "review" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {imports.map((item) => (
                <ImportReviewCard
                  key={item.id}
                  item={item}
                  projects={projects}
                  onChange={(patch) => updateImport(item.id, patch)}
                />
              ))}
            </div>
          )}

          {step === "committing" && (
            <CenteredStatus icon={<Loader2 size={22} className="spin-icon" />} title="APPLYING APPROVED PSR UPDATES..." />
          )}

          {step === "done" && (
            <CenteredStatus
              icon={<CheckCircle2 size={36} color="var(--status-success)" />}
              title="IMPORT COMPLETE"
              subtitle={`${lastResult?.updated || 0} project${lastResult?.updated === 1 ? "" : "s"} updated`}
            />
          )}

          {err && (
            <div style={{
              marginTop: 12,
              padding: "8px 12px",
              border: "1px solid var(--status-error)",
              background: "color-mix(in srgb, var(--status-error) 10%, transparent)",
              color: "var(--status-error)",
              ...mono,
              fontSize: 11,
            }}>
              {err}
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--divider)",
          display: "flex",
          gap: 10,
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {step === "review" && `${parsedCount} parsed - ${approvedCount} approved for write`}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {step === "upload" && (
              <>
                <button onClick={close} style={btnGhost}>CANCEL</button>
                <button
                  onClick={runParse}
                  disabled={files.length === 0}
                  style={{ ...btnPrimary, opacity: files.length > 0 ? 1 : 0.5, cursor: files.length > 0 ? "pointer" : "not-allowed" }}
                >
                  PARSE <ArrowRight size={12} style={{ marginLeft: 4, verticalAlign: "middle" }} />
                </button>
              </>
            )}
            {step === "review" && (
              <>
                <button onClick={() => { setImports([]); setStep("upload"); }} style={btnGhost}>BACK</button>
                <button
                  onClick={runCommit}
                  disabled={approvedCount === 0}
                  style={{ ...btnPrimary, opacity: approvedCount > 0 ? 1 : 0.5, cursor: approvedCount > 0 ? "pointer" : "not-allowed" }}
                >
                  APPLY {approvedCount} UPDATE{approvedCount === 1 ? "" : "S"}
                </button>
              </>
            )}
            {step === "done" && <button onClick={close} style={btnPrimary}>CLOSE</button>}
          </div>
        </div>
      </div>
      <style>{`
        .spin-icon { animation: spin 0.9s linear infinite; }
      `}</style>
    </>
  );
}

function ImportReviewCard({ item, projects, onChange }) {
  const parsed = item.parsed;
  const selectedProject = projects.find((project) => project.id === item.chosenProjectId);

  if (item.error) {
    return (
      <div style={cardStyle("var(--status-error)")}>
        <div style={{ ...mono, fontSize: 10, color: "var(--status-error)", fontWeight: 700 }}>
          {item.fileName}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6 }}>{item.error}</div>
      </div>
    );
  }

  const pendingDocs = parsed.coordination_docs.filter((doc) => doc.is_pending);
  const openRfis = parsed.rfis.filter((rfi) => rfi.is_open);
  const openQueries = parsed.queries.filter((query) => query.is_open);

  return (
    <div style={cardStyle(item.include ? AI : "var(--border-default)")}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={item.include}
            onChange={(event) => onChange({ include: event.target.checked })}
          />
          <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase" }}>Apply</span>
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {parsed.job_name || "Unnamed PSR"}
              </div>
              <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>
                {item.fileName} - sheet {parsed.sheet_name || "-"} - S&H #{parsed.job_number || "-"} - updated {parsed.last_updated || "-"}
              </div>
            </div>
            <HealthPill status={parsed.proposed_health_status} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginTop: 12 }}>
            <div style={{
              border: `1px solid ${item.match?.project ? "var(--status-success)" : "var(--status-warning)"}`,
              background: item.match?.project
                ? "color-mix(in srgb, var(--status-success) 6%, transparent)"
                : "color-mix(in srgb, var(--status-warning) 6%, transparent)",
              padding: "9px 10px",
              borderRadius: 4,
            }}>
              <div style={{ ...mono, fontSize: 8, color: item.match?.project ? "var(--status-success)" : "var(--status-warning)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>
                {item.match?.project ? "PROJECT MATCHED" : "PROJECT NEEDS REVIEW"}
              </div>
              <select
                value={item.chosenProjectId || ""}
                onChange={(event) => onChange({ chosenProjectId: event.target.value })}
                style={selectStyle}
              >
                <option value="">-- select project --</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_number ? `${project.project_number} - ` : ""}{project.name}
                  </option>
                ))}
              </select>
              {selectedProject && (
                <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 5 }}>
                  Current health: {selectedProject.health_status || "-"}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <Stat label="Open RFIs" value={parsed.counts.open_rfis} tone={parsed.counts.open_rfis ? "var(--status-error)" : "var(--status-success)"} />
              <Stat label="Pending Docs" value={parsed.counts.pending_coordination_docs} tone={parsed.counts.pending_coordination_docs ? "var(--status-warning)" : "var(--status-success)"} />
              <Stat label="Packages" value={parsed.counts.schedule_packages} />
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={item.applyHealthStatus}
              onChange={(event) => onChange({ applyHealthStatus: event.target.checked })}
            />
            <span style={{ ...mono, fontSize: 9, color: "var(--text-secondary)" }}>
              Apply recommended health status ({parsed.proposed_health_status})
            </span>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <PreviewList title="Pending Coordination Docs" rows={pendingDocs} empty="No pending coordination docs" render={(doc) => (
              <>
                <strong>{doc.title}</strong>
                <span> requested {doc.requested_date || "-"}{doc.comments ? ` - ${doc.comments}` : ""}</span>
              </>
            )} />
            <PreviewList title="Open RFIs / Queries" rows={[...openRfis, ...openQueries].slice(0, 8)} empty="No open RFI/query rows" render={(issue) => (
              <>
                <strong>{issue.number ? `#${issue.number}` : issue.source_text}</strong>
                <span> sent {issue.sent_date || "-"} - {issue.description}</span>
              </>
            )} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewList({ title, rows, empty, render }) {
  return (
    <div style={{ border: "1px solid var(--border-default)", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "6px 8px", background: "var(--bg-surface-low)" }}>
        {title} ({rows.length})
      </div>
      <div style={{ maxHeight: 160, overflowY: "auto" }}>
        {rows.length === 0 ? (
          <div style={{ padding: "10px 8px", fontSize: 11, color: "var(--text-muted)" }}>{empty}</div>
        ) : rows.map((row, index) => (
          <div key={`${title}-${index}`} style={{ padding: "7px 8px", borderTop: index ? "1px solid var(--divider)" : "none", fontSize: 11, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 2 }}>
            {render(row)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "var(--text-primary)" }) {
  return (
    <div style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ ...mono, fontSize: 18, color: tone, fontWeight: 700, marginTop: 3 }}>{value ?? 0}</div>
    </div>
  );
}

function HealthPill({ status }) {
  const color = status === "At Risk" ? "var(--status-error)" : status === "Watch" ? "var(--status-warning)" : "var(--status-success)";
  return (
    <span style={{
      ...mono,
      fontSize: 9,
      color,
      border: `1px solid ${color}`,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      borderRadius: 999,
      padding: "4px 9px",
      whiteSpace: "nowrap",
      fontWeight: 700,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    }}>
      {status || "Needs Review"}
    </span>
  );
}

function CenteredStatus({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: AI }}>{icon}</div>
      <div style={{ ...mono, fontSize: 12, color: "var(--text-primary)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
        {title}
      </div>
      {subtitle && <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>{subtitle}</div>}
    </div>
  );
}

function cardStyle(borderColor) {
  return {
    border: `1px solid ${borderColor}`,
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: 4,
    background: "var(--bg-surface)",
    padding: "12px 14px",
  };
}

const selectStyle = {
  width: "100%",
  padding: "6px 10px",
  fontSize: 12,
  background: "var(--bg-page)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
};

const btnPrimary = {
  padding: "8px 22px",
  background: AI,
  color: "#000",
  border: "none",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const btnGhost = {
  padding: "8px 18px",
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};
