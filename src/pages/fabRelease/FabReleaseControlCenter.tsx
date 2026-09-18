/**
 * Canonical command shell for the Fab Release page.
 *
 * FabRelease.tsx remains the owner of queries, mutations, permission gates,
 * allocator behavior, audit logging, and cache invalidation. This component
 * owns the shared presentation and composes the active shop workflow.
 */
import { useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Factory } from "lucide-react";
import "@/styles/command.css";
import { AttentionQueue, OperationalSummary, PageHeader, StatusBadge, useCommandSkin } from "@/components/command";
import type { AttentionItem } from "@/components/command";
import { buildFabReleaseSummary, releaseBlockerSummary, stageTone, stageLabel } from "./fabReleaseControlCenter.derive";
import type { EnrichedWorkPackage, FabMetrics } from "./types";
import { formatDate } from "./format";

function fmtTons(n: number | string | undefined): string {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `${v.toFixed(1)}T` : "-";
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

  const releaseBlockers: AttentionItem[] = summary.blockedQueue.map((wp) => ({
    id: wp.id,
    issue: `${wp.wp_number || "WP"} · ${wp.name || wp.description || "Unnamed package"}`,
    deadline: wp._signals.scheduledStart
      ? wp._signals.scheduledStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null,
    risk: releaseBlockerSummary(wp),
    owner: wp.crew || null,
    nextAction: "Clear release gate",
    tone: wp._signals.risk === "high" ? "danger" : "warn",
    onOpen: () => onOpenWP(wp),
  }));

  const operationalMetrics = summary.kpis.map((kpi) => ({
    label: kpi.label,
    value: kpi.value,
    sublabel: kpi.sublabel,
    tone: kpi.tone,
  }));

  return (
    <div className="fab-cc sbp-command-page">
      <PageHeader
        eyebrow={`${projectName} / Production`}
        title="Fab Release Control Center"
        subtitle="Authoritative release-gate status for shop packages, blockers, and recent releases."
        meta={`${summary.totalCount} packages · ${summary.releasedCount} released · ${summary.blockedCount} blocked`}
        actions={(
          <>
            <button
              type="button"
              className="cmd-btn cmd-btn--ghost"
              onClick={() => {
                onStageFilter("all");
                onRiskFilter("clear");
                scrollToBody();
              }}
            >
              Ready to Release
            </button>
            <button
              type="button"
              className="cmd-btn cmd-btn--ghost"
              onClick={() => {
                onRiskFilter("high");
                scrollToBody();
              }}
            >
              Blocked
            </button>
          </>
        )}
      />

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Fab release operational summary" />

      <AttentionQueue
        title="Release Blockers"
        items={releaseBlockers}
        emptyMessage="No packages currently have an authoritative release blocker."
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Ready to Release</h2>
            <span className="cmd-row__meta">{summary.readyQueue.length} queued</span>
          </div>
          <div>
            {summary.readyQueue.length === 0 ? (
              <div className="sbp-attention__empty">No packages ready for release.</div>
            ) : summary.readyQueue.map((wp) => (
              <button
                type="button"
                key={wp.id}
                className="cmd-row is-clickable"
                onClick={() => onOpenWP(wp)}
                style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
              >
                <div>
                  <div className="cmd-row__num">{wp.wp_number || "WP"}</div>
                  <div className="cmd-row__meta">{wp.name || wp.description || "Unnamed"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <StatusBadge
                    label={`${wp._signals.readinessScore}% ready`}
                    tone={wp._signals.readinessScore >= 80 ? "success" : wp._signals.readinessScore >= 50 ? "warning" : "danger"}
                  />
                  <span className="cmd-row__meta">{fmtTons(wp.tonnage)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Recently Released</h2>
            <button
              type="button"
              className="cmd-btn cmd-btn--ghost"
              onClick={() => {
                onStageFilter("shop_released");
                scrollToBody();
              }}
            >
              View released
            </button>
          </div>
          <div>
            {summary.recentlyReleased.length === 0 ? (
              <div className="sbp-attention__empty">No packages released yet.</div>
            ) : summary.recentlyReleased.map((wp) => (
              <button
                type="button"
                key={wp.id}
                className="cmd-row is-clickable"
                onClick={() => onOpenWP(wp)}
                style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
              >
                <div>
                  <div className="cmd-row__num">{wp.wp_number || "WP"}</div>
                  <div className="cmd-row__meta">{wp.name || "Unnamed"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <StatusBadge label={stageLabel(wp._signals.stage)} tone={stageTone(wp._signals.stage) === "good" ? "success" : "info"} />
                  <span className="cmd-row__meta">
                    {wp.released_date ? formatDate(wp.released_date as string) : "Date unknown"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
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
