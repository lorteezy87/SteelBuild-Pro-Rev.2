/** Pure portfolio math for ExecutiveView page shell. */

export type ProjectLike = {
  id?: string | null;
  name?: string | null;
  project_number?: string | null;
  original_contract_value?: number | null;
  health_status?: string | null;
  phase?: string | null;
};

export type CoLike = {
  project_id?: string | null;
  status?: string | null;
  co_amount?: number | null;
  co_number?: string | null;
};

export type RfiLike = {
  project_id?: string | null;
  status?: string | null;
  priority?: string | null;
  date_required?: string | null;
  submitted_date?: string | null;
  created_date?: string | null;
};

export type WpLike = {
  project_id?: string | null;
  shop_hours_budget?: number | null;
  field_hours_budget?: number | null;
  shop_hours_actual?: number | null;
  field_hours_actual?: number | null;
};

export type TaskLike = {
  status?: string | null;
  end_date?: string | null;
  updated_date?: string | null;
};

export type CostCodeLike = {
  project_id?: string | null;
  [key: string]: unknown;
};

export function sumContractValue(projects: ProjectLike[]): number {
  return (projects || []).reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0);
}

export function sumApprovedCoValue(cos: CoLike[]): number {
  return (cos || [])
    .filter((c) => c.status === "Approved")
    .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
}

export function countApprovedCos(cos: CoLike[]): number {
  return (cos || []).filter((c) => c.status === "Approved").length;
}

export function sumWpHours(wps: WpLike[]): { budget: number; actual: number } {
  let budget = 0;
  let actual = 0;
  for (const w of wps || []) {
    budget += (Number(w.shop_hours_budget) || 0) + (Number(w.field_hours_budget) || 0);
    actual += (Number(w.shop_hours_actual) || 0) + (Number(w.field_hours_actual) || 0);
  }
  return { budget, actual };
}

export function countOpenRfis(rfis: RfiLike[]): number {
  return (rfis || []).filter((r) => r.status === "Open" || r.status === "Under Review").length;
}

export function countAtRiskProjects(projects: ProjectLike[]): number {
  return (projects || []).filter((p) => p.health_status === "At Risk").length;
}

export function countDelayedTasks(tasks: TaskLike[]): number {
  return (tasks || []).filter((t) => t.status === "Delayed").length;
}

export function countTasksCompleteThisWeek(
  tasks: TaskLike[],
  now: Date = new Date(),
): number {
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  return (tasks || []).filter((t) => {
    if (t.status !== "Complete") return false;
    const d = new Date(t.end_date || t.updated_date || "");
    return d >= weekAgo && d <= now;
  }).length;
}

export function buildRfiSeverity(rfis: RfiLike[]): Array<{ name: string; value: number }> {
  return [
    { name: "Critical", value: (rfis || []).filter((r) => r.priority === "Critical").length },
    { name: "High", value: (rfis || []).filter((r) => r.priority === "High").length },
    { name: "Medium", value: (rfis || []).filter((r) => r.priority === "Medium").length },
    { name: "Low", value: (rfis || []).filter((r) => r.priority === "Low").length },
  ].filter((d) => d.value > 0);
}

export function buildHealthData(
  projects: ProjectLike[],
): Array<{ name: string; value: number }> {
  return [
    { name: "On Track", value: (projects || []).filter((p) => p.health_status === "On Track").length },
    { name: "Watch", value: (projects || []).filter((p) => p.health_status === "Watch").length },
    { name: "At Risk", value: (projects || []).filter((p) => p.health_status === "At Risk").length },
  ].filter((d) => d.value > 0);
}

export const PHASE_COLORS: Record<string, string> = {
  Detailing: "var(--phase-detailing)",
  Fabrication: "var(--phase-fab)",
  Delivery: "var(--phase-delivery)",
  Erection: "var(--phase-erection)",
  Closeout: "var(--phase-closeout)",
};

export function buildPhaseData(
  projects: ProjectLike[],
): Array<{ name: string; value: number; color: string }> {
  return (Object.keys(PHASE_COLORS) as Array<keyof typeof PHASE_COLORS>)
    .map((name) => ({
      name,
      value: (projects || []).filter((p) => p.phase === name).length,
      color: PHASE_COLORS[name],
    }))
    .filter((d) => d.value > 0);
}

export function buildLaborByProject(
  projects: ProjectLike[],
  wps: WpLike[],
): Array<{ name: string; budget: number; actual: number }> {
  return (projects || []).map((p) => {
    const pw = (wps || []).filter((w) => w.project_id === p.id);
    const hours = sumWpHours(pw);
    return {
      name: p.project_number || p.name?.slice(0, 8) || "",
      budget: hours.budget,
      actual: hours.actual,
    };
  });
}

export function buildWaterfallData(
  totalContract: number,
  revisedTotal: number,
  cos: CoLike[],
): Array<{ name: string; value: number; fill: string }> {
  const rows: Array<{ name: string; value: number; fill: string }> = [
    { name: "Original", value: totalContract, fill: "var(--accent)" },
  ];
  for (const c of (cos || []).filter((x) => x.status === "Approved")) {
    const amount = Number(c.co_amount) || 0;
    rows.push({
      name: c.co_number || "",
      value: amount,
      fill: amount >= 0 ? "var(--status-success)" : "var(--status-error)",
    });
  }
  rows.push({ name: "Revised", value: revisedTotal, fill: "var(--phase-detailing)" });
  return rows;
}

export function buildRfiAging(
  projects: ProjectLike[],
  rfis: RfiLike[],
  now: Date = new Date(),
): Array<{ name: string | null | undefined; number: string | null | undefined; open: number; overdue: number; avgDays: number }> {
  return (projects || [])
    .map((p) => {
      const pRFIs = (rfis || []).filter((r) => r.project_id === p.id);
      const open = pRFIs.filter((r) => !["Answered", "Closed"].includes(r.status || ""));
      const overdue = open.filter(
        (r) => r.date_required && new Date(r.date_required) < now,
      );
      const avgDays =
        open.length > 0
          ? Math.round(
              open.reduce((s, r) => {
                const start = new Date(r.submitted_date || r.created_date || now.toISOString());
                return s + Math.floor((now.getTime() - start.getTime()) / 86400000);
              }, 0) / open.length,
            )
          : 0;
      return {
        name: p.name,
        number: p.project_number,
        open: open.length,
        overdue: overdue.length,
        avgDays,
      };
    })
    .filter((r) => r.open > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
}

export type ProjectBudgetTotalsFn = (
  codes: CostCodeLike[],
) => { budget: number; actual: number };

/** Per-project budget/actual/revised chart rows (uses injectable cost rollup). */
export function buildProjectBudgetData(
  projects: ProjectLike[],
  codes: CostCodeLike[],
  cos: CoLike[],
  computeCostCodeTotals: ProjectBudgetTotalsFn,
): Array<{ name: string; budget: number; actual: number; revised: number }> {
  return (projects || []).map((p) => {
    const pc = (codes || []).filter((c) => c.project_id === p.id);
    const approvedCO = (cos || [])
      .filter((c) => c.project_id === p.id && c.status === "Approved")
      .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const pcTotals = computeCostCodeTotals(pc);
    return {
      name: p.project_number || p.name?.slice(0, 10) || "",
      budget: pcTotals.budget,
      actual: pcTotals.actual,
      revised: (Number(p.original_contract_value) || 0) + approvedCO,
    };
  });
}

export const EXECUTIVE_HEALTH_COLORS = [
  "var(--status-success)",
  "var(--status-warning)",
  "var(--status-error)",
] as const;

export const EXECUTIVE_RFI_SEVERITY_COLORS = [
  "var(--status-error)",
  "var(--status-warning)",
  "var(--status-info)",
  "var(--text-muted)",
] as const;

export type ExecutiveKpi = {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
};

/** Pure KPI strip for Executive View (formatting helpers injected for testability). */
export function buildExecutiveKpis(input: {
  revisedTotal: number;
  totalSpend: number;
  totalBudget: number;
  approvedCOVal: number;
  approvedCoCount: number;
  laborBurnPct: number;
  totalActualHrs: number;
  openRfiCount: number;
  atRiskCount: number;
  delayedTaskCount: number;
  completeThisWeekCount: number;
  formatCurrency: (n: number) => string;
  formatBudgetPercent: (n: number) => string;
}): ExecutiveKpi[] {
  const f = input;
  return [
    { label: "Portfolio Value", value: f.formatCurrency(f.revisedTotal), color: "green" },
    {
      label: "Total Spend",
      value: f.formatCurrency(f.totalSpend),
      sub: `of ${f.formatCurrency(f.totalBudget)} budget`,
      color: f.totalSpend > f.totalBudget ? "rose" : "blue",
    },
    {
      label: "Approved COs",
      value: f.formatCurrency(f.approvedCOVal),
      sub: `${f.approvedCoCount} orders`,
      color: "purple",
    },
    {
      label: "Labor Burn",
      value: f.formatBudgetPercent(f.laborBurnPct),
      sub: `${f.totalActualHrs.toLocaleString()} hrs actual`,
      color: "amber",
    },
    { label: "Open RFIs", value: f.openRfiCount, color: "blue" },
    { label: "At Risk Projects", value: f.atRiskCount, color: "rose" },
    {
      label: "Delayed Tasks",
      value: f.delayedTaskCount,
      color: f.delayedTaskCount > 0 ? "rose" : "green",
    },
    {
      label: "Complete This Week",
      value: f.completeThisWeekCount,
      color: "green",
    },
  ];
}
