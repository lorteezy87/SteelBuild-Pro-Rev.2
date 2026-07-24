import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, CalendarClock, Factory, Weight } from "lucide-react";
import { DecisionPanel, Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
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
  onOpenRegister?: () => void;
}

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function workPackageTone(status: string): PillTone {
  if (["Complete", "Delivered", "Fabrication Complete"].includes(status)) return "good";
  if (["Erection", "Shipping", "In Fabrication"].includes(status)) return "info";
  if (status === "Ready for Release") return "warn";
  return "neutral";
}

function stationLabel(station: string): string {
  return station.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CanonicalPieceDashboard({
  project,
  onOpenRegister,
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
      <section className="cmd-panel" role="status" aria-live="polite">
        <div className="cmd-panel__body" style={{ padding: 16 }}>
          <span className="cmd-row__meta">Loading Piece Register reporting…</span>
        </div>
      </section>
    );
  }
  if (query.error || !derived) {
    return (
      <section className="cmd-panel" role="alert">
        <div className="cmd-panel__body" style={{ padding: 16, color: "var(--cmd-danger-text, #b42318)" }}>
          Piece Register reporting unavailable: {(query.error as Error | null)?.message || "No reporting data returned."}
        </div>
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
  const shadowPieceDelta = projectRollup.pieceCount - derived.legacyPieceCount;
  const shadowTonsDelta = projectRollup.knownTons - derived.legacyTons;
  const modeTone: PillTone = mode === "shadow" ? "warn" : "good";
  const kpis = [
    {
      label: "Total pieces",
      value: fmt.format(projectRollup.pieceCount),
      sublabel: `${fmt.format(projectRollup.lotCount)} actionable lots`,
      Icon: Boxes,
      tone: "info",
    },
    {
      label: "Known tonnage",
      value: fmt.format(projectRollup.knownTons),
      sublabel: "tons with complete weight",
      Icon: Weight,
      tone: "neutral",
    },
    {
      label: "Erected tons",
      value: fmt.format(erectedTons),
      sublabel: "canonical erected scope",
      Icon: Factory,
      tone: "good",
    },
    {
      label: "Erected by tons",
      value: percentErected === null ? "Unknown" : `${percentErected.toFixed(1)}%`,
      sublabel: "known-weight scope only",
      Icon: Factory,
      tone: percentErected != null && percentErected >= 75 ? "good" : "warn",
    },
  ] as const;

  return (
    <DecisionPanel title="Piece Register" onViewAll={onOpenRegister}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
        <div
          className="cmd-row"
          style={{
            borderTop: 0,
            padding: "0 0 4px",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="cmd-row__num">Canonical production control</div>
            <div className="cmd-row__meta" style={{ marginTop: 3 }}>
              Active actionable leaf lots only. Unknown weights are reported separately.
            </div>
          </div>
          <Pill tone={modeTone}>{mode.toUpperCase()} MODE</Pill>
        </div>

        <div
          className="cmd-kpi-strip"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
        >
          {kpis.map(({ label, value, sublabel, Icon, tone }) => (
            <div
              key={label}
              className={`cmd-kpi${tone === "neutral" ? "" : ` cmd-kpi--${tone}`}`}
            >
              <div className="cmd-kpi__icon">
                <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
              </div>
              <div className="cmd-kpi__value">{value}</div>
              <div className="cmd-kpi__label">{label}</div>
              <div className="cmd-kpi__sub">{sublabel}</div>
            </div>
          ))}
        </div>

        {projectRollup.unknownWeightLotCount > 0 && (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 9,
              padding: "10px 12px",
              border: "1px solid #f5dca6",
              borderRadius: 10,
              background: "#fffbeb",
              color: "var(--cmd-warn-text, #93540b)",
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" style={{ flex: "0 0 auto", marginTop: 1 }} />
            <span>
              {projectRollup.unknownWeightLotCount} lot(s), representing{" "}
              {fmt.format(projectRollup.unknownWeightPieceCount)} pieces, have incomplete weight and
              are excluded from tonnage percentages.
            </span>
          </div>
        )}

        <div
          className="cmd-panels"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
        >
          <DecisionPanel title="Tonnage by lifecycle">
            {CANONICAL_LIFECYCLES.map((status) => {
              const tons = projectRollup.tonsByLifecycle[status] ?? 0;
              const width = projectRollup.knownTons > 0
                ? Math.min(100, Math.max(0, (tons / projectRollup.knownTons) * 100))
                : 0;
              return (
                <div
                  key={status}
                  className="cmd-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(104px, 1fr) minmax(90px, 2fr) 64px",
                  }}
                >
                  <span className="cmd-row__meta" style={{ color: "var(--cmd-text, #1b2430)" }}>
                    {pieceLifecycleLabel(status)}
                  </span>
                  <span
                    aria-label={`${pieceLifecycleLabel(status)} ${width.toFixed(1)} percent of known tons`}
                    style={{
                      display: "block",
                      height: 8,
                      overflow: "hidden",
                      borderRadius: 999,
                      background: "#eef1f5",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        width: `${width}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: status === "erected" ? "var(--cmd-good)" : "var(--cmd-info)",
                      }}
                    />
                  </span>
                  <strong style={{ textAlign: "right", fontSize: 12, color: "var(--cmd-text)" }}>
                    {fmt.format(tons)} t
                  </strong>
                </div>
              );
            })}
          </DecisionPanel>

          <DecisionPanel title="Production backlog by station">
            {[...derived.stationBacklog.entries()].map(([station, count]) => (
              <div className="cmd-row" key={station}>
                <span className="cmd-row__meta" style={{ color: "var(--cmd-text, #1b2430)" }}>
                  {stationLabel(station)}
                </span>
                <strong className="cmd-row__num">{fmt.format(count)}</strong>
              </div>
            ))}
            {derived.stationBacklog.size === 0 && (
              <div className="cmd-row__meta" style={{ padding: "10px 0" }}>
                No fabrication backlog.
              </div>
            )}
          </DecisionPanel>
        </div>

        <div className="cmd-table-wrap">
          <table className="cmd-table">
            <thead>
              <tr>
                <th>Work package</th>
                <th>Derived status</th>
                <th style={{ textAlign: "right" }}>Pieces</th>
                <th style={{ textAlign: "right" }}>Known tons</th>
                <th style={{ textAlign: "right" }}>Fab earned</th>
                <th>Planned ship</th>
              </tr>
            </thead>
            <tbody>
              {derived.workPackages.map((row) => (
                <tr key={row.workPackageId}>
                  <td>
                    <strong>{row.source?.wp_number || row.source?.name || row.workPackageId}</strong>
                  </td>
                  <td><Pill tone={workPackageTone(row.derivedStatus)}>{row.derivedStatus}</Pill></td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmt.format(row.pieceCount)}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmt.format(row.knownTons)}
                  </td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {row.earnedFabricationPercent == null
                      ? "Unknown"
                      : `${row.earnedFabricationPercent.toFixed(1)}%`}
                  </td>
                  <td>{row.plannedShipDate || "—"}</td>
                </tr>
              ))}
              {derived.workPackages.length === 0 && (
                <tr>
                  <td className="cmd-table__empty" colSpan={6}>No canonical work packages.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          className="cmd-panels"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
        >
          <DecisionPanel title="Upcoming ships">
            {upcomingShips.map((row) => (
              <div className="cmd-row" key={row.workPackageId}>
                <span>
                  <span className="cmd-row__num">
                    {row.source?.wp_number || row.source?.name || row.workPackageId}
                  </span>
                  {row.source?.wp_number && row.source?.name && (
                    <span className="cmd-row__meta" style={{ display: "block", marginTop: 2 }}>
                      {row.source.name}
                    </span>
                  )}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <CalendarClock size={14} aria-hidden="true" style={{ color: "var(--cmd-info)" }} />
                  <strong style={{ fontSize: 12, color: "var(--cmd-text)" }}>{row.plannedShipDate}</strong>
                </span>
              </div>
            ))}
            {upcomingShips.length === 0 && (
              <div className="cmd-row__meta" style={{ padding: "10px 0" }}>
                No planned ship dates recorded.
              </div>
            )}
          </DecisionPanel>

          {mode === "shadow" && (
            <DecisionPanel title="Shadow comparison">
              <div className="cmd-row__meta" style={{ padding: "4px 0 8px" }}>
                Legacy values remain authoritative during pilot comparison.
              </div>
              <div className="cmd-row">
                <span className="cmd-row__meta">Piece delta</span>
                <strong className="cmd-row__num">{fmt.format(shadowPieceDelta)}</strong>
              </div>
              <div className="cmd-row">
                <span className="cmd-row__meta">Tonnage delta</span>
                <strong className="cmd-row__num">{fmt.format(shadowTonsDelta)} t</strong>
              </div>
              {(Math.abs(shadowPieceDelta) >= 1 || Math.abs(shadowTonsDelta) >= 0.1) && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    marginTop: 8,
                    color: "var(--cmd-warn-text, #93540b)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <AlertTriangle size={15} aria-hidden="true" style={{ flex: "0 0 auto" }} />
                  Meaningful canonical/legacy discrepancy requires review.
                </div>
              )}
            </DecisionPanel>
          )}
        </div>
      </div>
    </DecisionPanel>
  );
}
