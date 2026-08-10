import { useEffect, useState } from "react";
import type { DrawingImpactRow } from "@/hooks/useDrawingImpacts";
import type {
  PieceAttentionRow,
  PieceIntelligenceModel,
  RevisionExposureRow,
  SourceUnavailableWarning,
} from "@/lib/pieceControl/pieceIntelligenceTypes";

export interface PieceRevisionImpactViewProps {
  model: PieceIntelligenceModel;
  selectedRevisionId: string | null;
  onSelectRevision: (revisionId: string) => void;
  onSelectPiece: (pieceId: string) => void;
  canManageImpacts?: boolean;
  selectedImpact?: DrawingImpactRow | null;
  impactPending?: boolean;
  onSaveImpact?: (
    impactId: string | null,
    draft: DrawingImpactDraft,
  ) => Promise<unknown>;
  onResolveImpact?: (impactId: string) => Promise<unknown>;
}

export interface DrawingImpactDraft {
  impact_type: string;
  status: DrawingImpactRow["status"];
  priority: DrawingImpactRow["priority"];
  assigned_to: string;
  due_date: string;
  title: string;
  notes: string;
}

const IMPACT_TYPES = [
  "fabrication",
  "erection",
  "embed",
  "anchor_bolts",
  "connections",
  "material_takeoff",
  "shop_drawing_required",
  "rfi_followup",
  "change_order",
  "field_rework",
] as const;
const IMPACT_STATUSES: DrawingImpactRow["status"][] = [
  "open",
  "in_review",
  "ready",
  "blocked",
  "resolved",
  "closed",
];
const IMPACT_PRIORITIES: DrawingImpactRow["priority"][] = [
  "low",
  "medium",
  "high",
  "critical",
];
const EMPTY_IMPACT: DrawingImpactDraft = {
  impact_type: "fabrication",
  status: "open",
  priority: "medium",
  assigned_to: "",
  due_date: "",
  title: "",
  notes: "",
};

function impactDraft(impact: DrawingImpactRow | null | undefined): DrawingImpactDraft {
  return impact
    ? {
        impact_type: impact.impact_type,
        status: impact.status,
        priority: impact.priority,
        assigned_to: impact.assigned_to ?? "",
        due_date: impact.due_date ?? "",
        title: impact.title,
        notes: impact.notes ?? "",
      }
    : { ...EMPTY_IMPACT };
}

function optionLabel(value: string): string {
  return value.replace(/_/g, " ");
}

const sourceLabels: Record<SourceUnavailableWarning["source"], string> = {
  relationships: "Relationship evidence",
  approvals: "Approval evidence",
  impacts: "Drawing-impact evidence",
  rfis: "RFI evidence",
  events: "Piece history",
};

function verificationLabel(revision: RevisionExposureRow): string {
  if (revision.verification === "link_required") return "Relationship repair required";
  if (revision.verification === "partial") return "Evidence incomplete";
  return "Verified exact links";
}

function affectedPieceLabel(
  revision: RevisionExposureRow,
  relationshipsUnavailable = false,
): string {
  if (relationshipsUnavailable) return "Affected pieces unverified";
  if (revision.verification === "link_required") return "No exact piece links";
  const count = revision.affectedPieceIds.length;
  return `${count} affected ${count === 1 ? "piece" : "pieces"}`;
}

function revisionButtonLabel(
  revision: RevisionExposureRow,
  relationshipsUnavailable: boolean,
): string {
  const affectedEvidence =
    revision.verification === "link_required" && !relationshipsUnavailable
      ? "Piece links required"
      : affectedPieceLabel(revision, relationshipsUnavailable);
  return `${revision.sheetNumber || "Drawing"} revision ${revision.revisionCode || "unspecified"}, ${affectedEvidence}, ${verificationLabel(revision)}`;
}

function downstreamLabel(revision: RevisionExposureRow): string {
  const labels: Array<[keyof RevisionExposureRow["exposure"], string]> = [
    ["erected", "erected"],
    ["delivered", "delivered"],
    ["shipped", "shipped"],
    ["fabricated", "fabricated"],
    ["in_fabrication", "in fabrication"],
    ["released", "released"],
    ["not_started", "planned"],
  ];
  const populated = labels.flatMap(([key, label]) =>
    revision.exposure[key] > 0
      ? [`${revision.exposure[key]} ${label}`]
      : [],
  );
  return populated.length > 0 ? populated.join(" · ") : "No exact piece exposure";
}

function attentionForPiece(
  model: PieceIntelligenceModel,
  pieceId: string,
): PieceAttentionRow | undefined {
  return model.attention.find((row) => row.pieceId === pieceId);
}

function UnavailableEvidence({
  warnings,
}: {
  warnings: SourceUnavailableWarning[];
}) {
  if (warnings.length === 0) return null;
  const sources = warnings.map((warning) => sourceLabels[warning.source]);
  const sourceText = sources.length === 1
    ? sources[0]
    : `${sources.slice(0, -1).join(", ")} and ${sources.at(-1)}`;
  return (
    <div className="piece-operation-state is-error" role="status">
      <strong>{sourceText} {warnings.length === 1 ? "is" : "are"} unavailable.</strong>
      <p>Counts and decisions remain unverified until those sources recover.</p>
    </div>
  );
}

export function PieceRevisionImpactView({
  model,
  selectedRevisionId,
  onSelectRevision,
  onSelectPiece,
  canManageImpacts = false,
  selectedImpact = null,
  impactPending = false,
  onSaveImpact,
  onResolveImpact,
}: PieceRevisionImpactViewProps) {
  const [impactEditorOpen, setImpactEditorOpen] = useState(false);
  const [draft, setDraft] = useState<DrawingImpactDraft>(EMPTY_IMPACT);
  const relationshipsUnavailable = model.unavailableSourceWarnings.some(
    (warning) => warning.source === "relationships",
  );
  const impactsUnavailable = model.unavailableSourceWarnings.some(
    (warning) => warning.source === "impacts",
  );
  const rfisUnavailable = model.unavailableSourceWarnings.some(
    (warning) => warning.source === "rfis",
  );
  const selectedRevision = model.revisions.find(
    (revision) => revision.revisionId === selectedRevisionId,
  ) ?? null;

  useEffect(() => {
    setImpactEditorOpen(false);
    setDraft(EMPTY_IMPACT);
  }, [selectedRevisionId]);

  const openImpactEditor = () => {
    setDraft(impactDraft(selectedImpact));
    setImpactEditorOpen(true);
  };
  const closeImpactEditor = () => {
    setImpactEditorOpen(false);
    setDraft(EMPTY_IMPACT);
  };
  const saveImpact = async () => {
    if (!onSaveImpact || !draft.title.trim() || impactPending) return;
    try {
      await onSaveImpact(selectedImpact?.id ?? null, draft);
      closeImpactEditor();
    } catch {
      // Mutation errors are presented by the page; keep the editor and its
      // values available for correction or retry.
    }
  };
  const resolveImpact = async (impactId: string) => {
    if (!onResolveImpact || impactPending) return;
    try {
      await onResolveImpact(impactId);
    } catch {
      // The page mutation owns error presentation. Swallow the rejected
      // mutateAsync promise so the action stays available without an
      // unhandled browser rejection.
    }
  };

  return (
    <div
      className="piece-register-embedded-workspace"
    >
      <UnavailableEvidence warnings={model.unavailableSourceWarnings} />

      <div className="piece-register-summary">
        <section aria-labelledby="piece-revision-decisions-heading">
          <header className="piece-register-table__head">
            <div>
              <h2 id="piece-revision-decisions-heading">Revision decisions</h2>
              <p>Current revisions ordered for exact piece-exposure review.</p>
            </div>
          </header>

          {model.revisions.length === 0 ? (
            relationshipsUnavailable ? (
              <div className="piece-operation-state is-error">
                <strong>Revision evidence unavailable</strong>
                <p>
                  Current revisions cannot be confirmed until relationship and
                  revision evidence recovers.
                </p>
              </div>
            ) : (
              <div className="piece-operation-state">
                No current drawing revisions are available for review.
              </div>
            )
          ) : (
            <div aria-label="Current drawing revisions">
              {model.revisions.map((revision) => (
                <button
                  key={revision.revisionId}
                  type="button"
                  aria-pressed={selectedRevision?.revisionId === revision.revisionId}
                  aria-label={revisionButtonLabel(revision, relationshipsUnavailable)}
                  className={`cmd-btn cmd-btn--ghost${
                    selectedRevision?.revisionId === revision.revisionId
                      ? " is-active"
                      : ""
                  }`}
                  onClick={() => onSelectRevision(revision.revisionId)}
                >
                  <span>
                    <strong>{revision.sheetNumber || "Drawing"}</strong>
                    {` · Rev ${revision.revisionCode || "Unspecified"}`}
                  </span>
                  <span>{affectedPieceLabel(revision, relationshipsUnavailable)}</span>
                  <span>{verificationLabel(revision)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="piece-revision-detail-heading">
          <header className="piece-register-table__head">
            <div>
              <h2 id="piece-revision-detail-heading">Affected pieces</h2>
              <p>Only explicit drawing-set or drawing links are included.</p>
            </div>
          </header>

          {!selectedRevision ? (
            <div className="piece-operation-state">
              Select a revision to inspect its verified piece relationships.
            </div>
          ) : relationshipsUnavailable ? (
            <div className="piece-operation-state is-error">
              <strong>Piece relationships unavailable</strong>
              <p>
                Affected-piece counts and rows are hidden until exact
                drawing relationships can be verified.
              </p>
            </div>
          ) : selectedRevision.verification === "link_required" ? (
            <div className="piece-operation-state is-error">
              <strong>Piece links required</strong>
              <p>
                No exact piece relationship is available. Open Lots &amp; links
                before making a fabrication or field decision.
              </p>
            </div>
          ) : (
            <>
              <div className="piece-operation-state">
                <strong>{affectedPieceLabel(selectedRevision)}</strong>
                <p>{downstreamLabel(selectedRevision)}</p>
                <p>
                  <span>{selectedRevision.heldCount} held</span>
                  {" · "}
                  <span>
                    {impactsUnavailable
                      ? "Impact count unavailable"
                      : `${selectedRevision.openImpactCount} open impacts`}
                  </span>
                  {" · "}
                  <span>
                    {rfisUnavailable
                      ? "RFI count unavailable"
                      : `${selectedRevision.openRfiCount} open RFIs`}
                  </span>
                </p>
              </div>
              {canManageImpacts && onSaveImpact && !impactsUnavailable ? (
                <section aria-label="Drawing impact action">
                  {!impactEditorOpen ? (
                    <div className="piece-command-actions">
                      <button
                        type="button"
                        className="cmd-btn cmd-btn--secondary"
                        disabled={impactPending}
                        onClick={openImpactEditor}
                      >
                        {selectedImpact ? "Edit drawing impact" : "Add drawing impact"}
                      </button>
                      {selectedImpact &&
                      selectedImpact.status !== "resolved" &&
                      selectedImpact.status !== "closed" &&
                      onResolveImpact ? (
                        <button
                          type="button"
                          className="cmd-btn cmd-btn--secondary"
                          disabled={impactPending}
                          onClick={() => void resolveImpact(selectedImpact.id)}
                        >
                          {impactPending ? "Resolving impact…" : "Resolve drawing impact"}
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="piece-register-embedded-workspace">
                      <label htmlFor={`drawing-impact-type-${selectedRevision.revisionId}`}>
                        Impact type
                        <select
                          id={`drawing-impact-type-${selectedRevision.revisionId}`}
                          value={draft.impact_type}
                          disabled={impactPending}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              impact_type: event.target.value,
                            }))
                          }
                        >
                          {IMPACT_TYPES.map((value) => (
                            <option key={value} value={value}>{optionLabel(value)}</option>
                          ))}
                        </select>
                      </label>
                      <label htmlFor={`drawing-impact-status-${selectedRevision.revisionId}`}>
                        Impact status
                        <select
                          id={`drawing-impact-status-${selectedRevision.revisionId}`}
                          value={draft.status}
                          disabled={impactPending}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              status: event.target.value as DrawingImpactRow["status"],
                            }))
                          }
                        >
                          {IMPACT_STATUSES.map((value) => (
                            <option key={value} value={value}>{optionLabel(value)}</option>
                          ))}
                        </select>
                      </label>
                      <label htmlFor={`drawing-impact-priority-${selectedRevision.revisionId}`}>
                        Priority
                        <select
                          id={`drawing-impact-priority-${selectedRevision.revisionId}`}
                          value={draft.priority}
                          disabled={impactPending}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              priority: event.target.value as DrawingImpactRow["priority"],
                            }))
                          }
                        >
                          {IMPACT_PRIORITIES.map((value) => (
                            <option key={value} value={value}>{optionLabel(value)}</option>
                          ))}
                        </select>
                      </label>
                      <label htmlFor={`drawing-impact-assignee-${selectedRevision.revisionId}`}>
                        Assigned to
                        <input
                          id={`drawing-impact-assignee-${selectedRevision.revisionId}`}
                          type="text"
                          value={draft.assigned_to}
                          disabled={impactPending}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              assigned_to: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label htmlFor={`drawing-impact-due-${selectedRevision.revisionId}`}>
                        Due date
                        <input
                          id={`drawing-impact-due-${selectedRevision.revisionId}`}
                          type="date"
                          value={draft.due_date}
                          disabled={impactPending}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              due_date: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label htmlFor={`drawing-impact-title-${selectedRevision.revisionId}`}>
                        Impact title
                        <input
                          id={`drawing-impact-title-${selectedRevision.revisionId}`}
                          type="text"
                          value={draft.title}
                          disabled={impactPending}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label htmlFor={`drawing-impact-notes-${selectedRevision.revisionId}`}>
                        Impact notes
                        <textarea
                          id={`drawing-impact-notes-${selectedRevision.revisionId}`}
                          value={draft.notes}
                          disabled={impactPending}
                          rows={3}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <div className="piece-command-actions">
                        <button
                          type="button"
                          className="cmd-btn cmd-btn--primary"
                          disabled={!draft.title.trim() || impactPending}
                          onClick={() => void saveImpact()}
                        >
                          {impactPending ? "Saving impact…" : "Save impact"}
                        </button>
                        <button
                          type="button"
                          className="cmd-btn cmd-btn--ghost"
                          disabled={impactPending}
                          onClick={closeImpactEditor}
                        >
                          Cancel impact
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              ) : null}
              <div className="cmd-table-wrap">
                <table className="cmd-table" aria-label="Affected pieces">
                  <thead>
                    <tr>
                      <th>Piece / lot</th>
                      <th>Work package</th>
                      <th>Lifecycle</th>
                      <th>Decision reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRevision.affectedPieceIds.map((pieceId) => {
                      const attention = attentionForPiece(model, pieceId);
                      const pieceLabel = attention?.markAndLot ?? pieceId;
                      return (
                        <tr key={pieceId}>
                          <td>
                            <button
                              type="button"
                              className="cmd-btn cmd-btn--ghost"
                              aria-label={`Open ${pieceLabel} digital thread`}
                              onClick={() => onSelectPiece(pieceId)}
                            >
                              {pieceLabel}
                            </button>
                          </td>
                          <td>{attention?.workPackageLabel ?? "Not recorded"}</td>
                          <td>{attention?.lifecycleLabel ?? "Not recorded"}</td>
                          <td>{attention?.reason ?? "Exact revision relationship"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
