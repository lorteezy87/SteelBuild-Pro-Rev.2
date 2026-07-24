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
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Fabrication release is unavailable until the Piece Register is set up.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="rounded-xl bg-slate-950 p-2 text-amber-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-950">Fabrication release</h3>
            <p className="text-xs text-slate-500">
              Four required checks must pass before fabrication release.
            </p>
          </div>
        </div>
        <button
          aria-label="Refresh fabrication release checks"
          onClick={() => gateQuery.refetch()}
          disabled={gateQuery.isFetching}
          className="rounded-lg border border-slate-200 p-2 text-slate-600 disabled:opacity-40"
        >
          <RefreshCw className={`h-4 w-4 ${gateQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {gateQuery.isLoading && <p className="mt-4 text-sm text-slate-500">Checking fabrication release…</p>}
      {gateQuery.error && (
        <p className="mt-4 text-sm font-semibold text-rose-700">
          {presentPieceControlError(
            gateQuery.error,
            "Fabrication release could not be evaluated.",
          )}
        </p>
      )}

      {gate && (
        <>
          <div className="mt-4 grid gap-2">
            {CHECK_LABELS.map(({ key, label }) => {
              const check = gate.checks[key];
              return (
                <div key={key} className={`rounded-xl border p-3 ${check.passed ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                  <div className="flex items-center gap-2">
                    {check.passed
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      : <CircleX className="h-4 w-4 text-rose-700" />}
                    <span className={`text-sm font-black ${check.passed ? "text-emerald-900" : "text-rose-900"}`}>{label}</span>
                  </div>
                  {check.blockers.length > 0 && (
                    <div className="mt-2 space-y-1 pl-6 text-xs text-rose-800">
                      {check.blockers.map((blocker) => <p key={blocker}>{presentBlocker(blocker)}</p>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {gate.already_released ? (
            <div className="mt-4 rounded-xl border border-slate-300 bg-slate-100 p-3 text-sm font-black text-slate-700">
              This work package is already released.
            </div>
          ) : gate.passes ? (
            <button
              disabled={releaseMutation.isPending}
              onClick={() => releaseMutation.mutate(null)}
              className="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
            >
              {releaseMutation.isPending ? "Releasing…" : "Release for fabrication"}
            </button>
          ) : gate.checks.scope.passed ? (
            <button
              disabled={releaseMutation.isPending}
              onClick={() => setExceptionOpen(true)}
              className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-40"
            >
              Release with exception
            </button>
          ) : (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
              Missing active piece scope is a hard block and cannot be overridden.
            </div>
          )}
        </>
      )}

      {exceptionOpen && gate && (
        <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-black text-amber-950">
            <AlertOctagon className="h-5 w-5" />
            Exception release creates a High schedule risk
          </div>
          <p className="mt-2 text-xs text-amber-900">
            The risk will retain the current release checks, blockers, reason, work package, and release reference.
          </p>
          <div className="mt-3 space-y-1 text-xs text-amber-900">
            {gate.blockers.map((blocker) => <p key={blocker}>• {presentBlocker(blocker)}</p>)}
          </div>
          <label
            htmlFor={exceptionReasonId}
            className="mt-4 grid gap-1 text-xs font-bold uppercase tracking-wider text-amber-900"
          >
            Required exception reason
            <textarea
              id={exceptionReasonId}
              value={exceptionReason}
              onChange={(event) => setExceptionReason(event.target.value)}
              rows={4}
              className="rounded-lg border border-amber-300 bg-white p-3 text-sm font-medium normal-case tracking-normal text-slate-900"
              placeholder="Explain why fabrication must proceed and how the blockers will be managed."
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              disabled={!exceptionReason.trim() || releaseMutation.isPending}
              onClick={() => releaseMutation.mutate(exceptionReason.trim())}
              className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
            >
              Confirm exception release
            </button>
            <button
              onClick={() => { setExceptionOpen(false); setExceptionReason(""); }}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-black text-amber-950"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

