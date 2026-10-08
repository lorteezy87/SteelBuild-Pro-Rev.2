/**
 * Pure derivations for the canonical Fab Release Control Center.
 * No React, no network. Reads outputs of buildFabReleaseMetrics() from
 * analytics.js — never re-derives fab logic here.
 *
 * KPI/queue contract is the source of truth for FabReleaseControlCenter.tsx.
 */
import type { EnrichedWorkPackage, FabMetrics, ReleaseGateState } from "./types";
import type { CanonicalReleaseGate } from "@/lib/pieceControl/releaseRepository";
import { createPageUrl } from "@/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FabTone = "danger" | "warn" | "good" | "neutral" | "info";

export interface FabKpiRow {
  label: string;
  value: string | number;
  sublabel: string;
  tone: FabTone;
}

export interface FabSummary {
  // KPI cells (6)
  kpis: FabKpiRow[];
  // Decision panel queues
  readyQueue: EnrichedWorkPackage[];         // Up to 6: verified passing release checks
  blockedQueue: EnrichedWorkPackage[];       // Up to 6: verified release blockers
  recentlyReleased: EnrichedWorkPackage[];   // Up to 6: recorded releases, sorted by available WP stamp
  // Headline counts (used by hero chips)
  totalCount: number;
  releasedCount: number;            // verified active release records
  readyForReleaseCount: number;
  blockedCount: number;
  inFabCount: number;               // actively in_fabrication
  percentReleased: number;          // releasedTons / totalTons (0–100)
}

export function workPackageReleaseGateUrl(wp: EnrichedWorkPackage, projectId: string): string {
  const params = new URLSearchParams({
    project: String(wp.project_id || projectId),
    id: wp.id,
    tab: "release-gate",
  });
  return `${createPageUrl("WorkPackages")}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Tone helpers
// ---------------------------------------------------------------------------

export function riskTone(risk: string): FabTone {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warn";
  return "good";
}

export function stageTone(stage: string): FabTone {
  switch (stage) {
    case "ready_to_ship":   return "good";
    case "finish_treatment":
    case "fabricated":      return "info";
    case "in_fabrication":
    case "shop_released":   return "neutral";
    case "material_on_hand":return "warn";
    default:                return "neutral";
  }
}

/** Map a fab lane/stage to a human-readable status label for a pill. */
export function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    drawings_approved:  "Drawing Prep",
    material_on_hand:   "Matl Planning",
    shop_released:      "Release Stamp",
    in_fabrication:     "In Fab",
    fabricated:         "Fabricated",
    finish_treatment:   "Finishing",
    ready_to_ship:      "Ship Ready",
  };
  return labels[stage] ?? stage;
}


/**
 * Human-readable release blocker summary derived only from authoritative
 * FabSignals evidence. Presentation must never manufacture gate reasons.
 */
export function releaseBlockerSummary(wp: EnrichedWorkPackage): string {
  const signals = wp._signals;
  if (signals.releaseGateState === "ready") return "Ready for release — verified";
  if (signals.releaseGateState === "released") return "Fabrication release recorded";
  if (signals.releaseGateState === "blocked") {
    const blockers = signals.releaseGate?.blockers?.filter(Boolean) ?? [];
    return blockers.length ? `RELEASE BLOCKED — ${blockers.join(" · ")}` : "RELEASE BLOCKED — review release checks";
  }
  return "Release not verified — open Work Package release checks";
}

function isMatchingGate(gate: CanonicalReleaseGate | null | undefined, packageId: string, projectId: string): gate is CanonicalReleaseGate {
  if (!gate || gate.work_package_id !== packageId || gate.project_id !== projectId) return false;
  if (typeof gate.passes !== "boolean" || typeof gate.already_released !== "boolean" || !Array.isArray(gate.blockers)) return false;
  const checks = gate.checks;
  if (!checks || [checks.scope, checks.drawings, checks.material, checks.holds].some((check) =>
    !check || typeof check.passed !== "boolean" || !Array.isArray(check.blockers))) return false;
  if (gate.passes && (gate.already_released || gate.blockers.length > 0 ||
    [checks.scope, checks.drawings, checks.material, checks.holds].some((check) => !check.passed || check.blockers.length > 0))) return false;
  return true;
}

/** The server result is the only source of Ready/Blocked/Released decisions. */
export function applyCanonicalGateReadout(
  metrics: FabMetrics,
  projectId: string,
  gates: Record<string, CanonicalReleaseGate | null>,
  snapshotComplete: boolean,
): FabMetrics {
  const enriched: EnrichedWorkPackage[] = metrics.enriched.map((wp) => {
    const candidate = snapshotComplete ? gates[wp.id] : null;
    const releaseGate = isMatchingGate(candidate, wp.id, projectId) ? candidate : null;
    const releaseGateState: ReleaseGateState = !releaseGate ? "unverified"
      : releaseGate.already_released ? "released"
      : releaseGate.passes ? "ready" : "blocked";
    return {
      ...wp,
      _signals: {
        ...wp._signals,
        advisoryReadyForRelease: wp._signals.readyForRelease,
        readyForRelease: releaseGateState === "ready",
        releaseGateState,
        releaseGate,
      },
    };
  });
  const byId = new Map(enriched.map((wp) => [wp.id, wp]));
  return {
    ...metrics,
    enriched,
    readyForRelease: enriched.filter((wp) => wp._signals.releaseGateState === "ready"),
    releaseBlocked: enriched.filter((wp) => wp._signals.releaseGateState === "blocked"),
    releasedTons: enriched.filter((wp) => wp._signals.releaseGateState === "released")
      .reduce((sum, wp) => sum + (Number(wp.tonnage) || 0), 0),
    activeShop: metrics.activeShop.map((wp) => byId.get(wp.id) ?? wp),
    readyToShip: metrics.readyToShip.map((wp) => byId.get(wp.id) ?? wp),
    exceptions: metrics.exceptions.map((wp) => byId.get(wp.id) ?? wp),
    warnings: metrics.warnings.map((wp) => byId.get(wp.id) ?? wp),
  };
}

// ---------------------------------------------------------------------------
// Core derivation
// ---------------------------------------------------------------------------

/**
 * Build all KPIs + panel queues from the analytics output.
 *
 * Accepts either the full FabMetrics object (from buildFabReleaseMetrics)
 * or just the enriched array — the overloaded signature handles both shapes
 * so the Control Center shell can pass the pre-computed metrics directly.
 */
export function buildFabReleaseSummary(metrics: FabMetrics): FabSummary {
  const {
    enriched,
    totalCount,
    totalTons,
    releasedTons,
    weightedProgress,
    readyForRelease,
    exceptions,
    activeShop,
    readyToShip,
    laborBurn,
    totalBudgetHours,
    totalActualHours,
  } = metrics;

  const releasedPackages = enriched.filter((wp) => wp._signals.releaseGateState === "released");
  const releasedCount = releasedPackages.length;
  // "In Fab" = actively in in_fabrication stage (subset of activeShop)
  const inFabCount = activeShop.filter((wp) => wp._signals.stage === "in_fabrication").length;
  // Blocked comes only from the verified release check, not advisory risk.
  const blockedCount = metrics.releaseBlocked.length;

  const percentReleased = totalTons > 0
    ? Math.round((releasedTons / totalTons) * 100)
    : (totalCount > 0 ? Math.round((releasedCount / totalCount) * 100) : 0);

  // ── KPI cells ──────────────────────────────────────────────────────────
  const kpis: FabKpiRow[] = [
    {
      label: "Released",
      value: releasedCount,
      sublabel: "verified release records",
      tone: releasedCount > 0 ? "good" : "neutral",
    },
    {
      label: "Ready to Release",
      value: readyForRelease.length,
      sublabel: "verified release checks",
      tone: readyForRelease.length > 0 ? "info" : "neutral",
    },
    {
      label: "Blocked",
      value: blockedCount,
      sublabel: "verified release blockers",
      tone: blockedCount > 0 ? "danger" : "neutral",
    },
    {
      label: "In Fab",
      value: inFabCount,
      sublabel: "package stage (advisory)",
      tone: inFabCount > 0 ? "info" : "neutral",
    },
    {
      label: "% Released",
      value: `${percentReleased}%`,
      sublabel: "verified by tonnage",
      tone: percentReleased >= 80 ? "good" : percentReleased >= 40 ? "warn" : "neutral",
    },
    {
      label: "Labor Burn",
      value: `${laborBurn}%`,
      sublabel: `${totalActualHours.toLocaleString()}h / ${totalBudgetHours.toLocaleString()}h`,
      tone: laborBurn > 110 ? "danger" : laborBurn > 90 ? "warn" : "neutral",
    },
  ];

  // ── Decision panel queues ───────────────────────────────────────────────

  // Ready Queue: server-passing packages, sorted by advisory score within the queue.
  const readyQueue = [...readyForRelease]
    .sort((a, b) => b._signals.readinessScore - a._signals.readinessScore)
    .slice(0, 6);

  // Blocked Queue: packages the server gate blocked, sorted by advisory risk.
  const blockedQueue = [...metrics.releaseBlocked]
    .sort((a, b) => {
      const riskRank: Record<string, number> = { high: 0, medium: 1, clear: 2 };
      return (riskRank[a._signals.risk] ?? 2) - (riskRank[b._signals.risk] ?? 2);
    })
    .slice(0, 6);

  // Recorded Releases reads the exact same released package set as the KPI.
  // WP stamp dates help sort; they are not treated as release-record evidence.
  const recentlyReleased = releasedPackages
    .sort((a, b) => {
      const aDate = String(a.released_date ?? "");
      const bDate = String(b.released_date ?? "");
      if (aDate && bDate && aDate !== bDate) return bDate.localeCompare(aDate);
      if (aDate !== bDate) return aDate ? -1 : 1;
      return String(a.wp_number || a.name || a.id).localeCompare(
        String(b.wp_number || b.name || b.id),
        undefined,
        { numeric: true },
      );
    })
    .slice(0, 6);

  return {
    kpis,
    readyQueue,
    blockedQueue,
    recentlyReleased,
    totalCount,
    releasedCount,
    readyForReleaseCount: readyForRelease.length,
    blockedCount,
    inFabCount,
    percentReleased,
  };
}
