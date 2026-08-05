/** Pure helpers for Project Status financial-lens report. */

import {
  projectedFinalCost,
  projectedMargin,
  revisedContractValue,
} from "@/pages/dashboard/projectMetrics";

export type ProjectStatusRow = {
  id: string | null | undefined;
  name: string;
  number: string;
  phase: string;
  health: string;
  jobType: string;
  startDate: string | null;
  targetDate: string | null;
  revised: number;
  projected: number;
  margin: number;
};

export function buildProjectStatusRows(input: {
  projects?: Array<Record<string, any>>;
  changeOrders?: Array<{ project_id?: string | null }>;
  expenses?: Array<{ project_id?: string | null }>;
}): ProjectStatusRow[] {
  const changeOrders = input.changeOrders || [];
  const expenses = input.expenses || [];
  return (input.projects || []).map((p) => {
    const pCOs = changeOrders.filter((c) => c.project_id === p.id);
    const pExpenses = expenses.filter((e) => e.project_id === p.id);
    const revised = revisedContractValue(p, pCOs);
    const projected = projectedFinalCost(pExpenses, p);
    const margin = projectedMargin(p, pCOs, pExpenses);
    return {
      id: p.id,
      name: p.name || "Untitled Project",
      number: p.project_number || `P-${p.id}`,
      phase: p.phase || "",
      health: p.health_status || "",
      jobType: p.job_type || "",
      startDate: p.start_date || null,
      targetDate: p.target_completion_date || null,
      revised,
      projected,
      margin,
    };
  });
}

export function filterProjectStatusRows(
  rows: ProjectStatusRow[],
  opts: { search?: string; phaseFilter?: string } = {},
): ProjectStatusRow[] {
  let out = rows || [];
  if (opts.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    out = out.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.number.toLowerCase().includes(q),
    );
  }
  if (opts.phaseFilter && opts.phaseFilter !== "all") {
    out = out.filter((r) => r.phase === opts.phaseFilter);
  }
  return out;
}

export function projectStatusPortfolioTotals(rows: ProjectStatusRow[]): {
  totalRevised: number;
  totalProjected: number;
  portfolioMargin: number;
} {
  const totalRevised = (rows || []).reduce((s, r) => s + r.revised, 0);
  const totalProjected = (rows || []).reduce((s, r) => s + r.projected, 0);
  const portfolioMargin = totalRevised
    ? ((totalRevised - totalProjected) / totalRevised) * 100
    : 0;
  return { totalRevised, totalProjected, portfolioMargin };
}
