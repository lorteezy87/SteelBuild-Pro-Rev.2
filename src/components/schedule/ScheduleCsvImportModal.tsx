/**
 * ScheduleCsvImportModal — bulk import schedule tasks from CSV.
 *
 * Mirrors RfiLogImportModal / ChangeOrderImportModal: upload → preview
 * (warnings + row table with removable rows) → commit. No AI. The commit
 * step reuses the shared MPP write path so parent links and predecessor
 * objects land the same way as an XML import.
 */
import { useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { X, Upload, FileText, CheckCircle2, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  downloadScheduleCsvTemplate,
  readScheduleCsvFile,
  type ParsedScheduleCsvTask,
} from "@/lib/importScheduleCsv";
import { commitImportedScheduleTasks } from "@/pages/schedule/commitImportedTasks";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import type { ScheduleTask } from "@/pages/schedule/types";

const mono = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };
const ACCENT = "var(--accent, var(--status-info))";

type Step = "upload" | "parsing" | "preview" | "committing" | "done";

export interface ScheduleCsvImportModalProps {
  open: boolean;
  projectId: string | null | undefined;
  projectName?: string;
  existingTasks?: ScheduleTask[];
  onClose: () => void;
  onImported?: (created: number) => void;
}

export default function ScheduleCsvImportModal({
  open,
  projectId,
  projectName,
  existingTasks = [],
  onClose,
  onImported,
}: ScheduleCsvImportModalProps) {
  const qc = useQueryClient();
  const trapRef = useFocusTrap(open);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [tasks, setTasks] = useState<ParsedScheduleCsvTask[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skippedBlankRows, setSkippedBlankRows] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [createdCount, setCreatedCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const reset = () => {
    setStep("upload");
    setFile(null);
    setTasks([]);
    setWarnings([]);
    setSkippedBlankRows(0);
    setExcluded(new Set());
    setCreatedCount(0);
    setErr(null);
  };

  const acceptFile = (f: File | undefined | null) => {
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
    setStep("parsing");
    setErr(null);
    try {
      const res = await readScheduleCsvFile(file);
      if (!res.tasks.length) {
        const detail = res.warnings?.length ? ` ${res.warnings.join(" ")}` : "";
        throw new Error(`No schedule rows found in the CSV.${detail}`);
      }
      setTasks(res.tasks);
      setWarnings(res.warnings || []);
      setSkippedBlankRows(res.skippedBlankRows || 0);
      setExcluded(new Set());
      setStep("preview");
    } catch (e: unknown) {
      setErr(toUserErrorMessage(e, String(e)));
      setStep("upload");
    }
  };

  const toggleExclude = (uid: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const runCommit = async () => {
    if (!projectId) {
      setErr("Select a project before importing.");
      return;
    }
    const kept = tasks.filter((t) => !excluded.has(t.uid));
    if (kept.length === 0) {
      setErr("Every row is excluded — nothing to import.");
      return;
    }
    setStep("committing");
    setErr(null);
    try {
      const result = await commitImportedScheduleTasks({
        tasks: kept,
        projectId,
        qc,
        generateMissingWbs: true,
        existingTasks,
      });
      setCreatedCount(result.created);
      toast.success(`Imported ${result.created} task${result.created === 1 ? "" : "s"} from ${file?.name || "CSV"}`);
      onImported?.(result.created);
      setStep("done");
      setTimeout(() => {
        reset();
        onClose();
      }, 1400);
    } catch (e: unknown) {
      setErr(toUserErrorMessage(e, "Import failed"));
      setStep("preview");
    }
  };

  const keptCount = tasks.filter((t) => !excluded.has(t.uid)).length;

  return (
    <>
      <div
        onClick={() => { if (step !== "committing") onClose(); }}
        style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg-base) 65%, transparent)", zIndex: 1200 }}
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Import schedule CSV"
        onKeyDown={(e) => { if (e.key === "Escape" && step !== "committing") onClose(); }}
        style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 920, maxWidth: "96vw", maxHeight: "92vh",
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--border-default)",
          borderLeft: `3px solid ${ACCENT}`,
          borderRadius: 4,
          zIndex: 1201, outline: "none",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--divider)",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...display, fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
              Import Schedule CSV
            </div>
            <div style={{ ...mono, fontSize: 9, color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 2 }}>
              {step === "upload" && "STEP 1 · UPLOAD"}
              {step === "parsing" && "STEP 2 · PARSING"}
              {step === "preview" && "STEP 2 · REVIEW"}
              {step === "committing" && "STEP 3 · IMPORTING"}
              {step === "done" && "DONE"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={step === "committing"}
            aria-label="Close"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {err && (
            <div style={{
              border: "1px solid var(--status-danger)",
              background: "color-mix(in srgb, var(--status-danger) 8%, transparent)",
              color: "var(--text-primary)",
              padding: "10px 12px", marginBottom: 14, borderRadius: 4,
              ...mono, fontSize: 11,
            }}>
              {err}
            </div>
          )}

          {step === "upload" && (
            <div>
              <div
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.background = `color-mix(in srgb, ${ACCENT} 8%, transparent)`;
                }}
                onDragLeave={(e) => { e.currentTarget.style.background = "var(--bg-page)"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  acceptFile(e.dataTransfer.files?.[0]);
                  e.currentTarget.style.background = "var(--bg-page)";
                }}
                style={{
                  border: `1px dashed ${ACCENT}`,
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
                  accept=".csv,.tsv,.txt,text/csv,application/csv,text/plain"
                  style={{ display: "none" }}
                  aria-label="Choose schedule CSV file"
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />
                {file ? (
                  <div>
                    <FileText size={24} color={ACCENT} style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 13, color: "var(--text-primary)" }}>{file.name}</div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                      {(file.size / 1e6).toFixed(1)} MB — click to replace
                    </div>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} color="var(--text-muted)" style={{ marginBottom: 8 }} />
                    <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
                      Drop schedule CSV here
                    </div>
                    <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                      Export from MS Project, P6, or Excel. Parsed locally — no AI needed.
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={downloadScheduleCsvTemplate}
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    color: ACCENT, ...mono, fontSize: 11, textDecoration: "underline",
                    padding: 0,
                  }}
                >
                  Download CSV template
                </button>
                {projectName && (
                  <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
                    Importing into {projectName}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "parsing" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <div style={{ ...mono, fontSize: 12, color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                ● READING CSV…
              </div>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                Parsing locally — should be instant.
              </div>
            </div>
          )}

          {step === "preview" && (
            <div>
              {warnings.length > 0 && (
                <div style={{
                  border: "1px solid var(--status-warning)",
                  background: "color-mix(in srgb, var(--status-warning) 8%, transparent)",
                  padding: "10px 12px", marginBottom: 12, borderRadius: 4,
                  ...mono, fontSize: 11, color: "var(--text-primary)",
                }}>
                  {warnings.map((w) => <div key={w}>{w}</div>)}
                </div>
              )}
              <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                {keptCount} of {tasks.length} row{tasks.length === 1 ? "" : "s"} will import
                {skippedBlankRows ? ` · ${skippedBlankRows} blank row${skippedBlankRows === 1 ? "" : "s"} skipped` : ""}
                . Uncheck a row to exclude it.
              </div>
              <div style={{ overflowX: "auto", border: "1px solid var(--border-default)", borderRadius: 4 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", ...mono, fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-page)", color: "var(--text-muted)", textAlign: "left" }}>
                      <th style={{ padding: "8px 10px", width: 36 }} />
                      <th style={{ padding: "8px 10px" }}>WBS</th>
                      <th style={{ padding: "8px 10px" }}>Task</th>
                      <th style={{ padding: "8px 10px" }}>Phase</th>
                      <th style={{ padding: "8px 10px" }}>Start</th>
                      <th style={{ padding: "8px 10px" }}>Finish</th>
                      <th style={{ padding: "8px 10px" }}>Dur</th>
                      <th style={{ padding: "8px 10px" }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => {
                      const off = excluded.has(t.uid);
                      return (
                        <tr
                          key={t.uid}
                          style={{
                            borderTop: "1px solid var(--divider)",
                            opacity: off ? 0.45 : 1,
                            color: "var(--text-primary)",
                          }}
                        >
                          <td style={{ padding: "6px 10px" }}>
                            <input
                              type="checkbox"
                              checked={!off}
                              onChange={() => toggleExclude(t.uid)}
                              aria-label={`Include ${t.name}`}
                            />
                          </td>
                          <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{t.outlineNumber || "—"}</td>
                          <td style={{ padding: "6px 10px" }}>
                            {t.isSummary ? <strong>{t.name}</strong> : t.name}
                            {t.milestone ? " · milestone" : ""}
                          </td>
                          <td style={{ padding: "6px 10px" }}>{t.phaseHint || "—"}</td>
                          <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{t.start || "TBD"}</td>
                          <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{t.finish || "TBD"}</td>
                          <td style={{ padding: "6px 10px" }}>{t.durationDays ?? "—"}</td>
                          <td style={{ padding: "6px 10px" }}>{t.pct}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === "committing" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <div style={{ ...mono, fontSize: 12, color: ACCENT, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                ● IMPORTING TASKS…
              </div>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                Creating {keptCount} task{keptCount === 1 ? "" : "s"} and linking predecessors.
              </div>
            </div>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", padding: "48px 20px" }}>
              <CheckCircle2 size={28} color="var(--status-success)" />
              <div style={{ ...display, fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginTop: 10 }}>
                Imported {createdCount} task{createdCount === 1 ? "" : "s"}
              </div>
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 20px", borderTop: "1px solid var(--divider)",
          display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0,
        }}>
          {step === "upload" && (
            <button
              type="button"
              disabled={!file}
              onClick={() => { void runParse(); }}
              className="cmd-btn cmd-btn--primary"
            >
              Review <ArrowRight size={14} />
            </button>
          )}
          {step === "preview" && (
            <>
              <button type="button" className="cmd-btn cmd-btn--ghost" onClick={reset}>
                Back
              </button>
              <button
                type="button"
                className="cmd-btn cmd-btn--primary"
                disabled={keptCount === 0}
                onClick={() => { void runCommit(); }}
              >
                Import {keptCount} task{keptCount === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
