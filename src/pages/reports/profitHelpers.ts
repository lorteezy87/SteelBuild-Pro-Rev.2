/** Pure helpers for Profit (per-project margin) report. */

export type ProfitProjectLike = {
  id?: string | null;
  name?: string | null;
  project_number?: string | null;
  phase?: string | null;
  original_contract_value?: number | string | null;
  [k: string]: unknown;
};

export type ProfitCoLike = {
  project_id?: string | null;
  status?: string | null;
  co_amount?: number | string | null;
};

export type ProfitExpenseLike = {
  project_id?: string | null;
  [k: string]: unknown;
};

export type ProfitRow = {
  id: string | null | undefined;
  name: string;
  number: string;
  phase: string;
  original: number;
  approvedCOTotal: number;
  revised: number;
  projected: number;
  profit: number;
  margin: number;
};

export function buildProfitRows(input: {
  projects: ProfitProjectLike[];
  changeOrders: ProfitCoLike[];
  expenses: ProfitExpenseLike[];
  revisedContractValue: (p: ProfitProjectLike, cos: ProfitCoLike[]) => number;
  projectedFinalCost: (expenses: ProfitExpenseLike[], p: ProfitProjectLike) => number;
}): ProfitRow[] {
  const { projects, changeOrders, expenses, revisedContractValue, projectedFinalCost } = input;
  return (projects || []).map((p) => {
    const pCOs = (changeOrders || []).filter((c) => c.project_id === p.id);
    const pExpenses = (expenses || []).filter((e) => e.project_id === p.id);
    const original = Number(p.original_contract_value) || 0;
    const approvedCOTotal = pCOs
      .filter((c) => c.status === "Approved")
      .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const revised = revisedContractValue(p, pCOs);
    const projected = projectedFinalCost(pExpenses, p);
    const profit = revised - projected;
    const margin = revised ? (profit / revised) * 100 : 0;
    return {
      id: p.id,
      name: p.name || "Untitled Project",
      number: p.project_number || `P-${p.id}`,
      phase: p.phase || "",
      original,
      approvedCOTotal,
      revised,
      projected,
      profit,
      margin,
    };
  });
}

export function filterProfitRows(
  rows: ProfitRow[],
  opts: { search?: string; phaseFilter?: string },
): ProfitRow[] {
  let out = rows || [];
  const q = (opts.search || "").trim().toLowerCase();
  if (q) {
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

export type ProfitTotals = {
  original: number;
  approvedCOTotal: number;
  revised: number;
  projected: number;
  profit: number;
  margin: number;
};

export function sumProfitTotals(filtered: ProfitRow[]): ProfitTotals {
  const t = (filtered || []).reduce(
    (acc, r) => {
      acc.original += r.original;
      acc.approvedCOTotal += r.approvedCOTotal;
      acc.revised += r.revised;
      acc.projected += r.projected;
      acc.profit += r.profit;
      return acc;
    },
    { original: 0, approvedCOTotal: 0, revised: 0, projected: 0, profit: 0 },
  );
  return {
    ...t,
    margin: t.revised ? (t.profit / t.revised) * 100 : 0,
  };
}
