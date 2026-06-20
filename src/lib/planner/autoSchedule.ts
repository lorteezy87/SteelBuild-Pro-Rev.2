/**
 * autoSchedule.ts — pure, deterministic personal-planner scheduler.
 *
 * Ported from the Motion-style planner artifact. No backend dependency: the
 * schedule is COMPUTED ON READ from the caller's open action_items + meetings
 * and is never persisted (persisting it would just go stale the moment a task
 * moves). Keeping it pure also makes it trivially unit-testable and gives the
 * planner a deterministic fallback that never depends on the network.
 *
 * Contract: greedily packs each open task's estimated hours into the next
 * available work-hour slots over the coming 7 days, skipping past hours,
 * non-workdays, and any hour already busy with a meeting. Tasks that finish
 * after their deadline are flagged `late`; tasks that don't fit in the week
 * are flagged `unscheduled`.
 */

export type PlannerPriority = "Critical" | "High" | "Medium" | "Low";

export type PlannerTask = {
  id: string;
  projectId: string;
  title: string;
  priority: PlannerPriority;
  estimatedHours: number;
  deadline: string | null; // 'YYYY-MM-DD'
  status: string; // action_items.status
  createdAt: number; // epoch ms — tie-breaker for equal priority/deadline
};

export type PlannerMeeting = {
  id: string;
  date: string; // 'YYYY-MM-DD'
  startHour: number; // 0–23
  endHour: number; // 0–23, exclusive
  title: string;
};

export type WorkSettings = {
  workStart: number; // first work hour, e.g. 7
  workEnd: number; // last work hour (exclusive), e.g. 16
  workdays: number[]; // JS getDay() values, 0=Sun … 6=Sat. e.g. [1,2,3,4,5]
};

/** Lower weight = scheduled first. */
const PRI_WEIGHT: Record<PlannerPriority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

/** Statuses that mean "no longer needs scheduling". */
const CLOSED_STATUSES = new Set([
  "complete",
  "completed",
  "closed",
  "resolved",
  "done",
  "cancelled",
  "canceled",
]);

export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  workStart: 7,
  workEnd: 16,
  workdays: [1, 2, 3, 4, 5],
};

/** A single packable hour on the calendar. */
type Slot = { date: string; hour: number };

export type SlotFlag = "ok" | "late" | "unscheduled";

export type Assignment = {
  taskId: string;
  slots: Slot[];
};

export type PlannerSchedule = {
  /** 7 ISO date strings, today → +6 days. */
  days: string[];
  /** Work hours rendered as grid rows, workStart … workEnd-1. */
  hours: number[];
  /** `${date}|${hour}` → taskId for the grid. */
  slotAssignments: Map<string, string>;
  /** `${date}|${hour}` → meeting occupying that slot. */
  meetingSlots: Map<string, PlannerMeeting>;
  /** taskId → outcome flag. */
  taskFlags: Map<string, SlotFlag>;
  /** Per-task packed slots (only for tasks that got at least one slot). */
  assignments: Assignment[];
  /** taskIds that ran out of week. */
  unscheduled: string[];
};

/** Local-time 'YYYY-MM-DD'. */
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function slotKey(date: string, hour: number): string {
  return `${date}|${hour}`;
}

export function priorityWeight(priority: string | null | undefined): number {
  if (priority && priority in PRI_WEIGHT) {
    return PRI_WEIGHT[priority as PlannerPriority];
  }
  return PRI_WEIGHT.Medium; // unknown priorities sort with Medium
}

export function isClosedStatus(status: string | null | undefined): boolean {
  return CLOSED_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

/** Hours a single task needs, as whole 1-hour slots (min 1). */
function slotsNeeded(estimatedHours: number): number {
  const h = Number(estimatedHours);
  if (!Number.isFinite(h) || h <= 0) return 1;
  return Math.max(1, Math.ceil(h));
}

/**
 * Order open tasks for greedy packing: priority, then earliest deadline
 * (nulls last), then oldest createdAt. Deterministic and total.
 */
export function orderTasks(tasks: PlannerTask[]): PlannerTask[] {
  return [...tasks].sort((a, b) => {
    const pw = priorityWeight(a.priority) - priorityWeight(b.priority);
    if (pw !== 0) return pw;
    // earliest deadline first; null deadlines sort last
    if (a.deadline !== b.deadline) {
      if (a.deadline === null) return 1;
      if (b.deadline === null) return -1;
      return a.deadline < b.deadline ? -1 : 1;
    }
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
}

/**
 * Compute the week schedule.
 *
 * @param now Injectable reference time (defaults to new Date()) so callers and
 *            tests are deterministic. Hours strictly before `now` are skipped.
 */
export function computeSchedule(
  tasks: PlannerTask[],
  settings: WorkSettings,
  meetings: PlannerMeeting[],
  now: Date = new Date(),
): PlannerSchedule {
  const workStart = Number.isFinite(settings.workStart) ? settings.workStart : DEFAULT_WORK_SETTINGS.workStart;
  const workEnd = Number.isFinite(settings.workEnd) ? settings.workEnd : DEFAULT_WORK_SETTINGS.workEnd;
  const workdays = settings.workdays?.length ? settings.workdays : DEFAULT_WORK_SETTINGS.workdays;
  const workdaySet = new Set(workdays);

  const hours: number[] = [];
  for (let h = workStart; h < workEnd; h++) hours.push(h);

  // 7-day window starting today.
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    days.push(dateKey(d));
  }

  const todayKey = dateKey(now);
  const currentHour = now.getHours();

  // Index meetings by date for fast slot-busy lookup.
  const meetingSlots = new Map<string, PlannerMeeting>();
  for (const m of meetings) {
    if (!m || m.startHour == null || m.endHour == null) continue;
    if (!days.includes(m.date)) continue;
    for (let h = m.startHour; h < m.endHour; h++) {
      meetingSlots.set(slotKey(m.date, h), m);
    }
  }

  // Build the ordered list of available (free, future, workday) slots.
  const available: Slot[] = [];
  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const dow = new Date(`${date}T00:00:00`).getDay();
    if (!workdaySet.has(dow)) continue;
    for (const hour of hours) {
      if (date === todayKey && hour <= currentHour) continue; // past / current partial hour
      const key = slotKey(date, hour);
      if (meetingSlots.has(key)) continue; // busy with a meeting
      available.push({ date, hour });
    }
  }

  const slotAssignments = new Map<string, string>();
  const taskFlags = new Map<string, SlotFlag>();
  const assignments: Assignment[] = [];
  const unscheduled: string[] = [];

  const openTasks = orderTasks(tasks.filter((t) => !isClosedStatus(t.status)));

  let cursor = 0; // next free slot index
  for (const task of openTasks) {
    const need = slotsNeeded(task.estimatedHours);
    if (cursor >= available.length) {
      taskFlags.set(task.id, "unscheduled");
      unscheduled.push(task.id);
      continue;
    }
    const taken: Slot[] = [];
    while (taken.length < need && cursor < available.length) {
      const slot = available[cursor];
      slotAssignments.set(slotKey(slot.date, slot.hour), task.id);
      taken.push(slot);
      cursor++;
    }
    assignments.push({ taskId: task.id, slots: taken });

    if (taken.length < need) {
      // Ran out of week mid-task — it couldn't be fully placed. Keep the partial
      // slots on the grid but flag it so the user knows it won't finish.
      taskFlags.set(task.id, "unscheduled");
      unscheduled.push(task.id);
      continue;
    }

    // Fully placed. Did the last slot land after the deadline? (date-only
    // compare — ISO 'YYYY-MM-DD' strings sort lexicographically.)
    const lastSlot = taken[taken.length - 1];
    if (task.deadline && lastSlot && lastSlot.date > task.deadline) {
      taskFlags.set(task.id, "late");
    } else {
      taskFlags.set(task.id, "ok");
    }
  }

  return {
    days,
    hours,
    slotAssignments,
    meetingSlots,
    taskFlags,
    assignments,
    unscheduled,
  };
}
