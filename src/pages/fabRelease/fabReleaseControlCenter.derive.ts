/**
 * Pure derivations for the canonical Fab Release Control Center.
 * No React, no network. Reads outputs of buildFabReleaseMetrics() from
 * analytics.js — never re-derives fab logic here.
 *
 * KPI/queue contract is the source of truth for FabReleaseControlCenter.tsx.
 */
import type { EnrichedWorkPackage, FabMetrics } from "./types";

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
  readyQueue: EnrichedWorkPackage[];         // Up to 6: readyForRelease, sorted
  blockedQueue: EnrichedWorkPackage[];       // Up to 6: blocked by RFI/approval, sorted by risk
  recentlyReleased: EnrichedWorkPackage[];   // Up to 6: already in-shop, sorted by released_date desc
  // Headline counts (used by hero chips)
  totalCount: number;
  releasedCount: number;            // shop_released or beyond
  readyForReleaseCount: number;
  blockedCount: number;
  inFabCount: number;               // actively in_fabrication
  percentReleased: number;          // releasedTons / totalTons (0–100)
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
    drawings_approved:  "Drawings OK",
    material_on_hand:   "Matl Ready",
    shop_released:      "Released",
    in_fabrication:     "In Fab",
    fabricated:         "Fabricated",
    finish_treatment:   "Finishing",
    ready_to_ship:      "Ship Ready",
  };
  return labels[stage] ?? stage;
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

  // "Released" = at or beyond shop_released stage
  const releasedCount = activeShop.length + readyToShip.length;
  // "In Fab" = actively in in_fabrication stage (subset of activeShop)
  const inFabCount = activeShop.filter((wp) => wp._signals.stage === "in_fabrication").length;
  // Blocked = needs release but has high/medium risk flags
  const blockedCount = metrics.releaseBlocked.filter((wp) => wp._signals.risk !== "clear").length;

  const percentReleased = totalTons > 0
    ? Math.round((releasedTons / totalTons) * 100)
    : (totalCount > 0 ? Math.round((releasedCount / totalCount) * 100) : 0);

  // ── KPI cells ──────────────────────────────────────────────────────────
  const kpis: FabKpiRow[] = [
    {
      label: "Released",
      value: releasedCount,
      sublabel: "pkgs in shop",
      tone: releasedCount > 0 ? "good" : "neutral",
    },
    {
      label: "Ready to Release",
      value: readyForRelease.length,
      sublabel: "pkgs queued",
      tone: readyForRelease.length > 0 ? "info" : "neutral",
    },
    {
      label: "Blocked",
      value: blockedCount,
      sublabel: "RFI / approval",
      tone: blockedCount > 0 ? "danger" : "neutral",
    },
    {
      label: "In Fab",
      value: inFabCount,
      sublabel: "active shop work",
      tone: inFabCount > 0 ? "info" : "neutral",
    },
    {
      label: "% Released",
      value: `${percentReleased}%`,
      sublabel: "by tonnage",
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

  // Ready Queue: packages that are readyForRelease, sorted by risk then readiness score desc
  const readyQueue = [...readyForRelease]
    .sort((a, b) => b._signals.readinessScore - a._signals.readinessScore)
    .slice(0, 6);

  // Blocked Queue: packages blocked by RFI or approval (high-risk, needs release)
  const blockedQueue = [...metrics.releaseBlocked]
    .filter((wp) => wp._signals.risk !== "clear")
    .sort((a, b) => {
      const riskRank: Record<string, number> = { high: 0, medium: 1, clear: 2 };
      return (riskRank[a._signals.risk] ?? 2) - (riskRank[b._signals.risk] ?? 2);
    })
    .slice(0, 6);

  // Recently Released: in-shop packages sorted by released_date descending
  const recentlyReleased = [...activeShop]
    .filter((wp) => wp.released_date)
    .sort((a, b) => String(b.released_date ?? "").localeCompare(String(a.released_date ?? "")))
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
