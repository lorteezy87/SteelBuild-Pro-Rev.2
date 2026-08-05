/**
 * Pure KPI / trend / team / activity builders for ProjectDrilldownModal.
 */
import { format, parseISO } from "date-fns";

export const fmt$ = (n: unknown) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

export const fmtShort$ = (n: unknown) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return fmt$(v);
};

export const fmtDate = (str: string | null | undefined) => {
  if (!str) return "—";
  try {
    return format(parseISO(str), "MMM d, yyyy");
  } catch {
    return str;
  }
};

export const HEALTH_CFG: Record<string, { color: string; bg: string; border: string }> = {
  "On Track": { color: "var(--status-success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  Watch: { color: "var(--status-warning)", bg: "var(--warning-muted)", border: "var(--warning-border)" },
  "At Risk": { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)" },
};

export const STATUS_COLOR: Record<string, string> = {
  Approved: "var(--status-success)",
  Answered: "var(--status-success)",
  Closed: "var(--status-success)",
  Complete: "var(--status-success)",
  Paid: "var(--status-success)",
  Submitted: "var(--status-warning)",
  "Under Review": "var(--status-warning)",
  Open: "var(--status-warning)",
  "In Progress": "var(--status-warning)",
  Rejected: "var(--status-error)",
  "At Risk": "var(--status-error)",
  Critical: "var(--status-error)",
};

export function buildBudgetTrendData(
  project: { original_contract_value?: number | string | null } | null | undefined,
  cos: Array<{
    approved_date?: string | null;
    submitted_date?: string | null;
    status?: string | null;
    co_amount?: number | string | null;
  }> | null | undefined,
  codes: Array<{ actual_cost?: number | string | null }> | null | undefined,
) {
  if (!project) return null;
  const sortedCOs = [...(cos || [])]
    .filter((c) => c.approved_date || c.submitted_date)
    .sort(
      (a, b) =>
        new Date(a.approved_date || a.submitted_date || 0).getTime() -
        new Date(b.approved_date || b.submitted_date || 0).getTime(),
    );

  let runningContract = Number(project.original_contract_value) || 0;
  const points: Array<{ month: string; contract: number; actual: number }> = [
    { month: "Original", contract: runningContract, actual: 0 },
  ];

  sortedCOs.forEach((co) => {
    if (co.status === "Approved") {
      runningContract += Number(co.co_amount) || 0;
    }
    const dateStr = co.approved_date || co.submitted_date;
    try {
      const label = format(parseISO(dateStr as string), "MMM yy");
      const lastPoint = points[points.length - 1];
      if (lastPoint.month === label) {
        lastPoint.contract = runningContract;
      } else {
        points.push({ month: label, contract: runningContract, actual: 0 });
      }
    } catch {
      /* ignore bad dates */
    }
  });

  const totalActual = (codes || []).reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
  if (points.length > 1) points[points.length - 1].actual = totalActual;

  return points.length > 1 ? points : null;
}

export function buildCostByPhase(
  codes: Array<{
    phase?: string | null;
    budget_amount?: number | string | null;
    actual_cost?: number | string | null;
  }> | null | undefined,
) {
  const phaseMap: Record<string, { budget: number; actual: number }> = {};
  (codes || []).forEach((c) => {
    const ph = c.phase || "Other";
    if (!phaseMap[ph]) phaseMap[ph] = { budget: 0, actual: 0 };
    phaseMap[ph].budget += Number(c.budget_amount) || 0;
    phaseMap[ph].actual += Number(c.actual_cost) || 0;
  });
  return Object.entries(phaseMap).map(([phase, vals]) => ({ phase, ...vals }));
}

export function buildProjectDrilldownKpis(args: {
  project: { original_contract_value?: number | string | null; health_status?: string | null };
  codes: Array<{ budget_amount?: number | string | null; actual_cost?: number | string | null }>;
  cos: Array<{ status?: string | null; co_amount?: number | string | null }>;
  rfis: Array<{ status?: string | null; priority?: string | null }>;
  wps: Array<{
    status?: string | null;
    percent_complete?: number | string | null;
    budgeted_labor_value?: number | string | null;
    budgeted_material_value?: number | string | null;
    actual_labor_cost_to_date?: number | string | null;
    actual_material_cost_to_date?: number | string | null;
  }>;
}) {
  const { project, codes, cos, rfis, wps } = args;
  const totalBudget = codes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
  const totalActual = codes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
  const approvedCOTotal = cos
    .filter((c) => c.status === "Approved")
    .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const revisedContract = (Number(project.original_contract_value) || 0) + approvedCOTotal;
  const openRFIs = rfis.filter((r) => !["Answered", "Closed"].includes(r.status || "")).length;
  const criticalRFIs = rfis.filter(
    (r) => r.priority === "Critical" && !["Answered", "Closed"].includes(r.status || ""),
  ).length;
  const wpsComplete = wps.filter((w) => w.status === "Complete").length;
  const avgComplete =
    wps.length > 0
      ? (
          wps.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / wps.length
        ).toFixed(0)
      : 0;

  const ev = wps.reduce((s, wp) => {
    const bac =
      (Number(wp.budgeted_labor_value) || 0) + (Number(wp.budgeted_material_value) || 0);
    return s + bac * ((Number(wp.percent_complete) || 0) / 100);
  }, 0);
  const ac = wps.reduce(
    (s, wp) =>
      s +
      (Number(wp.actual_labor_cost_to_date) || 0) +
      (Number(wp.actual_material_cost_to_date) || 0),
    0,
  );
  const cpi = ac > 0 ? ev / ac : null;
  const health =
    HEALTH_CFG[project.health_status || ""] ||
    { color: "var(--text-muted)", bg: "var(--hover-bg)", border: "var(--bg-surface-high)" };

  return {
    totalBudget,
    totalActual,
    approvedCOTotal,
    revisedContract,
    openRFIs,
    criticalRFIs,
    wpsComplete,
    avgComplete,
    ev,
    ac,
    cpi,
    health,
  };
}

export function buildCrewTeamRows(
  wps: Array<{
    crew?: string | null;
    status?: string | null;
    percent_complete?: number | string | null;
  }> | null | undefined,
) {
  const teamMap: Record<
    string,
    { name: string; packages: number; complete: number; totalPct: number }
  > = {};
  (wps || []).forEach((wp) => {
    if (!wp.crew) return;
    if (!teamMap[wp.crew]) {
      teamMap[wp.crew] = { name: wp.crew, packages: 0, complete: 0, totalPct: 0 };
    }
    teamMap[wp.crew].packages++;
    if (wp.status === "Complete") teamMap[wp.crew].complete++;
    teamMap[wp.crew].totalPct += Number(wp.percent_complete) || 0;
  });
  return Object.values(teamMap).sort((a, b) => b.packages - a.packages);
}

export function selectRecentLogs(
  logs: Array<{ date?: string | null }> | null | undefined,
  limit = 8,
) {
  return [...(logs || [])]
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, limit);
}
