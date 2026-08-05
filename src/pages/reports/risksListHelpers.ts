/** Pure helpers for Risks list report. */

import { computeScore } from "./risks/severity";

export type RiskListRow = Record<string, unknown> & {
  project_id?: string | null;
  severity?: string | null;
  status?: string | null;
  category?: string | null;
  title?: string | null;
  owner?: string | null;
  description?: string | null;
  trigger_event?: string | null;
  probability?: number | string | null;
  impact?: number | string | null;
  score: number;
  projectLabel: string;
};

export function buildRiskListRows(input: {
  risks?: Array<Record<string, any>>;
  projectById?: Record<
    string,
    { project_number?: string | null; name?: string | null }
  >;
}): RiskListRow[] {
  const projectById = input.projectById || {};
  return (input.risks || []).map((r) => {
    const p = r.project_id != null ? projectById[String(r.project_id)] : undefined;
    return {
      ...r,
      score: computeScore(r.probability, r.impact),
      projectLabel: p
        ? `${p.project_number ? p.project_number + " — " : ""}${p.name}`
        : "—",
    };
  });
}

export function filterRiskListRows(
  rows: RiskListRow[],
  opts: {
    projectFilter?: string;
    severityFilter?: string;
    statusFilter?: string;
    categoryFilter?: string;
    search?: string;
  } = {},
): RiskListRow[] {
  let out = rows || [];
  if (opts.projectFilter && opts.projectFilter !== "all") {
    out = out.filter((r) => r.project_id === opts.projectFilter);
  }
  if (opts.severityFilter && opts.severityFilter !== "all") {
    out = out.filter((r) => r.severity === opts.severityFilter);
  }
  if (opts.statusFilter && opts.statusFilter !== "all") {
    out = out.filter((r) => r.status === opts.statusFilter);
  }
  if (opts.categoryFilter && opts.categoryFilter !== "all") {
    out = out.filter((r) => r.category === opts.categoryFilter);
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    out = out.filter((r) =>
      [r.title, r.owner, r.category, r.description, r.trigger_event]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }
  return out;
}
