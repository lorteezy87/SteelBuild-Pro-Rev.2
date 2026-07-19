import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CalendarClock, Factory, Weight } from "lucide-react";
import { fetchCanonicalDashboardSnapshot } from "@/lib/pieceControl/canonicalDashboardRepository";
import {
  CANONICAL_LIFECYCLES,
  rollupCanonicalPieces,
  rollupCanonicalWorkPackages,
  selectActionableLeafPieces,
} from "@/lib/pieceControl/canonicalRollups";
import { pieceLifecycleLabel } from "@/lib/pieceControl/lifecycle";
import { useCanonicalReportingRealtime } from "@/hooks/useCanonicalReportingRealtime";

interface CanonicalPieceDashboardProps {
  project: {
    id: string;
    piece_control_mode?: string | null;
  };
}

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export default function CanonicalPieceDashboard({
  project,
}: CanonicalPieceDashboardProps) {
  const mode = String(project.piece_control_mode ?? "off");
  const enabled = mode !== "off";
  useCanonicalReportingRealtime(enabled ? project.id : undefined);
  const query = useQuery({
    queryKey: ["canonical-reporting", project.id],
    queryFn: () => fetchCanonicalDashboardSnapshot(project.id),
    enabled,
  });

  const derived = useMemo(() => {
    if (!query.data) return null;
    const pieces = selectActionableLeafPieces(query.data.pieces);
    const projectRollup = rollupCanonicalPieces(pieces);
    const workPackages = rollupCanonicalWorkPackages(
      query.data.workPackages,
      pieces,
      query.data.stations,
      query.data.completions,
    ).map((rollup) => ({
      ...rollup,
      source: query.data!.workPackages.find(
        (workPackage) => workPackage.id === rollup.workPackageId,
      ),
    }));
    const stationBacklog = new Map<string, number>();
    for (const piece of pieces.filter(
      (entry) =>
        entry.lifecycle_status === "not_started" ||
        entry.lifecycle_status === "in_fabrication",
    )) {
      const station = piece.current_station ?? "not_started";
      stationBacklog.set(
        station,
        (stationBacklog.get(station) ?? 0) + Number(piece.quantity),
      );
    }
    const legacyPieceCount = query.data.legacyProduction.reduce(
      (total, row) => total + (Number(row.quantity) || 0),
      0,
    );
    const legacyTons = query.data.legacyProduction.reduce(
      (total, row) =>
        total +
        (row.weight == null
          ? 0
          : (Number(row.weight) * (Number(row.quantity) || 1)) / 2000),
      0,
    );
    return {
      projectRollup,
      workPackages,
      stationBacklog,
      legacyPieceCount,
      legacyTons,
    };
  }, [query.data]);

  if (!enabled) return null;
  if (query.isLoading) {
    return (
      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Loading canonical piece reporting...
      </section>
    );
  }
  if (query.error || !derived) {
    return (
      <section className="mb-5 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Canonical reporting unavailable: {(query.error as Error)?.message}
      </section>
    );
  }

  const { projectRollup } = derived;
  const erectedTons = projectRollup.tonsByLifecycle.erected ?? 0;
  const percentErected =
    projectRollup.knownTons > 0
      ? (erectedTons / projectRollup.knownTons) * 100
      : null;
  const upcomingShips = derived.workPackages
    .filter((row) => row.plannedShipDate)
    .sort((left, right) =>
      String(left.plannedShipDate).localeCompare(String(right.plannedShipDate)),
    )
    .slice(0, 8);
  const shadowPieceDelta =
    projectRollup.pieceCount - derived.legacyPieceCount;
  const shadowTonsDelta = projectRollup.knownTons - derived.legacyTons;

  return (
    <section className="mb-5 space-y-4 rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#eef6f5_55%,#fff7ed_100%)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Boxes className="h-5 w-5 text-teal-700" />
            Canonical Piece Control
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Active actionable leaf lots only. Unknown weights are reported separately.
          </p>
        </div>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
          {mode} mode
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total pieces", value: fmt.format(projectRollup.pieceCount), Icon: Boxes },
          { label: "Known tonnage", value: fmt.format(projectRollup.knownTons), Icon: Weight },
          { label: "Erected tons", value: fmt.format(erectedTons), Icon: Factory },
          {
            label: "Erected by tons",
            value: percentErected === null ? "Unknown" : `${percentErected.toFixed(1)}%`,
            Icon: Factory,
          },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="rounded-xl border border-white/80 bg-white/85 p-4">
            <Icon className="h-4 w-4 text-teal-700" />
            <div className="mt-3 text-2xl font-black text-slate-900">{value}</div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {label}
            </div>
          </div>
        ))}
      </div>

      {projectRollup.unknownWeightLotCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          {projectRollup.unknownWeightLotCount} lot(s), representing{" "}
          {fmt.format(projectRollup.unknownWeightPieceCount)} pieces, have incomplete weight
          and are excluded from tonnage percentages.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl bg-white p-4">
          <h3 className="font-black text-slate-900">Tonnage by lifecycle</h3>
          <div className="mt-4 space-y-2">
            {CANONICAL_LIFECYCLES.map((status) => {
              const tons = projectRollup.tonsByLifecycle[status] ?? 0;
              const width =
                projectRollup.knownTons > 0
                  ? (tons / projectRollup.knownTons) * 100
                  : 0;
              return (
                <div key={status} className="grid grid-cols-[120px_1fr_70px] items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700">
                    {pieceLifecycleLabel(status)}
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-600" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-right text-slate-500">{fmt.format(tons)} t</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl bg-white p-4">
          <h3 className="font-black text-slate-900">Production backlog by station</h3>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...derived.stationBacklog.entries()].map(([station, count]) => (
              <div key={station} className="rounded-lg bg-slate-50 p-3">
                <div className="text-lg font-black text-slate-900">{fmt.format(count)}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {station.replaceAll("_", " ")}
                </div>
              </div>
            ))}
            {derived.stationBacklog.size === 0 && (
              <p className="col-span-full text-sm text-slate-500">No fabrication backlog.</p>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white p-4">
        <h3 className="font-black text-slate-900">Canonical work packages</h3>
        <table className="mt-3 min-w-[760px] w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="pb-2">Work package</th>
              <th className="pb-2">Derived status</th>
              <th className="pb-2 text-right">Pieces</th>
              <th className="pb-2 text-right">Known tons</th>
              <th className="pb-2 text-right">Fab earned</th>
              <th className="pb-2">Planned ship</th>
            </tr>
          </thead>
          <tbody>
            {derived.workPackages.map((row) => (
              <tr key={row.workPackageId} className="border-t border-slate-100">
                <td className="py-2 font-semibold">
                  {row.source?.wp_number || row.source?.name || row.workPackageId}
                </td>
                <td className="py-2">{row.derivedStatus}</td>
                <td className="py-2 text-right">{fmt.format(row.pieceCount)}</td>
                <td className="py-2 text-right">{fmt.format(row.knownTons)}</td>
                <td className="py-2 text-right">
                  {row.earnedFabricationPercent == null
                    ? "Unknown"
                    : `${row.earnedFabricationPercent.toFixed(1)}%`}
                </td>
                <td className="py-2">{row.plannedShipDate || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl bg-white p-4">
          <div className="flex items-center gap-2 font-black text-slate-900">
            <CalendarClock className="h-4 w-4" />
            Upcoming ships
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {upcomingShips.map((row) => (
              <div key={row.workPackageId} className="flex justify-between rounded-lg bg-slate-50 p-2">
                <span>{row.source?.wp_number || row.source?.name || row.workPackageId}</span>
                <span className="font-semibold">{row.plannedShipDate}</span>
              </div>
            ))}
            {upcomingShips.length === 0 && (
              <p className="text-slate-500">No planned ship dates recorded.</p>
            )}
          </div>
        </div>

        {mode === "shadow" && (
          <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 p-4">
            <h3 className="font-black text-amber-950">Shadow comparison</h3>
            <p className="mt-1 text-xs text-amber-800">
              Legacy values remain authoritative during pilot comparison.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase text-amber-700">Piece delta</div>
                <div className="text-xl font-black">{fmt.format(shadowPieceDelta)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-amber-700">Tonnage delta</div>
                <div className="text-xl font-black">{fmt.format(shadowTonsDelta)} t</div>
              </div>
            </div>
            {(Math.abs(shadowPieceDelta) >= 1 || Math.abs(shadowTonsDelta) >= 0.1) && (
              <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                Meaningful canonical/legacy discrepancy requires review.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
