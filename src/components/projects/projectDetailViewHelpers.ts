/**
 * Pure KPI / grouping helpers for ProjectDetailView tabs.
 */
import { differenceInDays } from "date-fns";
import { parseUTCDate } from "@/components/shared/formatters";

export function buildOverviewMetrics(args: {
  workPackages: any[];
  rfis: any[];
  changeOrders: any[];
  deliveries: any[];
  project: any;
  now?: Date;
}) {
  const { workPackages, rfis, changeOrders, deliveries, project, now = new Date() } = args;

  const completeWPs = workPackages.filter((w) => w.status === "Complete").length;
  const wpPct =
    workPackages.length > 0 ? Math.round((completeWPs / workPackages.length) * 100) : 0;
  const openRFIs = rfis.filter((r) => ["Open", "Under Review"].includes(r.status)).length;
  const overdueRFIs = rfis.filter(
    (r) =>
      r.due_date &&
      parseUTCDate(r.due_date) < now &&
      !["Answered", "Closed"].includes(r.status),
  ).length;
  const pendingCOs = changeOrders.filter((c) =>
    ["Submitted", "Under Review"].includes(c.status),
  ).length;
  const approvedCOVal = changeOrders
    .filter((c) => c.status === "Approved")
    .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const pendingDeliveries = deliveries.filter(
    (d) => !["Delivered", "Cancelled", "Rejected"].includes(d.status),
  ).length;

  const target = project.target_completion_date
    ? parseUTCDate(project.target_completion_date)
    : null;
  const daysLeft = target ? differenceInDays(target, now) : null;

  return {
    completeWPs,
    wpPct,
    openRFIs,
    overdueRFIs,
    pendingCOs,
    approvedCOVal,
    pendingDeliveries,
    daysLeft,
  };
}

export function buildWorkPackageTabMetrics(workPackages: any[]) {
  const done = workPackages.filter((w) => w.status === "Complete").length;
  const inProg = workPackages.filter((w) => w.status === "In Progress").length;
  const totalTonnage = workPackages.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
  return { done, inProg, totalTonnage };
}

export function groupScheduleTasksByPhase(scheduleTasks: any[]): Record<string, any[]> {
  return scheduleTasks.reduce((acc: Record<string, any[]>, t: any) => {
    const p = t.phase || "General";
    if (!acc[p]) acc[p] = [];
    acc[p].push(t);
    return acc;
  }, {});
}

export function buildCommercialMetrics(args: {
  project: any;
  changeOrders: any[];
  costCodes: any[];
}) {
  const { project, changeOrders, costCodes } = args;
  const totalBudget = costCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
  const totalActual = costCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
  const totalCommit = costCodes.reduce((s, c) => s + (Number(c.committed_cost) || 0), 0);
  const approvedCOVal = changeOrders
    .filter((c) => c.status === "Approved")
    .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const pendingCOVal = changeOrders
    .filter((c) => ["Submitted", "Under Review"].includes(c.status))
    .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const revisedContract = (Number(project.original_contract_value) || 0) + approvedCOVal;
  return {
    totalBudget,
    totalActual,
    totalCommit,
    approvedCOVal,
    pendingCOVal,
    revisedContract,
  };
}

export function costCodeSpendPct(budget: number, actual: number): number {
  return budget > 0 ? Math.min(100, (actual / budget) * 100) : 0;
}

export function isDrawingOverdue(d: any, now: Date = new Date()): boolean {
  return Boolean(d.due_date && parseUTCDate(d.due_date) < now && d.stage !== "Released");
}

export function buildDrawingsTabMetrics(drawings: any[], now: Date = new Date()) {
  const overdue = drawings.filter((d) => isDrawingOverdue(d, now)).length;
  const released = drawings.filter((d) => d.stage === "Released").length;
  const inReview = drawings.filter((d) =>
    ["IFA", "OFA", "BFA", "OFS", "IFC"].includes(d.stage),
  ).length;
  return { overdue, released, inReview };
}

export function isRfiOverdue(r: any, now: Date = new Date()): boolean {
  return Boolean(
    r.due_date &&
      parseUTCDate(r.due_date) < now &&
      !["Answered", "Closed"].includes(r.status),
  );
}

export function buildRfisTabMetrics(rfis: any[], now: Date = new Date()) {
  const open = rfis.filter((r) => ["Open", "Under Review"].includes(r.status)).length;
  const overdue = rfis.filter((r) => isRfiOverdue(r, now)).length;
  const answered = rfis.filter((r) => r.status === "Answered").length;
  return { open, overdue, answered };
}

export function buildDeliveriesTabMetrics(deliveries: any[]) {
  const open = deliveries.filter((d) => !["Delivered", "Rejected"].includes(d.status)).length;
  const delivered = deliveries.filter((d) => d.status === "Delivered").length;
  return { open, delivered };
}

export const PHASE_CONFIG: Record<string, { color: string }> = {
  Detailing: { color: "var(--accent)" },
  Fabrication: { color: "var(--accent)" },
  Delivery: { color: "var(--status-info)" },
  Erection: { color: "var(--status-success)" },
  Closeout: { color: "var(--text-muted)" },
};

export const HEALTH_CONFIG: Record<string, { color: string; dot: string }> = {
  "On Track": { color: "var(--status-success)", dot: "#22C55E" },
  Watch: { color: "var(--status-warning)", dot: "#F59E0B" },
  "At Risk": { color: "var(--status-error)", dot: "#EF4444" },
};

export const monoStyle = { fontFamily: "JetBrains Mono, monospace" } as const;

/** Tab ids + labels (icons stay in the view component). */
export const PROJECT_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "handoff", label: "Handoff" },
  { id: "workpkgs", label: "Work Pkgs" },
  { id: "schedule", label: "Schedule" },
  { id: "drawings", label: "Drawings" },
  { id: "rfis", label: "RFIs" },
  { id: "deliveries", label: "Deliveries" },
  { id: "commercial", label: "Commercial" },
] as const;

