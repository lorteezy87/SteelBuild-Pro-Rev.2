/** Pure helpers for ChangeRequests page shell. */
import { CHANGE_REQUEST_STATUS, PRIORITY } from "@/lib/enums";
import { nextFilterToggle } from "@/pages/shared/nextFilterToggle";

export { nextFilterToggle };

export type ChangeRequestLike = {
  status?: string | null;
  priority?: string | null;
  estimated_cost_impact?: number | null;
  [key: string]: unknown;
};

export function filterChangeRequests(
  rows: ChangeRequestLike[],
  opts: { filterStatus: string; filterPriority: string },
): ChangeRequestLike[] {
  return (rows || []).filter((cr) => {
    const statusMatch = opts.filterStatus === "all" || cr.status === opts.filterStatus;
    const priorityMatch = opts.filterPriority === "all" || cr.priority === opts.filterPriority;
    return statusMatch && priorityMatch;
  });
}

export function computeChangeRequestStats(
  rows: ChangeRequestLike[],
  statuses: { SUBMITTED: string; APPROVED: string; REJECTED: string },
): {
  total: number;
  submitted: number;
  approved: number;
  rejected: number;
  totalCostImpact: number;
} {
  const list = rows || [];
  return {
    total: list.length,
    submitted: list.filter((c) => c.status === statuses.SUBMITTED).length,
    approved: list.filter((c) => c.status === statuses.APPROVED).length,
    rejected: list.filter((c) => c.status === statuses.REJECTED).length,
    totalCostImpact: list.reduce((sum, c) => sum + (Number(c.estimated_cost_impact) || 0), 0),
  };
}

export const CHANGE_REQUEST_STATUS_FILTERS = Object.values(CHANGE_REQUEST_STATUS);

export const CHANGE_REQUEST_PRIORITY_FILTERS = Object.values(PRIORITY);

export function changeRequestCommandSubtitle(stats: {
  submitted: number;
  approved: number;
}): string {
  return `${stats.submitted} submitted · ${stats.approved} approved · pre-CO formal request tracking`;
}

export function createEmptyChangeRequestFilters(): {
  filterStatus: string;
  filterPriority: string;
} {
  return {
    filterStatus: "all",
    filterPriority: "all",
  };
}

