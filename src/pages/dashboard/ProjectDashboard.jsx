/**
 * ProjectDashboard — single-project dashboard, rebuilt against the
 * Claude Design industrial-OS aesthetic.
 *
 * Owns:
 *   1. Project hero card (number, name, status, revised contract,
 *      days remaining, client/GC/contract/phase meta, date rail,
 *      phase pipeline chevron, progress stats, pulse/critical banner).
 *   2. Financial snapshot card on the right (revised contract value,
 *      budget/commits/paid/variance/burn, 6-month spend bar chart).
 *   3. KPI row (4 click-to-filter tiles: Open RFIs / Needs Attention /
 *      WP Progress / Shipments).
 *   4. RFI Aging Analysis card.
 *   5. AI Quick Update Rail (suggested next actions).
 *
 * Props come pre-scoped to the active project from Dashboard.jsx.
 */

import React, { useMemo } from "react";
import {
  Button,
  CommandBar,
  KpiTile,
  PhaseChevron,
  ProgressBar,
  StatusPill,
  Icon,
} from "@/components/design-system";
import { PHASE_HEX } from "@/components/design-system/tokens";
import {
  daysRemaining,
  timelineElapsedPct,
  revisedContractValue,
  budgetCommitted,
  committedCosts,
  costToDate,
  costVariance,
  wpProgressPct,
  totalTons,
  phaseRollup,
  fabProgressPct,
  erectedProgressPct,
  openRFICount,
  overdueRFICount,
  overdueDeliveryCount,
  scheduledDeliveryCount,
  rfiAgingBuckets,
  oldestOpenRFIAgeDays,
  monthlySpendBreakdown,
} from "./projectMetrics";
import FinancialSnapshot from "./FinancialSnapshot";
import AgingCard from "./AgingCard";
import QuickUpdateRail from "./QuickUpdateRail";

const mono = { fontFamily: "var(--font-mono)" };

export default function ProjectDashboard({
  project,
  rfis = [],
  cos = [],
  codes = [],
  wps = [],
  deliveries = [],
  actionItems = [],
  expenses = [],
  onClearProject,
  onNavigate,
}) {
  // Derived metrics
  const daysLeft   = useMemo(() => daysRemaining(project), [project]);
  const timelinePct = useMemo(() => timelineElapsedPct(project), [project]);
  const contractVal = useMemo(() => revisedContractValue(project, cos), [project, cos]);
  const base       = Number(project?.original_contract_value) || 0;
  const budget     = useMemo(() => budgetCommitted(codes), [codes]);
  const committed  = useMemo(() => committedCosts(expenses), [expenses]);
  const paidToDate = useMemo(() => costToDate(expenses), [expenses]);
  const variance   = useMemo(() => costVariance(codes, expenses), [codes, expenses]);
  const burnPct    = budget > 0 ? Math.round((paidToDate / budget) * 100) : 0;
  const monthly    = useMemo(() => monthlySpendBreakdown(expenses), [expenses]);

  const wpPct      = useMemo(() => wpProgressPct(wps), [wps]);
  const tons       = useMemo(() => totalTons(wps), [wps]);
  const fabPct     = useMemo(() => fabProgressPct(wps), [wps]);
  const erectPct   = useMemo(() => erectedProgressPct(wps), [wps]);
  const rollup     = useMemo(() => phaseRollup(wps), [wps]);

  const rfisOpen    = useMemo(() => openRFICount(rfis), [rfis]);
  const rfisOverdue = useMemo(() => overdueRFICount(rfis), [rfis]);
  const delsLate    = useMemo(() => overdueDeliveryCount(deliveries), [deliveries]);
  const delsSched   = useMemo(() => scheduledDeliveryCount(deliveries), [deliveries]);
  const buckets     = useMemo(() => rfiAgingBuckets(rfis), [rfis]);
  const oldestAge   = useMemo(() => oldestOpenRFIAgeDays(rfis), [rfis]);
  const needsAttn   = rfisOverdue + delsLate;

  const health = project?.health_status || "On Track";
  const healthColor =
    health === "At Risk"       ? "var(--status-error)" :
    health === "Watch"         ? "var(--status-warning)" :
                                 "var(--status-success)";

  // Critical pulse: timeline far ahead of progress
  const pulseCritical = timelinePct > 0 && wpPct < timelinePct - 30;

  // Build AI Quick Update Rail suggestions from live data
  const suggestions = useMemo(() => {
    const list = [];
    const overdueRfi = rfis.find(
      (r) => !["Answered", "Closed"].includes(r.status) && r.date_required && new Date(r.date_required) < new Date()
    );
    if (overdueRfi) {
      list.push({
        id: `rfi-${overdueRfi.id}`,
        type: "rfi",
        label: `Nudge BIC on ${overdueRfi.rfi_number || "RFI"}`,
        from: overdueRfi.title?.slice(0, 60) || "Overdue RFI",
        cta: "NUDGE",
      });
    }
    const staleWp = wps.find((w) => w.status === "In Progress" && (Number(w.percent_complete) || 0) < 20);
    if (staleWp) {
      list.push({
        id: `wp-${staleWp.id}`,
        type: "wp",
        label: `Update ${staleWp.wp_number || "WP"} progress`,
        from: staleWp.name?.slice(0, 60) || "Stalled work package",
        cta: "UPDATE",
      });
    }
    const arriving = deliveries.find((d) => d.status === "In Transit");
    if (arriving) {
      list.push({
        id: `del-${arriving.id}`,
        type: "delivery",
        label: `Confirm arrival: ${arriving.vendor || "Load"}`,
        from: `${arriving.description || "Inbound"} · ${arriving.scheduled_date || ""}`,
        cta: "SIGN",
      });
    }
    return list.slice(0, 4);
  }, [rfis, wps, deliveries]);

  // Phase pipeline stages for the hero chevron
  const stages = rollup.phases.map((p) => ({
    id: p,
    label: { Detailing: "DETAIL", Fabrication: "FAB", Delivery: "SHIP", Erection: "ERECT" }[p],
    color: PHASE_HEX[p],
    count: rollup.counts[p],
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Project hero */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderLeft: `3px solid ${pulseCritical ? "var(--status-error)" : healthColor}`,
          borderRadius: "var(--radius-card)",
          padding: "14px 18px",
          display: "grid",
          gridTemplateColumns: "1fr 400px",
          gap: 18,
        }}
      >
        <div>
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 18,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
              {onClearProject && (
                <button
                  onClick={onClearProject}
                  style={{
                    height: 22,
                    padding: "0 8px",
                    borderRadius: 4,
                    background: "var(--bg-surface-low)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-muted)",
                    ...mono,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  ← ALL
                </button>
              )}
              <span
                style={{
                  ...mono,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.06em",
                  flexShrink: 0,
                }}
              >
                {project?.project_number || "—"}
              </span>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 26,
                  fontWeight: 800,
                  margin: 0,
                  color: "var(--text-primary)",
                  letterSpacing: "0.01em",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {project?.name || "Untitled Project"}
              </h1>
              <StatusPill label={health} color={healthColor} />
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.14em" }}>
                REVISED CONTRACT
              </div>
              <div
                style={{
                  ...mono,
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--accent)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ${(contractVal || 0).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 8 }}>
              <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.14em" }}>
                DAYS REMAINING
              </div>
              <div
                style={{
                  ...mono,
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {daysLeft ?? "—"}d
              </div>
            </div>
          </div>

          {/* Meta row */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              ["CLIENT",   project?.client],
              ["GC",       project?.general_contractor],
              ["CONTRACT", project?.contract_type],
              ["PHASE",    project?.phase],
            ].map(([k, v]) => (
              <Meta key={k} label={k} value={v} />
            ))}
          </div>

          {/* Dates row */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 14 }}>
            <Meta label="START"           value={formatDate(project?.start_date)} mono />
            <Meta label="TARGET COMPLETE" value={formatDate(project?.target_completion_date)} mono />
            <Meta label="FORECAST"        value={formatDate(project?.forecast_completion_date)} mono />
          </div>

          {/* Phase pipeline */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                ...mono,
                fontSize: 8,
                color: "var(--text-muted)",
                letterSpacing: "0.16em",
                marginBottom: 8,
              }}
            >
              PROJECT TIMELINE — {timelinePct}% ELAPSED
            </div>
            <PhaseChevron stages={stages} activeIdx={rollup.activeIdx} />
          </div>

          {/* Progress stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <ProgressStat label="FAB"         value={fabPct}   color={PHASE_HEX.Fabrication} />
            <ProgressStat label="ERECTED"     value={erectPct} color={PHASE_HEX.Erection} />
            <ProgressStat label="WP PROGRESS" value={wpPct}    color="var(--accent)" />
          </div>

          {/* Pulse card */}
          {pulseCritical && (
            <div
              style={{
                marginTop: 14,
                background: "rgba(248,81,73,0.06)",
                border: "1px solid rgba(248,81,73,0.30)",
                borderRadius: 8,
                padding: "12px 14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon name="alert" size={13} color="var(--danger)" />
                <div
                  style={{
                    ...mono,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--danger)",
                    letterSpacing: "0.12em",
                  }}
                >
                  AT PROJECT PULSE
                </div>
                <div style={{ flex: 1 }} />
                <StatusPill label="CRITICAL" color="var(--danger)" />
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  lineHeight: 1.5,
                  marginBottom: 10,
                }}
              >
                <span style={{ color: "var(--danger)", fontWeight: 700 }}>CRITICAL:</span>{" "}
                {project?.name} is <b>{timelinePct}%</b> through timeline but only{" "}
                <b>{wpPct}%</b> of work packages are complete. This represents a significant
                schedule risk — verify status with the field team or update work package progress.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button
                  variant="danger"
                  size="sm"
                  icon="arrow"
                  onClick={() => onNavigate?.("work-packages")}
                >
                  UPDATE WP STATUS NOW
                </Button>
                <InlineLabel>TIMELINE {timelinePct}% / PROGRESS {wpPct}%</InlineLabel>
                {needsAttn > 0 && <InlineLabel>{needsAttn} OVERDUE ACTIONS</InlineLabel>}
              </div>
            </div>
          )}
        </div>

        <FinancialSnapshot
          contractValue={contractVal}
          baseContractValue={base}
          budget={budget}
          committed={committed}
          paidToDate={paidToDate}
          variance={variance}
          burnPct={burnPct}
          monthly={monthly}
        />
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <KpiTile
          label="OPEN RFIS"
          value={rfisOpen}
          sub={rfisOverdue > 0 ? `${rfisOverdue} OVERDUE` : `${rfis.length} TOTAL`}
          color="var(--status-warning)"
          icon="rfi"
          onClick={() => onNavigate?.("rfis")}
        />
        <KpiTile
          label="NEEDS ATTENTION"
          value={needsAttn}
          sub={`${rfisOverdue} OVERDUE RFIS + ${delsLate} LATE DELIVERIES`}
          color="var(--status-error)"
          icon="alert"
          onClick={() => onNavigate?.("rfis")}
        />
        <KpiTile
          label="WP PROGRESS"
          value={`${wpPct}%`}
          sub={`${wps.length} PACKAGES · ${tons.toFixed(1)}T`}
          color="var(--accent)"
          icon="wp"
          onClick={() => onNavigate?.("work-packages")}
        />
        <KpiTile
          label="SHIPMENTS"
          value={delsSched}
          sub={`${deliveries.length} TOTAL · TRACK →`}
          color="var(--phase-delivery)"
          icon="delivery"
          onClick={() => onNavigate?.("deliveries")}
        />
      </div>

      {/* Aging + Quick Update row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 10 }}>
        <AgingCard
          buckets={buckets}
          totalOpen={rfisOpen}
          oldestDays={oldestAge}
          onSeeAll={() => onNavigate?.("rfis")}
        />
        <QuickUpdateRail suggestions={suggestions} />
      </div>
    </div>
  );
}

function Meta({ label, value, mono: useMono }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.14em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: useMono ? "var(--font-mono)" : "var(--font-body)",
          fontSize: useMono ? 11 : 12,
          fontWeight: useMono ? 400 : 600,
          color: "var(--text-primary)",
          marginTop: 2,
          fontVariantNumeric: useMono ? "tabular-nums" : undefined,
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function ProgressStat({ label, value, color }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.14em" }}>{label}</div>
        <div
          style={{
            ...mono,
            fontSize: 13,
            fontWeight: 700,
            color,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}%
        </div>
      </div>
      <ProgressBar value={value} color={color} height={4} />
    </div>
  );
}

function InlineLabel({ children }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 9,
        color: "var(--text-muted)",
        letterSpacing: "0.10em",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {children}
    </span>
  );
}

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
