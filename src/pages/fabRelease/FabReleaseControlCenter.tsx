/**
 * Canonical command shell for the Fab Release page.
 *
 * FabRelease.tsx remains the owner of queries, mutations, permission gates,
 * allocator behavior, audit logging, and cache invalidation. This component
 * owns the shared presentation and composes the active shop workflow.
 */
import { useMemo, useRef } from "react";
import type { ReactNode } from "react";
import "@/styles/command.css";
import { AttentionQueue, OperationalSummary, PageHeader, StatusBadge, useCommandSkin } from "@/components/command";
import type { AttentionItem } from "@/components/command";
import { buildFabReleaseSummary, releaseBlockerSummary } from "./fabReleaseControlCenter.derive";
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
  onOpenGate: (wp: EnrichedWorkPackage) => void;
  gateRefreshing: boolean;
  unavailableGateCount: number;
  refreshRequiredCount: number;
  deferredGateCount: number;
  verificationDisabled: boolean;
  onRefreshGates: () => void;
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
  onOpenGate,
  gateRefreshing,
  unavailableGateCount,
  refreshRequiredCount,
  deferredGateCount,
  verificationDisabled,
  onRefreshGates,
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
  const unverifiedCount = summary.totalCount - summary.verifiedCount;
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
    nextAction: "Review release checks",
    tone: "danger",
    onOpen: () => onOpenGate(wp),
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
        subtitle="Fabrication release status verified against current drawing, material, and hold checks. Unverified packages stay separate."
        meta={`${summary.totalCount} ${summary.totalCount === 1 ? "package" : "packages"} · ${summary.releasedCount} verified releases · ${summary.blockedCount} verified blockers · ${unverifiedCount} unverified`}
        actions={(
          <>
            <button
              type="button"
              className="cmd-btn cmd-btn--ghost"
              onClick={() => {
                onStageFilter("all");
                onRiskFilter("release-ready");
                scrollToBody();
              }}
            >
              Ready to Release
            </button>
            <button
              type="button"
              className="cmd-btn cmd-btn--ghost"
              onClick={() => {
                onRiskFilter("release-blocked");
                scrollToBody();
              }}
            >
              Blocked
            </button>
            <button type="button" className="cmd-btn cmd-btn--ghost" disabled={gateRefreshing || verificationDisabled} onClick={onRefreshGates}>
              {gateRefreshing ? "Checking…" : "Refresh release checks"}
            </button>
          </>
        )}
      />

      {unavailableGateCount > 0 && (
        <div role="alert" className="sbp-attention__empty">
          {unavailableGateCount} release {unavailableGateCount === 1 ? "check is" : "checks are"} unavailable. Refresh release checks to verify those packages.
        </div>
      )}
      {refreshRequiredCount > 0 && (
        <div role="status" className="sbp-attention__empty">
          Release checks need refreshing for {refreshRequiredCount} packages. Their status is unverified until refreshed.
        </div>
      )}
      {verificationDisabled && (
        <div role="status" className="sbp-attention__empty">
          Release verification is unavailable because Piece Control is off for this project. Enable it in project settings to verify package releases.
        </div>
      )}
      {deferredGateCount > 0 && !verificationDisabled && (
        <div role="status" className="sbp-attention__empty">
          {deferredGateCount} packages remain unchecked in this view. Open a package’s release checks in Work Packages for its current status.
        </div>
      )}

      <OperationalSummary metrics={operationalMetrics} ariaLabel="Fab release operational summary" />

      <AttentionQueue
        title="Release Blockers"
        items={releaseBlockers}
        emptyMessage={summary.coverageComplete ? "No packages are currently blocked by release checks." : "No blockers among packages with completed release checks; some packages remain unverified."}
      />

      <div className="sbp-work-grid">
        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Ready to Release</h2>
            <span className="cmd-row__meta">{summary.readyQueue.length} queued</span>
          </div>
          <div>
            {summary.readyQueue.length === 0 ? (
              <div className="sbp-attention__empty">{summary.coverageComplete ? "No packages ready for release." : "No verified-ready packages in the checked scope; some packages remain unverified."}</div>
            ) : summary.readyQueue.map((wp) => (
              <button
                type="button"
                key={wp.id}
                className="cmd-row is-clickable"
                onClick={() => onOpenGate(wp)}
                style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }}
              >
                <div>
                  <div className="cmd-row__num">{wp.wp_number || "WP"}</div>
                  <div className="cmd-row__meta">{wp.name || wp.description || "Unnamed"}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <StatusBadge
                    label="Release verified"
                    tone="success"
                  />
                  <span className="cmd-row__meta">{fmtTons(wp.tonnage)}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="sbp-work-panel">
          <div className="sbp-work-panel__head">
            <h2>Verified Release Records</h2>
            <button
              type="button"
              className="cmd-btn cmd-btn--ghost"
              onClick={() => {
                onStageFilter("all");
                onRiskFilter("release-released");
                scrollToBody();
              }}
            >
              View released
            </button>
          </div>
          <div>
            {summary.recentlyReleased.length === 0 ? (
              <div className="sbp-attention__empty">{summary.coverageComplete ? "No release records found." : "No release records in the checked scope; some packages remain unverified."}</div>
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
                  <StatusBadge label="Release recorded" tone="success" />
                  <span className="cmd-row__meta">
                    {wp.released_date ? `WP stamp ${formatDate(wp.released_date as string)}` : "WP stamp unknown"}
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
