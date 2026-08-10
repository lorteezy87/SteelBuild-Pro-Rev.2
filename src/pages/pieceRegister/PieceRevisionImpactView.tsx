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
}: PieceRevisionImpactViewProps) {
  const relationshipsUnavailable = model.unavailableSourceWarnings.some(
    (warning) => warning.source === "relationships",
  );
  const selectedRevision = model.revisions.find(
    (revision) => revision.revisionId === selectedRevisionId,
  ) ?? null;

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
            <div className="piece-operation-state">
              No current drawing revisions are available for review.
            </div>
          ) : (
            <div aria-label="Current drawing revisions">
              {model.revisions.map((revision) => (
                <button
                  key={revision.revisionId}
                  type="button"
                  aria-pressed={selectedRevision?.revisionId === revision.revisionId}
                  aria-label={`${revision.sheetNumber || "Drawing"} revision ${revision.revisionCode || "unspecified"}`}
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
                  {selectedRevision.heldCount} held · {selectedRevision.openImpactCount} open impacts · {selectedRevision.openRfiCount} open RFIs
                </p>
              </div>
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
