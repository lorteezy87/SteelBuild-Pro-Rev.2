import { DecisionPanel } from "@/components/command";
import type {
  PieceAttentionRow,
  PieceIntelligenceModel,
  RevisionExposureRow,
  SourceUnavailableWarning,
} from "@/lib/pieceControl/pieceIntelligenceTypes";
import {
  formatPlannedShipDate,
  workPackageStatusLabel,
  type OverviewWorkPackage,
} from "./overviewDerive";

type OverviewQueryState = {
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
};

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function revisionImpactLabel(revision: RevisionExposureRow): string {
  if (revision.verification === "link_required") return "Piece links required";
  const downstream =
    revision.exposure.in_fabrication +
    revision.exposure.fabricated +
    revision.exposure.shipped +
    revision.exposure.delivered +
    revision.exposure.erected;
  return `${downstream} downstream · ${revision.heldCount} held`;
}

function revisionDecisionLabel(revision: RevisionExposureRow): string {
  const identity = `${revision.sheetNumber || "Drawing"} revision ${
    revision.revisionCode || "unspecified"
  }`;
  if (revision.verification === "link_required") {
    return `Review ${identity}, links required, piece relationships must be repaired`;
  }
  const fabricationExposure =
    revision.exposure.in_fabrication + revision.exposure.fabricated;
  const downstreamDecision = fabricationExposure > 0
    ? `${fabricationExposure} with fabrication exposure`
    : revisionImpactLabel(revision);
  return `Review ${identity}, ${countLabel(
    revision.affectedPieceIds.length,
    "affected piece",
  )}, ${downstreamDecision}, ${countLabel(revision.heldCount, "held piece")}`;
}

function attentionDecisionLabel(attention: PieceAttentionRow): string {
  if (attention.priorityTier === 8 && attention.revisionId) {
    return `Repair relationships for ${attention.markAndLot.replace(
      " · Rev ",
      " revision ",
    )}, ${attention.reason}`;
  }
  return `Open ${attention.markAndLot} digital thread, ${attention.reason}, ${attention.lifecycleLabel}`;
}

function overviewSentence(model: PieceIntelligenceModel): string {
  const affected = countLabel(model.metrics.affectedPieces, "piece");
  if (model.metrics.linkRequiredRevisions > 0) {
    return `${affected} have exact current-revision exposure; ${countLabel(
      model.metrics.linkRequiredRevisions,
      "revision",
    )} still require explicit piece links.`;
  }
  return `${affected} have exact current-revision exposure. Review downstream work before the next release decision.`;
}

const sourceStateLabels: Record<SourceUnavailableWarning["source"], string> = {
  relationships: "Relationship evidence",
  approvals: "Approval evidence",
  impacts: "Drawing-impact evidence",
  rfis: "RFI evidence",
  events: "Piece history",
};

function PieceIntelligenceMetrics({
  metrics,
  warnings,
}: {
  metrics: PieceIntelligenceModel["metrics"];
  warnings: SourceUnavailableWarning[];
}) {
  const unavailable = new Set(warnings.map(({ source }) => source));
  const blockedUnknown = unavailable.has("impacts") || unavailable.has("rfis");
  const releaseUnknown = unavailable.has("approvals");
  const cells: Array<[string, string]> = [
    ["Revision affected", String(metrics.affectedPieces)],
    ["Blocked or held", blockedUnknown ? "Unavailable" : String(metrics.blockedPieces)],
    [
      "Next release",
      releaseUnknown
        ? "Unavailable"
        : metrics.nextRelease
        ? metrics.nextRelease.isReady
          ? "Ready"
          : `${metrics.nextRelease.blockerCount} blockers`
        : "No package",
    ],
    ["Field risk", String(metrics.fieldRiskPieces)],
  ];
  return (
    <div
      className="piece-intelligence-overview__metrics"
      role="group"
      aria-label="Piece intelligence metrics"
    >
      {cells.map(([label, value]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function OptionalEvidenceState({
  warnings,
}: {
  warnings: SourceUnavailableWarning[];
}) {
  const optionalWarnings = warnings.filter(
    ({ source }) => source !== "relationships",
  );
  if (optionalWarnings.length === 0) return null;
  return (
    <div className="piece-operation-state is-error" role="status">
      <strong>Decision evidence is partial.</strong>
      {optionalWarnings.map(({ source }) => (
        <p key={source}>{sourceStateLabels[source]} is unavailable.</p>
      ))}
      <p>Known exact relationships remain visible; unavailable metrics are marked explicitly.</p>
    </div>
  );
}

export default function PieceRegisterOverview({
  displayRowCount,
  overviewQueryState,
  overviewWorkPackages,
  upcomingShipments,
  intelligence,
  intelligenceState,
  onOpenImport,
  onOpenLogistics,
  onReviewRevision,
  onSelectRevision,
  onSelectPiece,
  onOpenRelationships,
}: {
  displayRowCount: number;
  overviewQueryState: OverviewQueryState;
  overviewWorkPackages: OverviewWorkPackage[];
  upcomingShipments: OverviewWorkPackage[];
  intelligence: PieceIntelligenceModel | null;
  intelligenceState: OverviewQueryState;
  onOpenImport: () => void;
  onOpenLogistics: () => void;
  onReviewRevision: () => void;
  onSelectRevision: (revisionId: string) => void;
  onSelectPiece: (pieceId: string) => void;
  onOpenRelationships: (revisionId: string) => void;
}) {
  if (displayRowCount === 0) {
    return (
      <section className="piece-register-overview">
        <div className="piece-register-overview__head">
          <div>
            <h2>Build the project piece record</h2>
            <p>A controlled path from source file to erection history.</p>
          </div>
          <button
            type="button"
            onClick={onOpenImport}
            className="cmd-btn cmd-btn--primary"
          >
            Import the first pieces
          </button>
        </div>

        <div className="piece-register-workflow">
          {[
            ["01", "Import & reconcile", "Stage source data and resolve conflicts before anything is written."],
            ["02", "Organize lots", "Assign work packages and split quantities while preserving traceability."],
            ["03", "Track production", "Advance released lots through controlled shop stations."],
            ["04", "Move to the field", "Record shipping, delivery, and erection with an immutable history."],
          ].map(([step, title, description]) => (
            <div key={step} className="piece-register-workflow__step">
              <div className="piece-register-workflow__number">{step}</div>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const relationshipsUnavailable = Boolean(
    intelligence?.unavailableSourceWarnings.some(
      (warning) => warning.source === "relationships",
    ),
  );
  const intelligenceAvailable = Boolean(intelligence && !relationshipsUnavailable);
  const attentionIncomplete = Boolean(
    intelligence?.unavailableSourceWarnings.some(
      ({ source }) => source === "impacts" || source === "rfis",
    ),
  );
  const reviewLabel = intelligenceAvailable && intelligence
    ? `Review revision impact, ${countLabel(
        intelligence.metrics.affectedPieces,
        "affected piece",
      )}`
    : "Review revision impact when evidence is available";

  return (
    <section className="piece-register-overview piece-intelligence-overview">
      <header className="piece-register-overview__head piece-intelligence-overview__head">
        <div>
          <h2>Changes &amp; Risks</h2>
          <p>
            {intelligenceAvailable && intelligence
              ? overviewSentence(intelligence)
              : "Core register operations remain available while exact revision evidence is verified."}
          </p>
        </div>
        <button
          type="button"
          aria-label={reviewLabel}
          onClick={onReviewRevision}
          className="cmd-btn cmd-btn--primary"
          disabled={!intelligenceAvailable}
        >
          Review revision impact
        </button>
      </header>

      {intelligenceState.isLoading ? (
        <div className="piece-operation-state is-loading" role="status">
          Loading change and risk evidence…
        </div>
      ) : intelligenceState.error ? (
        <div className="piece-operation-state is-error" role="status">
          <strong>Changes and risks could not be loaded.</strong>
          <p>Affected-piece totals are hidden until exact evidence recovers.</p>
          <button
            type="button"
            className="cmd-btn cmd-btn--secondary"
            aria-label="Retry changes and risks"
            onClick={() => void intelligenceState.refetch()}
          >
            Try again
          </button>
        </div>
      ) : relationshipsUnavailable ? (
        <div className="piece-operation-state is-error" role="status">
          <strong>Relationship evidence is unavailable.</strong>
          <p>Affected-piece totals are hidden until exact drawing relationships can be verified.</p>
          <button
            type="button"
            className="cmd-btn cmd-btn--secondary"
            aria-label="Retry changes and risks"
            onClick={() => void intelligenceState.refetch()}
          >
            Try again
          </button>
        </div>
      ) : intelligence ? (
        <>
          <PieceIntelligenceMetrics
            metrics={intelligence.metrics}
            warnings={intelligence.unavailableSourceWarnings}
          />
          <OptionalEvidenceState warnings={intelligence.unavailableSourceWarnings} />
          <div className="piece-intelligence-overview__decisions">
            <DecisionPanel title="Revision impact requiring action">
              {intelligence.revisions.length === 0 ? (
                <p className="piece-command-empty">No current revisions require review.</p>
              ) : (
                intelligence.revisions.slice(0, 3).map((revision) => (
                  <button
                    key={revision.revisionId}
                    type="button"
                    className="cmd-row"
                    aria-label={revisionDecisionLabel(revision)}
                    onClick={() => onSelectRevision(revision.revisionId)}
                  >
                    <span>
                      <strong>
                        {revision.sheetNumber || "Drawing"} · Rev {revision.revisionCode || "Unspecified"}
                      </strong>
                      <span className="cmd-row__meta">{revisionImpactLabel(revision)}</span>
                    </span>
                    <span className="cmd-row__num">
                      {revision.verification === "link_required"
                        ? "Links required"
                        : countLabel(revision.affectedPieceIds.length, "piece")}
                    </span>
                  </button>
                ))
              )}
            </DecisionPanel>

            <DecisionPanel title="Pieces needing attention">
              {attentionIncomplete ? (
                <p className="cmd-row__meta">
                  Pieces needing attention is incomplete while impact or RFI evidence is unavailable.
                </p>
              ) : null}
              {intelligence.attention.length === 0 ? (
                <p className="piece-command-empty">
                  {attentionIncomplete
                    ? "No additional rows are confirmed by the available evidence."
                    : "No pieces need an immediate decision."}
                </p>
              ) : (
                intelligence.attention.slice(0, 4).map((attention) => {
                  const relationshipRepair =
                    attention.priorityTier === 8 && Boolean(attention.revisionId);
                  return (
                    <button
                      key={`${attention.priorityTier}-${attention.pieceId}`}
                      type="button"
                      className="cmd-row"
                      aria-label={attentionDecisionLabel(attention)}
                      onClick={() => {
                        if (relationshipRepair && attention.revisionId) {
                          onOpenRelationships(attention.revisionId);
                          return;
                        }
                        onSelectPiece(attention.pieceId);
                      }}
                    >
                      <span>
                        <strong>{attention.markAndLot}</strong>
                        <span className="cmd-row__meta">{attention.reason}</span>
                      </span>
                      <span className="cmd-row__num">{attention.lifecycleLabel}</span>
                    </button>
                  );
                })
              )}
            </DecisionPanel>
          </div>
        </>
      ) : (
        <div className="piece-operation-state is-error" role="status">
          Change and risk evidence is unavailable.
        </div>
      )}

      <div className="piece-register-summary">
        <DecisionPanel title="Work-package readiness">
          {overviewQueryState.isLoading ? (
            <p className="cmd-row__meta">Loading work-package readiness…</p>
          ) : overviewQueryState.error ? (
            <div className="piece-operation-state is-error">
              <span>Work-package readiness could not be loaded.</span>
              <button
                type="button"
                className="cmd-btn cmd-btn--secondary"
                onClick={() => void overviewQueryState.refetch()}
              >
                Try again
              </button>
            </div>
          ) : overviewWorkPackages.length === 0 ? (
            <p className="piece-command-empty">No work packages are in this project.</p>
          ) : (
            overviewWorkPackages.map((workPackage) => (
              <div key={workPackage.workPackageId} className="cmd-row">
                <div>
                  <strong>
                    {workPackage.source?.wp_number ||
                      workPackage.source?.name ||
                      workPackage.workPackageId}
                  </strong>
                  <div className="cmd-row__meta">
                    {workPackageStatusLabel(workPackage.derivedStatus)}
                    {" · "}
                    {workPackage.pieceCount.toLocaleString()} pieces
                    {" · "}
                    {workPackage.knownTons.toFixed(2)} known tons
                  </div>
                </div>
                <span className="cmd-row__num">
                  {workPackage.earnedFabricationPercent == null
                    ? "Weights needed"
                    : `${workPackage.earnedFabricationPercent.toFixed(1)}% shop earned`}
                </span>
              </div>
            ))
          )}
        </DecisionPanel>

        <DecisionPanel title="Upcoming shipments">
          {overviewQueryState.isLoading ? (
            <p className="cmd-row__meta">Loading planned shipments…</p>
          ) : overviewQueryState.error ? (
            <p className="piece-command-empty">Planned shipments are unavailable.</p>
          ) : upcomingShipments.length === 0 ? (
            <div className="piece-command-empty piece-register-overview__empty-action">
              <p>No planned ship dates recorded.</p>
              <button
                type="button"
                className="cmd-btn cmd-btn--secondary"
                onClick={onOpenLogistics}
              >
                Open Logistics
              </button>
            </div>
          ) : (
            upcomingShipments.map((workPackage) => (
              <div key={workPackage.workPackageId} className="cmd-row">
                <strong>
                  {workPackage.source?.wp_number ||
                    workPackage.source?.name ||
                    workPackage.workPackageId}
                </strong>
                <span className="cmd-row__num">
                  {formatPlannedShipDate(workPackage.plannedShipDate!)}
                </span>
              </div>
            ))
          )}
        </DecisionPanel>
      </div>
    </section>
  );
}
