/**
 * Pure KPI/filter helpers for Constraints page shell.
 */
import { CONSTRAINT_STATUS, RESOLVED_STATUSES, PRIORITY, PRIORITY_ORDER } from "@/lib/enums";
import { isOverdue } from "./utils";
import { CONSTRAINT_TYPES, TYPE_COLORS } from "./constants";

export type ConstraintLike = {
  status?: string | null;
  priority?: string | null;
  constraint_type?: string | null;
  title?: string | null;
  description?: string | null;
  project_area?: string | null;
  assigned_to?: string | null;
  constraint_number?: string | null;
  due_date?: string | null;
  created_date?: string | null;
  created_at?: string | null;
  _generated?: boolean;
  _source_ref?: string | null;
  _source_type?: string | null;
  [k: string]: unknown;
};

export function mergeConstraints(
  generated: ConstraintLike[],
  items: ConstraintLike[],
): ConstraintLike[] {
  return [...(generated || []), ...(items || [])];
}

export function computeConstraintKpis(
  allConstraints: ConstraintLike[],
  nowMs: number = Date.now(),
) {
  const open = allConstraints.filter((c) => !RESOLVED_STATUSES.includes(c.status as any));
  const resolved = allConstraints.filter((c) => c.status === CONSTRAINT_STATUS.RESOLVED);
  const closed = allConstraints.filter((c) => c.status === CONSTRAINT_STATUS.CLOSED);
  const overdue = open.filter(isOverdue);
  const critical = open.filter((c) => c.priority === PRIORITY.CRITICAL);
  const inProg = allConstraints.filter((c) => c.status === CONSTRAINT_STATUS.IN_PROGRESS);
  const generated = allConstraints.filter((c) => c._generated);

  const oldestOpen = open.reduce<Date | null>((oldest, c) => {
    const d = new Date(c.created_date || c.created_at || c.due_date || nowMs);
    return !oldest || d < oldest ? d : oldest;
  }, null);
  const agedays = oldestOpen ? Math.floor((nowMs - oldestOpen.getTime()) / 86400000) : 0;

  const byType = CONSTRAINT_TYPES.map((t) => ({
    type: t,
    count: open.filter((c) => c.constraint_type === t).length,
    color: TYPE_COLORS[t],
  }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  const byPriority = Object.values(PRIORITY).map((p) => ({
    priority: p,
    count: open.filter((c) => c.priority === p).length,
  }));

  return {
    open,
    resolved,
    closed,
    overdue,
    critical,
    inProg,
    generated,
    agedays,
    byType,
    byPriority,
    total: allConstraints.length,
  };
}

export function filterAndSortConstraints(
  allConstraints: ConstraintLike[],
  opts: {
    filterType: string;
    filterStatus: string;
    filterPriority: string;
    search: string;
    seqFilter: unknown;
    matchesSequenceFilter: (c: ConstraintLike, seqFilter: unknown) => boolean;
  },
): ConstraintLike[] {
  const q = opts.search.toLowerCase();
  return (allConstraints || [])
    .filter((c) => {
      if (opts.filterType !== "all" && c.constraint_type !== opts.filterType) return false;
      if (opts.filterStatus === "open" && RESOLVED_STATUSES.includes(c.status as any)) return false;
      if (
        opts.filterStatus !== "all"
        && opts.filterStatus !== "open"
        && c.status !== opts.filterStatus
      ) {
        return false;
      }
      if (opts.filterPriority !== "all" && c.priority !== opts.filterPriority) return false;
      if (!opts.matchesSequenceFilter(c, opts.seqFilter)) return false;
      if (
        q
        && ![
          c.title,
          c.description,
          c.project_area,
          c.assigned_to,
          c.constraint_number,
          c._source_ref,
          c._source_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aResolved = RESOLVED_STATUSES.includes(a.status as any);
      const bResolved = RESOLVED_STATUSES.includes(b.status as any);
      if (aResolved !== bResolved) return aResolved ? 1 : -1;
      const aP = PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] ?? 2;
      const bP = PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER] ?? 2;
      if (aP !== bP) return aP - bP;
      const aOverdue = isOverdue(a);
      const bOverdue = isOverdue(b);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return 0;
    });
}
