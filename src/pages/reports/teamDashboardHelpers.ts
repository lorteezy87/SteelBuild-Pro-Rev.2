/** Pure helpers for Team Dashboard — open work per assignee. */

import { isActionItemOpen, isRfiOpen } from "@/lib/entityPredicates";

export type TeamPerson = {
  name: string;
  tasks: number;
  rfis: number;
  actions: number;
  total: number;
};

export type TeamOpenTotals = {
  tasks: number;
  rfis: number;
  actions: number;
};

/** Schedule-task open rule (not Complete / Cancelled). */
export function isOpenScheduleTask(t: { status?: string | null } | null | undefined): boolean {
  return t?.status !== "Complete" && t?.status !== "Cancelled";
}

export function buildTeamPeople(input: {
  tasks?: Array<{ status?: string | null; assigned_to?: string | null }>;
  rfis?: Array<{
    status?: string | null;
    assigned_to?: string | null;
    ball_in_court?: string | null;
  }>;
  actionItems?: Array<{ status?: string | null; assigned_to?: string | null }>;
}): TeamPerson[] {
  const m: Record<string, Omit<TeamPerson, "total">> = {};
  const ensure = (name: string) => {
    if (!m[name]) m[name] = { name, tasks: 0, rfis: 0, actions: 0 };
    return m[name];
  };

  for (const t of (input.tasks || []).filter(isOpenScheduleTask)) {
    const a = (t.assigned_to || "").trim();
    if (a) ensure(a).tasks += 1;
  }
  for (const r of (input.rfis || []).filter(isRfiOpen)) {
    const a = (r.assigned_to || r.ball_in_court || "").trim();
    if (a) ensure(a).rfis += 1;
  }
  for (const it of (input.actionItems || []).filter(isActionItemOpen)) {
    const a = (it.assigned_to || "").trim();
    if (a) ensure(a).actions += 1;
  }

  return Object.values(m)
    .map((p) => ({ ...p, total: p.tasks + p.rfis + p.actions }))
    .sort((a, b) => b.total - a.total);
}

export function teamOpenTotals(input: {
  tasks?: Array<{ status?: string | null }>;
  rfis?: Array<{ status?: string | null }>;
  actionItems?: Array<{ status?: string | null }>;
}): TeamOpenTotals {
  return {
    tasks: (input.tasks || []).filter(isOpenScheduleTask).length,
    rfis: (input.rfis || []).filter(isRfiOpen).length,
    actions: (input.actionItems || []).filter(isActionItemOpen).length,
  };
}
