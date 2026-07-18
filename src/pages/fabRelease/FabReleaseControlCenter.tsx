/**
 * Canonical command shell for the Fab Release page.
 *
 * FabRelease.tsx remains the owner of queries, mutations, permission gates,
 * allocator behavior, audit logging, and cache invalidation. This component
 * owns the shared presentation and composes the active shop workflow.
 */
import { useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Factory, AlertTriangle, CheckCircle2, Layers, Clock, Flame } from "lucide-react";
import "@/styles/command.css";
import { PageHero, KpiStrip, DecisionPanel, Pill, useCommandSkin } from "@/components/command";
import type { KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import { buildFabReleaseSummary, riskTone, stageTone, stageLabel } from "./fabReleaseControlCenter.derive";
import type { EnrichedWorkPackage, FabMetrics } from "./types";
import { formatDate } from "./format";

function fmtTons(n: number | string | undefined): string {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `${v.toFixed(1)}T` : "-";
}

function readinessPill(score: number) {
  const tone = score >= 80 ? "good" : score >= 50 ? "warn" : "danger";
  return <Pill tone={tone}>{score}%</Pill>;
}

function topBlockerLabel(wp: EnrichedWorkPackage): string {
  const high = wp._signals.flags.filter((f) => f.severity === "high");
  if (high.length > 0) return high[0].label;
  const med = wp._signals.flags.filter((f) => f.severity === "medium");
  if (med.length > 0) return med[0].label;
  return "-";
}

export interface FabReleaseControlCenterProps {
  projectName: string;
  metrics: FabMetrics;
  stageFilter: string;
  onStageFilter: (value: string) => void;
  riskFilter: string;
  onRiskFilter: (value: string) => void;
  onOpenWP: (wp: EnrichedWorkPackage) => void;
  toolbar: ReactNode;
  sequenceFilter?: ReactNode;
  stageFlow?: ReactNode;
  exceptionRail?: ReactNode;
  viewHeader?: ReactNode;
  workflowBody?: ReactNode;
  emptyState?: ReactNode;
}

export default function FabReleaseControlCenter({
  projectName,
  metrics,
  stageFilter,
  onStageFilter,
  riskFilter,
  onRiskFilter,
  onOpenWP,
  toolbar,
  sequenceFilter,
  stageFlow,
  exceptionRail,
  viewHeader,
  workflowBody,
  emptyState,
}: FabReleaseControlCenterProps) {
  useCommandSkin();
  const summary = useMemo(() => buildFabReleaseSummary(metrics), [metrics]);
  const bodyRef = useRef<HTMLElement | null>(null);
  const scrollToBody = () => bodyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const heroChips = [
    { label: `${summary.totalCount} Packages` },
    { label: `${summary.releasedCount} Released`, tone: "good" as const },
    { label: `${summary.blockedCount} Blocked` },
  ];

  const kpiCells: KpiCellDef[] = summary.kpis.map((kpi, index) => ({
    label: kpi.label,
    value: kpi.value,
    sublabel: kpi.sublabel,
    tone: kpi.tone,
    Icon: [Factory, CheckCircle2, AlertTriangle, Flame, Layers, Clock][index],
  }));

  return (
    <div className="fab-cc">
      <PageHero
        Icon={Factory}
        title="Fab Release Control Center"
        subtitle="Track shop release readiness, clear blockers, and move steel packages through fabrication."
        projectName={projectName}
        chips={heroChips}
        photoSrc={photoFor("FabRelease") ?? undefined}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        <DecisionPanel
          title="Ready to Release"
          onViewAll={() => {
            onStageFilter("all");
            onRiskFilter("clear");
            scrollToBody();
          }}
        >
          {summary.readyQueue.length === 0 ? (
            <div className="cmd-row__meta">No packages ready for release.</div>
          ) : summary.readyQueue.map((wp) => (
            <div key={wp.id} className="cmd-row is-clickable" onClick={() => onOpenWP(wp)}>
              <div>
                <div className="cmd-row__num">{wp.wp_number || "WP"}</div>
                <div className="cmd-row__meta">{wp.name || wp.description || "Unnamed"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {readinessPill(wp._signals.readinessScore)}
                <span className="cmd-row__meta">{fmtTons(wp.tonnage)}</span>
              </div>
            </div>
          ))}
        </DecisionPanel>

        <DecisionPanel
          title="Blocked (RFI / Approval)"
          onViewAll={() => {
            onRiskFilter("high");
            scrollToBody();
          }}
        >
          {summary.blockedQueue.length === 0 ? (
            <div className="cmd-row__meta">No packages blocked.</div>
          ) : summary.blockedQueue.map((wp) => (
            <div key={wp.id} className="cmd-row is-clickable" onClick={() => onOpenWP(wp)}>
              <div>
                <div className="cmd-row__num">{wp.wp_number || "WP"}</div>
                <div className="cmd-row__meta">{topBlockerLabel(wp)}</div>
              </div>
              <Pill tone={riskTone(wp._signals.risk)}>
                {wp._signals.risk === "high" ? "Exception" : "Warning"}
              </Pill>
            </div>
          ))}
        </DecisionPanel>

        <DecisionPanel
          title="Recently Released"
          onViewAll={() => {
            onStageFilter("shop_released");
            scrollToBody();
          }}
        >
          {summary.recentlyReleased.length === 0 ? (
            <div className="cmd-row__meta">No packages released yet.</div>
          ) : summary.recentlyReleased.map((wp) => (
            <div key={wp.id} className="cmd-row is-clickable" onClick={() => onOpenWP(wp)}>
              <div>
                <div className="cmd-row__num">{wp.wp_number || "WP"}</div>
                <div className="cmd-row__meta">{wp.name || "Unnamed"}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Pill tone={stageTone(wp._signals.stage)}>{stageLabel(wp._signals.stage)}</Pill>
                <span className="cmd-row__meta">
                  {wp.released_date ? formatDate(wp.released_date as string) : "-"}
                </span>
              </div>
            </div>
          ))}
        </DecisionPanel>
      </div>

      {toolbar}
      {sequenceFilter}
      <section ref={bodyRef} className="fab-release-canonical-body">
        {stageFlow}
        {viewHeader}
        <section className="fab-release-layout">
          {exceptionRail}
          <main className="fab-release-main">
            {workflowBody}
            {emptyState}
          </main>
        </section>
      </section>
    </div>
  );
}
