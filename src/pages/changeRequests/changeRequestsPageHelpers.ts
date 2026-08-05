/** Pure helpers for ChangeRequests page shell. */

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
