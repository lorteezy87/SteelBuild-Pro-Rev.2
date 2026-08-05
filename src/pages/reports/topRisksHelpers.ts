/** Pure helpers for Top Risks report. */

export function excerptText(
  text: string | null | undefined,
  maxLen: number,
): string | null {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

export type RiskLike = {
  project_id?: string | null;
  probability?: number | string | null;
  impact?: number | string | null;
  [k: string]: unknown;
};

export function buildTopRisksList<T extends RiskLike>(
  risks: T[],
  opts: {
    projectFilter: string;
    activeOnly: string;
    isActiveRisk: (r: T) => boolean;
    /** Score for a risk row (page injects probability×impact scorer). */
    scoreOf: (r: T) => number;
    limit?: number;
  },
): Array<T & { score: number }> {
  let list = risks || [];
  if (opts.projectFilter !== "all") {
    list = list.filter((r) => r.project_id === opts.projectFilter);
  }
  if (opts.activeOnly === "active") {
    list = list.filter(opts.isActiveRisk);
  }
  const limit = opts.limit ?? 10;
  return list
    .map((r) => ({ ...r, score: opts.scoreOf(r) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
