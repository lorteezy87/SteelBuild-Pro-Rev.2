import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, CheckCircle2, CircleX, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  evaluateCanonicalReleaseGate,
  releaseCanonicalWorkPackage,
  type CanonicalReleaseGate,
} from "@/lib/pieceControl/releaseRepository";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";

interface CanonicalFabReleasePanelProps {
  projectId: string;
  workPackageId: string;
  pieceControlMode: string;
}

const CHECK_LABELS: Array<{ key: keyof CanonicalReleaseGate["checks"]; label: string }> = [
  { key: "scope", label: "Piece scope" },
  { key: "drawings", label: "Shop drawings" },
  { key: "material", label: "Material received / on hand" },
  { key: "holds", label: "Piece holds" },
];

const BLOCKER_PRESENTATION_COPY: Record<string, string> = {
  "No active, actionable canonical leaf pieces are assigned to this work package.":
    "No active pieces are assigned to this work package.",
};

function presentBlocker(blocker: string) {
  return BLOCKER_PRESENTATION_COPY[blocker] ?? blocker;
}

export default function CanonicalFabReleasePanel({
  projectId,
  workPackageId,
  pieceControlMode,
}: CanonicalFabReleasePanelProps) {
  const queryClient = useQueryClient();
  const enabled = Boolean(projectId && workPackageId && pieceControlMode !== "off");
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const exceptionReasonId = `piece-release-exception-reason-${workPackageId}`;

  const gateQuery = useQuery({
    queryKey: ["canonical-release-gate", workPackageId],
    queryFn: () => evaluateCanonicalReleaseGate(workPackageId),
    enabled,
    staleTime: 5_000,
  });
  const gate = gateQuery.data;

  const releaseMutation = useMutation({
    mutationFn: (reason: string | null) => releaseCanonicalWorkPackage(workPackageId, reason),
    onSuccess: async (result) => {
      setExceptionOpen(false);
      setExceptionReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["canonical-release-gate", workPackageId] }),
        queryClient.invalidateQueries({ queryKey: ["piece-relationships", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["piece-register", projectId] }),
      ]);
      if (result.is_exception) {
        toast.warning(`Exception release recorded. Schedule risk ${result.risk_id ?? ""} created.`);
      } else {
        toast.success(`Released as ${result.release_number}`);
      }
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "Fabrication release failed."),
      ),
  });

  if (!enabled) {
    return (
      <div className="piece-fab-release piece-fab-release--unavailable">
        Fabrication release is unavailable until the Piece Register is set up.
      </div>
    );
  }

  return (
    <div className="piece-fab-release">
      <div className="piece-fab-release__header">
        <div className="piece-fab-release__title-row">
          <div className="piece-fab-release__shield" aria-hidden="true">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="piece-fab-release__title">Fabrication release</h3>
            <p className="piece-fab-release__subtitle">
              Four required checks must pass before fabrication release.
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Refresh fabrication release checks"
          onClick={() => gateQuery.refetch()}
          disabled={gateQuery.isFetching}
          className="piece-fab-release__refresh"
        >
          <RefreshCw className={`h-4 w-4 ${gateQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {gateQuery.isLoading && (
        <p className="piece-fab-release__muted">Checking fabrication release…</p>
      )}
      {gateQuery.error && (
        <p className="piece-fab-release__error">
          {presentPieceControlError(
            gateQuery.error,
            "Fabrication release could not be evaluated.",
          )}
        </p>
      )}

      {gate && (
        <>
          <div className="piece-fab-release__checks">
            {CHECK_LABELS.map(({ key, label }) => {
              const check = gate.checks[key];
              return (
                <div
                  key={key}
                  className={`piece-fab-release__check ${check.passed ? "is-pass" : "is-fail"}`}
                >
                  <div className="piece-fab-release__check-row">
                    {check.passed
                      ? <CheckCircle2 className="h-4 w-4" />
                      : <CircleX className="h-4 w-4" />}
                    <span className="piece-fab-release__check-label">{label}</span>
                  </div>
                  {check.blockers.length > 0 && (
                    <div className="piece-fab-release__blockers">
                      {check.blockers.map((blocker) => (
                        <p key={blocker}>{presentBlocker(blocker)}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {gate.already_released ? (
            <div className="piece-fab-release__status">
              This work package is already released.
            </div>
          ) : gate.passes ? (
            <button
              type="button"
              disabled={releaseMutation.isPending}
              onClick={() => releaseMutation.mutate(null)}
              className="piece-fab-release__btn piece-fab-release__btn--good"
            >
              {releaseMutation.isPending ? "Releasing…" : "Release for fabrication"}
            </button>
          ) : gate.checks.scope.passed ? (
            <button
              type="button"
              disabled={releaseMutation.isPending}
              onClick={() => setExceptionOpen(true)}
              className="piece-fab-release__btn piece-fab-release__btn--warn"
            >
              Release with exception
            </button>
          ) : (
            <div className="piece-fab-release__hard-block">
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
              Missing active piece scope is a hard block and cannot be overridden.
            </div>
          )}
        </>
      )}

      {exceptionOpen && gate && (
        <div className="piece-fab-release__exception">
          <div className="piece-fab-release__exception-title">
            <AlertOctagon className="h-5 w-5" />
            Exception release creates a High schedule risk
          </div>
          <p className="piece-fab-release__exception-copy">
            The risk will retain the current release checks, blockers, reason, work package, and release reference.
          </p>
          <div className="piece-fab-release__exception-blockers">
            {gate.blockers.map((blocker) => <p key={blocker}>• {presentBlocker(blocker)}</p>)}
          </div>
          <label
            htmlFor={exceptionReasonId}
            className="piece-fab-release__exception-label"
          >
            Required exception reason
            <textarea
              id={exceptionReasonId}
              value={exceptionReason}
              onChange={(event) => setExceptionReason(event.target.value)}
              rows={4}
              className="piece-fab-release__exception-input"
              placeholder="Explain why fabrication must proceed and how the blockers will be managed."
            />
          </label>
          <div className="piece-fab-release__exception-actions">
            <button
              type="button"
              disabled={!exceptionReason.trim() || releaseMutation.isPending}
              onClick={() => releaseMutation.mutate(exceptionReason.trim())}
              className="piece-fab-release__btn piece-fab-release__btn--danger"
            >
              Confirm exception release
            </button>
            <button
              type="button"
              onClick={() => { setExceptionOpen(false); setExceptionReason(""); }}
              className="piece-fab-release__btn piece-fab-release__btn--ghost"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
