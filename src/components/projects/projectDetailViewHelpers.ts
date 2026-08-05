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

export const WP_STATUS_COLOR: Record<string, string> = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--accent)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-warning)",
};

export const WP_PHASE_COLORS: Record<string, string> = {
  Detailing: "#0D9488",
  Fabrication: "var(--accent)",
  Delivery: "#06B6D4",
  Erection: "#22C55E",
};

export const SCHEDULE_STATUS_COLOR: Record<string, string> = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--accent)",
  Complete: "var(--status-success)",
  Delayed: "var(--status-error)",
  "On Hold": "var(--status-warning)",
};

export const DRAWING_STAGE_COLOR: Record<string, string> = {
  Released: "var(--status-success)",
  IFC: "var(--status-success)",
  OFS: "var(--accent)",
  BFA: "var(--accent)",
  OFA: "var(--status-warning)",
  IFA: "var(--status-info)",
  "Not Started": "var(--text-muted)",
};

export const RFI_STATUS_COLOR: Record<string, string> = {
  Open: "var(--status-warning)",
  "Under Review": "var(--accent)",
  Answered: "var(--status-success)",
  Closed: "var(--text-muted)",
};

export const RFI_PRIO_COLOR: Record<string, string> = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--accent)",
  Low: "var(--text-muted)",
};

export const DELIVERY_STATUS_COLOR: Record<string, string> = {
  Scheduled: "var(--accent)",
  "In Transit": "var(--status-warning)",
  Delivered: "var(--status-success)",
  Partial: "var(--status-warning)",
  Rejected: "var(--status-error)",
};

export const CO_STATUS_COLOR: Record<string, string> = {
  Approved: "var(--status-success)",
  Rejected: "var(--status-error)",
  "Under Review": "var(--accent)",
  Submitted: "var(--status-warning)",
  Draft: "var(--text-muted)",
  Void: "var(--text-muted)",
};

export const WP_TAB_GRID = "1fr 90px 80px 80px 70px 90px";
export const DRAWINGS_TAB_GRID = "90px 1fr 80px 80px 80px";
export const RFIS_TAB_GRID = "80px 1fr 70px 80px 80px";
export const DELIVERIES_TAB_GRID = "1fr 100px 90px 90px 80px";
export const CO_TAB_GRID = "90px 1fr 90px 90px 90px";
