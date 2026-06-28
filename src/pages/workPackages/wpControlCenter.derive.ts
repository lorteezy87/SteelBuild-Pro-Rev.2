/**
 * Pure derivations for the Work Package Control Center (command_ui skin).
 * No React, no network. Wraps the already-computed `metrics` object from
 * analytics.js — does NOT recompute buildWorkPackageMetrics.
 */
import type { PillTone } from "@/components/command";
import { sortWorkPackagesForExecution } from "./analytics";

// ---------------------------------------------------------------------------
// Tone maps
// ---------------------------------------------------------------------------

/** Map a work-package status string to a Pill tone. */
export function wpStatusTone(status?: string | null): PillTone {
  switch (status) {
    case "Complete":     return "good";
    case "In Progress":  return "info";
    case "On Hold":      return "warn";
    case "Not Started":  return "neutral";
    default:             return "neutral";
  }
}

/** Map a risk string from _signals.risk to a Pill tone. */
export function riskTone(risk?: string): PillTone {
  switch (risk) {
    case "high":   return "danger";
    case "medium": return "warn";
    default:       return "neutral";
  }
}

// ---------------------------------------------------------------------------
// Panel shapes
// ---------------------------------------------------------------------------

/** A single enriched work-package row (analytics output + _signals). */
export interface EnrichedWp {
  id: string;
  wp_number?: string | null;
  name?: string | null;
  phase?: string | null;
  status?: string | null;
  tonnage?: number | null;
  percent_complete?: number | null;
  scheduled_end_date?: string | null;
  crew?: string | null;
  _signals: {
    phase: string;
    status: string;
    progress: number;
    complete: boolean;
    overdue: boolean;
    risk: string;
    readinessScore: number;
    hourBurn: number;
    totalBudgetHours: number;
    totalActualHours: number;
    flags: Array<{ key: string; label: string; severity: string }>;
    drawing: {
      linkedCount: number;
      approvedCount: number;
      hasAny: boolean;
      hasApproved: boolean;
    };
  };
  [key: string]: unknown;
}

/** A single phase-rollup row from analytics. */
export interface PhaseRollupRow {
  phase: string;
  count: number;
  tons: number;
  progress: number;
  highRisk: number;
  mediumRisk: number;
}

/** The metrics object returned by buildWorkPackageMetrics. */
export interface WpMetrics {
  enriched: EnrichedWp[];
  totalCount: number;
  totalTons: number;
  progress: number;
  totalBudgetHours: number;
  totalActualHours: number;
  laborBurn: number;
  phaseRollup: PhaseRollupRow[];
  highRisk: EnrichedWp[];
  mediumRisk: EnrichedWp[];
  onHold: EnrichedWp[];
  drawingGaps: EnrichedWp[];
  overdue: EnrichedWp[];
  readyForFab: EnrichedWp[];
  readyForShip: EnrichedWp[];
  fieldReady: EnrichedWp[];
}

export interface WpPanels {
  /** Top high-risk packages sorted by execution priority, capped at 8. */
  workQueue: EnrichedWp[];
  /** Packages with readiness >= 80, not high-risk, not in Erection, not complete, capped at 8. */
  readyToAdvance: EnrichedWp[];
  /** Packages over labor budget or overdue, capped at 8. */
  atRisk: EnrichedWp[];
  /** All four phase rollup rows, unchanged from analytics. */
  phaseRail: PhaseRollupRow[];
}

/**
 * Derive the four panels used by WpControlCenter from the already-computed
 * analytics metrics. Does not re-run buildWorkPackageMetrics.
 */
export function buildWpPanels(metrics: WpMetrics): WpPanels {
  const workQueue = [...metrics.highRisk]
    .sort(sortWorkPackagesForExecution)
    .slice(0, 8) as EnrichedWp[];

  const readyToAdvance = metrics.enriched
    .filter(
      (w) =>
        (w._signals?.readinessScore ?? 0) >= 80 &&
        w._signals?.risk !== "high" &&
        w._signals?.phase !== "Erection" &&
        !w._signals?.complete,
    )
    .slice(0, 8);

  const atRisk = metrics.enriched
    .filter(
      (w) =>
        (w._signals?.hourBurn ?? 0) > 100 || w._signals?.overdue,
    )
    .slice(0, 8);

  return {
    workQueue,
    readyToAdvance,
    atRisk,
    phaseRail: metrics.phaseRollup,
  };
}
