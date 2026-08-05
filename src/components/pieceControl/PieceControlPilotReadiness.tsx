import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/csv";
import {
  fetchPilotReadiness,
  setPieceControlMode,
  type PieceControlMode,
} from "@/lib/pieceControl/pilotReadinessRepository";
import { modePresentation } from "@/lib/pieceControl/presentation";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { PieceControlModeBadge } from "./PieceControlModeBadge";

interface PieceControlPilotReadinessProps {
  projectId: string;
  currentMode: PieceControlMode;
  onModeChanged?: (nextMode: PieceControlMode) => void;
}

const nextModes: Record<PieceControlMode, PieceControlMode[]> = {
  off: ["shadow"],
  shadow: ["off", "pilot"],
  pilot: ["off", "shadow", "live"],
  live: ["off", "shadow"],
};

function presentReadinessText(value: string) {
  if (/^No active actionable canonical piece scope$/i.test(value)) {
    return "No active pieces are in the Piece Register";
  }
  if (
    /^Canonical station configuration must contain six stations totaling 100 percent$/i.test(
      value,
    )
  ) {
    return "Fabrication station setup must contain six stations totaling 100 percent";
  }
  return value
    .replaceAll("_", " ")
    .replace(
      /\bcanonical versus legacy\b/gi,
      "Piece Register versus existing production records",
    )
    .replace(/\bcanonical release gate\b/gi, "fabrication release checks")
    .replace(/\bcanonical piece scope\b/gi, "Piece Register scope")
    .replace(/\bcanonical\b/gi, "Piece Register")
    .replace(/\blegacy\b/gi, "existing production records")
    .replace(/\bbefore pilot\b/gi, "for Pilot workflow")
    .replace(/\bbefore live mode\b/gi, "for Live workflow")
    .replace(/\bpilot transition\b/gi, "Pilot workflow")
    .replace(/\blive transition\b/gi, "Live workflow");
}

export function PieceControlPilotReadiness({
  projectId,
  currentMode,
  onModeChanged,
}: PieceControlPilotReadinessProps) {
  const queryClient = useQueryClient();
  const [targetMode, setTargetMode] = useState<PieceControlMode>(
    nextModes[currentMode][0] ?? "shadow",
  );
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    setTargetMode(nextModes[currentMode][0] ?? "shadow");
    setConfirmation("");
  }, [currentMode]);

  const query = useQuery({
    queryKey: ["piece-control-pilot-readiness", projectId],
    queryFn: () => fetchPilotReadiness(projectId),
  });
  const expectedConfirmation =
    `CHANGE ${currentMode.toUpperCase()} TO ${targetMode.toUpperCase()}`;
  const isAdmin = ["admin", "owner"].includes(query.data?.role ?? "");
  const currentModeInfo = modePresentation(currentMode);

  const modeMutation = useMutation({
    mutationFn: (confirmationOverride?: string) =>
      setPieceControlMode(
        projectId,
        targetMode,
        confirmationOverride ?? confirmation,
    ),
    onSuccess: async () => {
      onModeChanged?.(targetMode);
      toast.success(
        `Piece Control moved to ${modePresentation(targetMode).label}.`,
      );
      setConfirmation("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["piece-control-pilot-readiness", projectId],
        }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({
          queryKey: ["canonical-reporting", projectId],
        }),
      ]);
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(
          error,
          "The Piece Register workflow could not be changed.",
        ),
      ),
  });

  const exportRows = useMemo(() => {
    const report = query.data?.report;
    if (!report) return [];
    return [
      ...Object.entries(report.metrics).map(([metric, value]) => [
        "Metric",
        presentReadinessText(metric),
        value,
      ]),
      ...report.data_quality_warnings.map((warning) => [
        "Data quality warning",
        presentReadinessText(warning),
        "",
      ]),
      ...report.hard_release_blockers.map((blocker) => [
        "Hard release blocker",
        presentReadinessText(blocker),
        "",
      ]),
      ...report.pilot_transition_blockers.map((blocker) => [
        presentReadinessText("Pilot transition blocker"),
        presentReadinessText(blocker),
        "",
      ]),
      ...report.live_transition_blockers.map((blocker) => [
        presentReadinessText("Live transition blocker"),
        presentReadinessText(blocker),
        "",
      ]),
    ];
  }, [query.data]);

  if (query.isLoading) {
    return (
      <section
        className="piece-rollout-state is-loading"
        aria-label="Loading Piece Control readiness"
      >
        <span className="piece-rollout-state__skeleton" aria-hidden="true" />
        <span>Building the Piece Control readiness report...</span>
      </section>
    );
  }
  if (query.error || !query.data) {
    return (
      <section className="piece-rollout-state is-error">
        <div>
          <strong>Piece Control readiness is unavailable.</strong>
          <span>
            {presentPieceControlError(
              query.error,
              "Piece Register readiness could not be loaded.",
            )}
          </span>
        </div>
        <button
          type="button"
          className="cmd-btn"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </section>
    );
  }

  const { report } = query.data;

  if (currentMode === "off") {
    return (
      <section className="piece-rollout-setup">
        <div className="piece-rollout-setup__body">
          <div className="piece-rollout-setup__copy">
            <div className="piece-rollout-title">
              <ShieldCheck size={20} />
              <h2>Enable Piece Register</h2>
            </div>
            <PieceControlModeBadge presentation={currentModeInfo} />
            <p>
              Start in Shadow review to import and review piece data without replacing
              current release, production, or reporting workflows.
            </p>
            <div className="piece-rollout-setup__assurances">
              <div className="is-safe">
                <strong>Safe first step</strong>
                <p>
                  Imports stay staged until your team reviews, approves, and applies them.
                </p>
              </div>
              <div>
                <strong>No workflow cutover</strong>
                <p>
                  Existing fabrication records remain unchanged while you validate the register.
                </p>
              </div>
            </div>
          </div>

          {!isAdmin ? (
            <div className="piece-rollout-admin-note">
              A project owner or admin must enable this workspace.
            </div>
          ) : (
            <button
              type="button"
              disabled={modeMutation.isPending}
              onClick={() => modeMutation.mutate(expectedConfirmation)}
              className="cmd-btn cmd-btn--primary piece-rollout-setup__action"
            >
              {modeMutation.isPending ? "Enabling Piece Register..." : "Enable Piece Register"}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="piece-rollout">
      <header className="piece-rollout__header">
        <div className="piece-rollout__intro">
          <div className="piece-rollout-title">
            <ShieldCheck size={19} />
            <h2>Readiness and rollout control</h2>
          </div>
          <p>
            Project-scoped checks. Moving to an earlier mode does not remove register
            or production history.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            exportToCSV({
              filename: `piece-control-readiness-${projectId}.csv`,
              headers: ["Category", "Check", "Value"],
              rows: exportRows,
            })
          }
          className="cmd-btn"
        >
          <Download size={15} />
          Export CSV
        </button>
      </header>

      <div className="piece-rollout__metrics">
        {[
          ["Import coverage", `${report.metrics.canonical_import_coverage_percent ?? 0}%`],
          ["Model coverage", `${report.metrics.model_element_coverage_percent ?? 0}%`],
          ["Release blockers", report.hard_release_blockers.length],
          ["Failed command audits", query.data.recentFailureCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="piece-rollout-metric">
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="piece-rollout__report-grid">
        <ReportList
          title="Data quality warnings"
          items={report.data_quality_warnings.map(presentReadinessText)}
          empty="No data quality warnings."
          severity="warning"
        />
        <ReportList
          title="Hard release blockers"
          items={report.hard_release_blockers.map(presentReadinessText)}
          empty="No current hard release blockers."
          severity="blocker"
        />
      </div>

      <div className="piece-rollout__readiness-grid">
        <ModeReadiness
          label="Pilot workflow"
          ready={report.pilot_ready}
          blockers={report.pilot_transition_blockers.map(presentReadinessText)}
        />
        <ModeReadiness
          label="Live workflow"
          ready={report.live_ready}
          blockers={report.live_transition_blockers.map(presentReadinessText)}
        />
      </div>

      <div className="piece-rollout-mode">
        <div className="piece-rollout-mode__head">
          <div className="piece-rollout-mode__identity">
            <span>Current mode</span>
            <PieceControlModeBadge presentation={currentModeInfo} />
          </div>
        </div>

        {!isAdmin ? (
          <p className="piece-rollout-admin-note">
            Only a project admin or owner can change Piece Control mode.
          </p>
        ) : (
          <div className="piece-rollout-confirmation">
            <label className="piece-rollout-field" htmlFor="piece-rollout-target-mode">
              Target mode
              <select
                id="piece-rollout-target-mode"
                value={targetMode}
                onChange={(event) => {
                  setTargetMode(event.target.value as PieceControlMode);
                  setConfirmation("");
                }}
                className="piece-command-control"
              >
                {nextModes[currentMode].map((mode) => {
                  const option = modePresentation(mode);
                  return (
                    <option key={mode} value={mode}>
                      {option.label}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="piece-rollout-field" htmlFor="piece-rollout-confirmation">
              Exact confirmation
              <input
                id="piece-rollout-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={`Type: ${expectedConfirmation}`}
                className="piece-command-control piece-rollout-confirmation__input"
              />
            </label>
            <button
              type="button"
              disabled={
                confirmation !== expectedConfirmation || modeMutation.isPending
              }
              onClick={() => modeMutation.mutate(confirmation)}
              className="cmd-btn cmd-btn--primary piece-rollout-confirmation__action"
            >
              Confirm mode change
            </button>
          </div>
        )}
      </div>

      {query.data.modeEvents.length > 0 && (
        <div className="piece-rollout-audit">
          <h3>Mode audit history</h3>
          <div className="piece-rollout-audit__list">
            {query.data.modeEvents.map((event) => (
              <div
                key={event.id}
                className="piece-rollout-audit__row"
              >
                <span>
                  {modePresentation(event.previous_mode).label} to{" "}
                  {modePresentation(event.next_mode).label}
                </span>
                <time dateTime={event.changed_at}>
                  {new Date(event.changed_at).toLocaleString()}
                </time>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ReportList({
  title,
  items,
  empty,
  severity,
}: {
  title: string;
  items: string[];
  empty: string;
  severity: "warning" | "blocker";
}) {
  const blocked = severity === "blocker";
  return (
    <div className={`piece-rollout-report ${blocked ? "is-blocker" : "is-warning"}`}>
      <div className="piece-rollout-report__title">
        <AlertTriangle size={15} />
        {title}
      </div>
      {items.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModeReadiness({
  label,
  ready,
  blockers,
}: {
  label: string;
  ready: boolean;
  blockers: string[];
}) {
  return (
    <section className={`piece-rollout-readiness ${ready ? "is-ready" : "is-blocked"}`}>
      <div className="piece-rollout-readiness__title">
        {ready ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
        <strong>{label} {ready ? "ready" : "blocked"}</strong>
      </div>
      {blockers.length > 0 ? (
        <ul>
          {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
        </ul>
      ) : (
        <p>{ready ? "All current transition checks pass." : "Transition checks are incomplete."}</p>
      )}
    </section>
  );
}

