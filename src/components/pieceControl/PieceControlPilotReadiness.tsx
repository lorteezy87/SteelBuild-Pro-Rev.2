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
  const expectedConfirmation = `CHANGE ${currentMode.toUpperCase()} TO ${targetMode.toUpperCase()}`;
  const isAdmin = ["admin", "owner"].includes(query.data?.role ?? "");

  const modeMutation = useMutation({
    mutationFn: () =>
      setPieceControlMode(projectId, targetMode, confirmation),
    onSuccess: async () => {
      onModeChanged?.(targetMode);
      toast.success(`Piece Control moved to ${targetMode} mode.`);
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
    onError: (error: Error) => toast.error(error.message),
  });

  const exportRows = useMemo(() => {
    const report = query.data?.report;
    if (!report) return [];
    return [
      ...Object.entries(report.metrics).map(([metric, value]) => [
        "Metric",
        metric,
        value,
      ]),
      ...report.data_quality_warnings.map((warning) => [
        "Data quality warning",
        warning,
        "",
      ]),
      ...report.hard_release_blockers.map((blocker) => [
        "Hard release blocker",
        blocker,
        "",
      ]),
      ...report.pilot_transition_blockers.map((blocker) => [
        "Pilot transition blocker",
        blocker,
        "",
      ]),
      ...report.live_transition_blockers.map((blocker) => [
        "Live transition blocker",
        blocker,
        "",
      ]),
    ];
  }, [query.data]);

  if (query.isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Building pilot readiness report...
      </section>
    );
  }
  if (query.error || !query.data) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Pilot readiness unavailable: {(query.error as Error)?.message}
      </section>
    );
  }

  const { report } = query.data;
  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-black text-slate-900">
            <ShieldCheck className="h-5 w-5 text-teal-700" />
            Pilot readiness and rollout control
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Project-scoped validation. Mode rollback preserves canonical and legacy records.
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
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Import coverage", `${report.metrics.canonical_import_coverage_percent ?? 0}%`],
          ["Model coverage", `${report.metrics.model_element_coverage_percent ?? 0}%`],
          ["Release blockers", report.hard_release_blockers.length],
          ["Failed command audits", query.data.recentFailureCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-slate-50 p-4">
            <div className="text-2xl font-black text-slate-900">{value}</div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportList
          title="Data quality warnings"
          items={report.data_quality_warnings}
          empty="No data quality warnings."
          severity="warning"
        />
        <ReportList
          title="Hard release blockers"
          items={report.hard_release_blockers}
          empty="No current hard release blockers."
          severity="blocker"
        />
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black uppercase tracking-wider text-slate-500">
              Current mode
            </div>
            <div className="text-2xl font-black capitalize text-slate-900">
              {currentMode}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2
              className={`h-4 w-4 ${
                report.pilot_ready ? "text-emerald-600" : "text-amber-600"
              }`}
            />
            Pilot {report.pilot_ready ? "ready" : "blocked"}
            <CheckCircle2
              className={`ml-3 h-4 w-4 ${
                report.live_ready ? "text-emerald-600" : "text-amber-600"
              }`}
            />
            Live {report.live_ready ? "ready" : "blocked"}
          </div>
        </div>

        {!isAdmin ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Only a project admin or owner can change Piece Control mode.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-[180px_1fr_auto]">
            <select
              value={targetMode}
              onChange={(event) => {
                setTargetMode(event.target.value as PieceControlMode);
                setConfirmation("");
              }}
              className="h-11 rounded-lg border border-slate-300 px-3"
            >
              {nextModes[currentMode].map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={`Type: ${expectedConfirmation}`}
              className="h-11 rounded-lg border border-slate-300 px-3"
            />
            <button
              type="button"
              disabled={
                confirmation !== expectedConfirmation || modeMutation.isPending
              }
              onClick={() => modeMutation.mutate()}
              className="h-11 rounded-lg bg-slate-950 px-5 font-black text-white disabled:opacity-40"
            >
              Confirm mode change
            </button>
          </div>
        )}
      </div>

      {query.data.modeEvents.length > 0 && (
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">
            Mode audit history
          </h3>
          <div className="mt-2 space-y-2">
            {query.data.modeEvents.map((event) => (
              <div
                key={event.id}
                className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"
              >
                <span>
                  {event.previous_mode} to {event.next_mode}
                </span>
                <span className="text-slate-500">
                  {new Date(event.changed_at).toLocaleString()}
                </span>
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
    <div
      className={`rounded-xl border p-4 ${
        blocked ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-center gap-2 font-black text-slate-900">
        <AlertTriangle
          className={`h-4 w-4 ${blocked ? "text-red-700" : "text-amber-700"}`}
        />
        {title}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item} className="rounded-lg bg-white/70 p-2">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

