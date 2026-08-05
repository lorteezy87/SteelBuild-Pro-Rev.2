/**
 * Import workspace: stage CSV/JSON, review batches, approve/apply.
 * Presentational extract from PieceRegister.tsx (behavior-preserving).
 */
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
} from "lucide-react";
import { DecisionPanel, Pill, type PillTone } from "@/components/command";
import {
  PIECE_IMPORT_SOURCE_OPTIONS,
} from "@/lib/pieceControl/importAdapters";
import type { ImportPayload, PieceImportSourceType } from "@/lib/pieceControl/reconciliation";
import { downloadPieceRegisterCsvTemplate } from "@/lib/pieceControl/pieceRegisterCsvTemplate";
import { presentImportReconciliationText } from "./registerHelpers";

export type PieceRegisterImportViewProps = {
  sourceType: PieceImportSourceType;
  setSourceType: (v: PieceImportSourceType) => void;
  importFile: File | null;
  importRows: ImportPayload[];
  handleFile: (file: File | null) => void;
  stagePending: boolean;
  onStage: () => void;
  batches: Array<{
    id: string;
    source_name?: string | null;
    source_type: string;
    status: string;
    row_count: number;
    created_at: string;
    decision_counts?: Record<string, number> | null;
  }>;
  selectedBatch: {
    id: string;
    source_name?: string | null;
    source_type: string;
    status: string;
    decision_counts?: Record<string, number> | null;
  } | null;
  setSelectedBatchId: (id: string) => void;
  setApplyConfirmed: (v: boolean) => void;
  applyConfirmed: boolean;
  approvePending: boolean;
  onApprove: () => void;
  applyPending: boolean;
  onApply: () => void;
  importTargetWorkPackageId: string;
  setImportTargetWorkPackageId: (id: string) => void;
  workPackages: Array<{ id: string; wp_number?: string | null; name?: string | null }>;
  formatWorkPackageTitle: (wp: { id: string; wp_number?: string | null; name?: string | null }) => string;
  batchRows: Array<{
    id: string;
    source_row_number: number;
    normalized_payload: Record<string, unknown>;
    decision: string;
    warnings: string[];
    resolution?: string | null;
  }>;
  decisionTone: Record<string, PillTone>;
  assignPending: boolean;
  onAssignImport: () => void;
};

export function PieceRegisterImportView(props: PieceRegisterImportViewProps) {
  const {
    sourceType,
    setSourceType,
    importFile,
    importRows,
    handleFile,
    stagePending,
    onStage,
    batches,
    selectedBatch,
    setSelectedBatchId,
    setApplyConfirmed,
    applyConfirmed,
    approvePending,
    onApprove,
    applyPending,
    onApply,
    importTargetWorkPackageId,
    setImportTargetWorkPackageId,
    workPackages,
    formatWorkPackageTitle,
    batchRows,
    decisionTone,
    assignPending,
    onAssignImport,
  } = props;

  return (
<section className="piece-register-embedded-workspace piece-import-workspace">
            <DecisionPanel title="Stage import">
              <div className="piece-command-intro">
                <span className="piece-command-intro__icon" aria-hidden="true">
                  <FileUp size={18} />
                </span>
                <p>
                  Download the standard CSV template, fill piece marks / WP / drawing sheet
                  in one file, then stage for review. Staging makes no direct changes to the
                  active register.
                </p>
              </div>
              <div className="piece-command-form">
                <button
                  type="button"
                  className="cmd-btn cmd-btn--ghost"
                  onClick={() => downloadPieceRegisterCsvTemplate()}
                >
                  <Download size={14} aria-hidden="true" />
                  {" "}Download CSV template
                </button>
                <label htmlFor="piece-import-source" className="piece-command-field">
                  Source
                  <select
                    id="piece-import-source"
                    value={sourceType}
                    onChange={(event) => setSourceType(event.target.value as PieceImportSourceType)}
                    className="piece-command-control"
                  >
                    {PIECE_IMPORT_SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label htmlFor="piece-import-file" className="piece-command-field">
                  File
                  <input
                    id="piece-import-file"
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                    className="piece-command-control piece-command-control--file"
                  />
                </label>
                {importFile && (
                  <p className="piece-import-file-summary">
                    <strong>{importFile.name}</strong>
                    <span>{importRows.length} rows ready to stage</span>
                  </p>
                )}
                <button
                  type="button"
                  disabled={importRows.length === 0 || stagePending}
                  onClick={onStage}
                  className="cmd-btn cmd-btn--primary piece-import-stage-action"
                >
                  {stagePending ? "Reconciling..." : "Stage for review"}
                </button>
              </div>
            </DecisionPanel>

            <DecisionPanel title="Import batches">
              <div className="piece-import-batch-layout">
                <div className="piece-import-batch-list" aria-label="Staged import batches">
                  {batches.map((batch) => (
                    <button
                      type="button"
                      key={batch.id}
                      aria-pressed={selectedBatch?.id === batch.id}
                      onClick={() => {
                        setSelectedBatchId(batch.id);
                        setApplyConfirmed(false);
                      }}
                      className={`piece-import-batch${selectedBatch?.id === batch.id ? " is-selected" : ""}`}
                    >
                      <span className="piece-import-batch__head">
                        <strong>{batch.source_name || batch.source_type}</strong>
                        <Pill tone={batch.status === "applied" ? "good" : batch.status === "approved" ? "info" : "warn"}>
                          {batch.status.replace("_", " ")}
                        </Pill>
                      </span>
                      <span className="piece-import-batch__meta">
                        {batch.row_count} rows · {new Date(batch.created_at).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                  {batches.length === 0 && (
                    <p className="piece-command-empty">No staged imports yet.</p>
                  )}
                </div>

                <div className="piece-import-batch-detail">
                  {selectedBatch ? (
                    <>
                      <div className="piece-import-batch-summary">
                        <div>
                          <h3>{selectedBatch.source_name || selectedBatch.source_type}</h3>
                          <div className="piece-import-decisions">
                            {Object.entries(selectedBatch.decision_counts ?? {}).map(([decision, count]) => (
                              <Pill key={decision} tone={decisionTone[decision] ?? "neutral"}>
                                {decision.replace("_", " ")}: {count}
                              </Pill>
                            ))}
                          </div>
                        </div>
                        {selectedBatch.status === "pending_review" ? (
                          <button
                            type="button"
                            disabled={approvePending}
                            onClick={onApprove}
                            className="cmd-btn cmd-btn--primary"
                          >
                            Review complete · Approve
                          </button>
                        ) : selectedBatch.status === "approved" ? (
                          <div className="piece-import-apply">
                            <label
                              className="piece-command-field"
                              htmlFor="piece-import-assign-work-package"
                            >
                              Work package override (optional — or use CSV wp_number)
                              <select
                                id="piece-import-assign-work-package"
                                className="piece-command-control"
                                value={importTargetWorkPackageId}
                                onChange={(event) =>
                                  setImportTargetWorkPackageId(event.target.value)
                                }
                              >
                                <option value="">Use CSV wp_number / leave unassigned</option>
                                {workPackages.map((wp: any) => (
                                  <option key={wp.id} value={wp.id}>
                                    {formatWorkPackageTitle(wp)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label htmlFor="piece-import-apply-confirmation">
                              <input
                                id="piece-import-apply-confirmation"
                                type="checkbox"
                                checked={applyConfirmed}
                                onChange={(event) => setApplyConfirmed(event.target.checked)}
                              />
                              Confirm eligible creates and updates
                            </label>
                            <button
                              type="button"
                              disabled={!applyConfirmed || applyPending}
                              onClick={onApply}
                              className="cmd-btn piece-import-apply__button"
                            >
                              {importTargetWorkPackageId
                                ? "Apply, assign WP, and link drawings"
                                : "Apply batch (CSV WP / sheet hints)"}
                            </button>
                          </div>
                        ) : (
                          <div className="piece-import-apply">
                            <Pill tone="good">
                              <CheckCircle2 size={13} />
                              Applied
                            </Pill>
                            <label
                              className="piece-command-field"
                              htmlFor="piece-import-assign-work-package-applied"
                            >
                              Assign imported pieces to work package
                              <select
                                id="piece-import-assign-work-package-applied"
                                className="piece-command-control"
                                value={importTargetWorkPackageId}
                                onChange={(event) =>
                                  setImportTargetWorkPackageId(event.target.value)
                                }
                              >
                                <option value="">Select package</option>
                                {workPackages.map((wp: any) => (
                                  <option key={wp.id} value={wp.id}>
                                    {formatWorkPackageTitle(wp)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="cmd-btn cmd-btn--primary"
                              disabled={assignPending}
                              onClick={onAssignImport}
                            >
                              {importTargetWorkPackageId
                                ? "Assign + link from import"
                                : "Apply WP / drawing hints from import"}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="cmd-table-wrap piece-import-results">
                        <table className="cmd-table">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Mark</th>
                              <th>Decision</th>
                              <th>Profile</th>
                              <th>Grade</th>
                              <th>Warnings / resolution</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batchRows.map((row) => (
                              <tr key={row.id}>
                                <td>{row.source_row_number}</td>
                                <td><strong>{String(row.normalized_payload.piece_mark ?? "—")}</strong></td>
                                <td>
                                  <Pill tone={decisionTone[row.decision] ?? "neutral"}>
                                    {row.decision.replace("_", " ")}
                                  </Pill>
                                </td>
                                <td>{String(row.normalized_payload.profile ?? "—")}</td>
                                <td>{String(row.normalized_payload.material_grade ?? "—")}</td>
                                <td>
                                  {row.warnings.map(presentImportReconciliationText).join("; ")
                                    || (row.resolution
                                      ? presentImportReconciliationText(row.resolution)
                                      : "No exceptions")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="piece-command-empty piece-command-empty--detail">
                      <AlertTriangle size={24} />
                      <p>Stage an import to review reconciliation results.</p>
                    </div>
                  )}
                </div>
              </div>
            </DecisionPanel>
          </section>
  );
}
