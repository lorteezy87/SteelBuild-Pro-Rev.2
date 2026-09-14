import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DecisionPanel } from "@/components/command";
import { useCanonicalReportingRealtime } from "@/hooks/useCanonicalReportingRealtime";
import { fetchCanonicalDashboardSnapshot } from "@/lib/pieceControl/canonicalDashboardRepository";
import {
  buildPieceControlShadowComparison,
  buildPieceControlSummary,
  modePresentation,
  normalizePieceControlMode,
} from "@/lib/pieceControl/presentation";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { PieceAttentionPanel } from "./PieceAttentionPanel";
import { PieceControlModeBadge } from "./PieceControlModeBadge";
import { PieceLifecycleStrip } from "./PieceLifecycleStrip";

interface PieceControlDashboardPanelProps {
  project: {
    id: string;
    piece_control_mode?: string | null;
  };
  onOpen: () => void;
}

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function PieceControlDashboardPanel({
  project,
  onOpen,
}: PieceControlDashboardPanelProps) {
  const mode = normalizePieceControlMode(project.piece_control_mode);
  const enabled = mode !== "off";

  useCanonicalReportingRealtime(enabled ? project.id : undefined);

  const query = useQuery({
    queryKey: ["canonical-reporting", project.id],
    queryFn: () => fetchCanonicalDashboardSnapshot(project.id),
    enabled,
  });

  const summary = useMemo(
    () => buildPieceControlSummary(query.data?.pieces),
    [query.data?.pieces],
  );
  const shadowComparison = useMemo(() => {
    if (mode !== "shadow" || !query.data) return null;
    return buildPieceControlShadowComparison(
      query.data.pieces,
      query.data.legacyProduction,
    );
  }, [mode, query.data]);

  if (!enabled) return null;

  if (query.isLoading) {
    return (
      <DecisionPanel
        title="Piece Control"
        onViewAll={onOpen}
        viewAllLabel="Open Piece Register"
      >
        <div className="piece-control-command piece-dashboard-panel">
          <span className="cmd-row__meta">Loading piece reporting...</span>
        </div>
      </DecisionPanel>
    );
  }

  if (query.error) {
    return (
      <DecisionPanel
        title="Piece Control"
        onViewAll={onOpen}
        viewAllLabel="Open Piece Register"
      >
        <div className="piece-control-command piece-dashboard-panel">
          <span className="cmd-row__meta">
            {presentPieceControlError(
              query.error,
              "Piece reporting is unavailable.",
            )}
          </span>
          <button
            type="button"
            className="cmd-btn cmd-btn--secondary"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </div>
      </DecisionPanel>
    );
  }

  const exceptionCount = summary.attention.reduce(
    (total, item) => total + item.count,
    0,
  );
  const metrics = [
    { label: "Total pieces", value: numberFormat.format(summary.totalPieces) },
    { label: "Known tons", value: numberFormat.format(summary.knownTons) },
    {
      label: "In fabrication",
      value: numberFormat.format(summary.inFabricationPieces),
    },
    {
      label: "Ready to ship",
      value: numberFormat.format(summary.readyToShipPieces),
    },
    { label: "Exceptions", value: numberFormat.format(exceptionCount) },
  ];

  return (
    <DecisionPanel
      title="Piece Control"
      onViewAll={onOpen}
      viewAllLabel="Open Piece Register"
    >
      <div className="piece-control-command piece-dashboard-panel">
        <PieceControlModeBadge presentation={modePresentation(mode)} />
        <div className="piece-dashboard-panel__metrics">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
        {shadowComparison ? (
          <div className="cmd-row" role="status">
            <div>
              <strong>Existing production records differ</strong>
              <div className="cmd-row__meta">
                <span>
                  {shadowComparison.pieceDelta > 0 ? "+" : ""}
                  {numberFormat.format(shadowComparison.pieceDelta)} pieces
                </span>
                {" · "}
                <span>
                  {shadowComparison.tonsDelta > 0 ? "+" : ""}
                  {shadowComparison.tonsDelta.toFixed(2)} tons
                </span>
                {" in the Piece Register"}
              </div>
            </div>
          </div>
        ) : null}
        {summary.totalPieces === 0 ? (
          <button
            type="button"
            className="cmd-btn cmd-btn--primary"
            onClick={onOpen}
          >
            Import pieces
          </button>
        ) : (
          <div className="piece-dashboard-panel__body">
            <PieceLifecycleStrip
              items={summary.lifecycle}
              totalPieces={summary.totalPieces}
            />
            <PieceAttentionPanel
              items={summary.attention}
              emptyMessage="No piece exceptions."
              onSelect={() => onOpen()}
            />
          </div>
        )}
      </div>
    </DecisionPanel>
  );
}
