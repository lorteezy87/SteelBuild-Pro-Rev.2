import { CheckCircle2 } from "lucide-react";
import { DecisionPanel } from "@/components/command";
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

export default function PieceRegisterOverview({
  displayRowCount,
  overviewQueryState,
  overviewWorkPackages,
  upcomingShipments,
  onOpenImport,
  onOpenRegister,
  onOpenLogistics,
}: {
  displayRowCount: number;
  overviewQueryState: OverviewQueryState;
  overviewWorkPackages: OverviewWorkPackage[];
  upcomingShipments: OverviewWorkPackage[];
  onOpenImport: () => void;
  onOpenRegister: () => void;
  onOpenLogistics: () => void;
}) {
  return (
    <section className="piece-register-overview">
      <div className="piece-register-overview__head">
        <div>
          <h2>{displayRowCount === 0 ? "Build the project piece record" : "Piece Register workspace"}</h2>
          <p>
            {displayRowCount === 0
              ? "A controlled path from source file to erection history."
              : `${displayRowCount.toLocaleString()} active piece rows are available for assignment, production, and logistics control.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => (displayRowCount === 0 ? onOpenImport() : onOpenRegister())}
          className="cmd-btn cmd-btn--primary"
        >
          {displayRowCount === 0 ? "Import the first pieces" : "Open the register"}
        </button>
      </div>

      {displayRowCount === 0 ? (
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
      ) : (
        <>
          <div className="piece-register-overview__status">
            <CheckCircle2 size={18} />
            <div>
              <strong>Register loaded</strong>
              <p>Use the lifecycle and exception controls above to move directly into focused piece work.</p>
            </div>
          </div>
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
        </>
      )}
    </section>
  );
}
