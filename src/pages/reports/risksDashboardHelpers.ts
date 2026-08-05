/** Pure helpers for Risks Dashboard report. */

import {
  RISK_CATEGORIES,
  computeScore,
  isActiveRisk,
  severityColor,
} from "./risks/severity";

export type RiskLike = {
  project_id?: string | null;
  status?: string | null;
  severity?: string | null;
  category?: string | null;
  probability?: number | string | null;
  impact?: number | string | null;
  [key: string]: unknown;
};

export function scopeRisksByProject(
  risks: RiskLike[] = [],
  projectFilter = "all",
): RiskLike[] {
  if (projectFilter === "all") return risks || [];
  return (risks || []).filter((r) => r.project_id === projectFilter);
}

export type RisksDashboardKpis = {
  total: number;
  open: number;
  mitigating: number;
  mitigated: number;
  closed: number;
  criticalCount: number;
  avgScore: number;
};

export function computeRisksDashboardKpis(scoped: RiskLike[]): RisksDashboardKpis {
  const list = scoped || [];
  const total = list.length;
  return {
    total,
    open: list.filter((r) => r.status === "Open").length,
    mitigating: list.filter((r) => r.status === "Mitigating").length,
    mitigated: list.filter((r) => r.status === "Mitigated").length,
    closed: list.filter((r) => r.status === "Closed").length,
    criticalCount: list.filter((r) => r.severity === "Critical").length,
    avgScore: total
      ? list.reduce(
          (s, r) => s + computeScore(r.probability, r.impact),
          0,
        ) / total
      : 0,
  };
}

export function buildSeveritySegments(scoped: RiskLike[]) {
  const counts: Record<string, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };
  for (const r of scoped || []) {
    if (counts[r.severity as string] !== undefined) {
      counts[r.severity as string] += 1;
    }
  }
  return (["Critical", "High", "Medium", "Low"] as const)
    .map((sev) => ({
      label: sev,
      value: counts[sev],
      color: severityColor(sev),
    }))
    .filter((s) => s.value > 0);
}

export function buildCategoryBarData(
  scoped: RiskLike[],
  categories: readonly string[] = RISK_CATEGORIES,
) {
  return categories
    .map((cat) => {
      const all = (scoped || []).filter((r) => r.category === cat).length;
      const openCount = (scoped || []).filter(
        (r) => r.category === cat && isActiveRisk(r),
      ).length;
      return { name: cat, budget: all, actual: openCount };
    })
    .filter((d) => d.budget > 0 || d.actual > 0);
}

export function topOpenRisks(scoped: RiskLike[], limit = 5) {
  return [...(scoped || [])]
    .filter(isActiveRisk)
    .map((r) => ({
      ...r,
      score: computeScore(r.probability, r.impact),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
