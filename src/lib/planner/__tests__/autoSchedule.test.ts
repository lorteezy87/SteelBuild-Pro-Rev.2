import { describe, it, expect } from "vitest";
import {
  computeSchedule,
  orderTasks,
  priorityWeight,
  isClosedStatus,
  DEFAULT_WORK_SETTINGS,
  type PlannerTask,
  type WorkSettings,
} from "../autoSchedule";

// Fixed reference: Monday 2026-06-22, 06:00 local — before the work day, so the
// full work week is available. (2026-06-22 is a Monday.)
const NOW = new Date("2026-06-22T06:00:00");

const SETTINGS: WorkSettings = { workStart: 7, workEnd: 16, workdays: [1, 2, 3, 4, 5] };

function task(over: Partial<PlannerTask>): PlannerTask {
  return {
    id: "t",
    projectId: "p",
    title: "task",
    priority: "Medium",
    estimatedHours: 1,
    deadline: null,
    status: "Open",
    createdAt: 0,
    ...over,
  };
}

describe("priorityWeight", () => {
  it("orders Critical < High < Medium < Low and defaults unknown to Medium", () => {
    expect(priorityWeight("Critical")).toBeLessThan(priorityWeight("High"));
    expect(priorityWeight("High")).toBeLessThan(priorityWeight("Medium"));
    expect(priorityWeight("Medium")).toBeLessThan(priorityWeight("Low"));
    expect(priorityWeight("wat")).toBe(priorityWeight("Medium"));
  });
});

describe("isClosedStatus", () => {
  it("treats complete/closed/resolved/cancelled as closed (case-insensitive)", () => {
    expect(isClosedStatus("Complete")).toBe(true);
    expect(isClosedStatus("CLOSED")).toBe(true);
    expect(isClosedStatus("Resolved")).toBe(true);
    expect(isClosedStatus("Cancelled")).toBe(true);
    expect(isClosedStatus("Open")).toBe(false);
    expect(isClosedStatus("In Progress")).toBe(false);
    expect(isClosedStatus(null)).toBe(false);
  });
});

describe("orderTasks", () => {
  it("sorts by priority, then deadline (nulls last), then createdAt", () => {
    const a = task({ id: "a", priority: "Low", deadline: "2026-06-23", createdAt: 1 });
    const b = task({ id: "b", priority: "Critical", deadline: null, createdAt: 5 });
    const c = task({ id: "c", priority: "Medium", deadline: "2026-06-25", createdAt: 2 });
    const d = task({ id: "d", priority: "Medium", deadline: "2026-06-24", createdAt: 9 });
    const order = orderTasks([a, b, c, d]).map((t) => t.id);
    // Critical first, then the two Mediums by earliest deadline, then Low last.
    expect(order).toEqual(["b", "d", "c", "a"]);
  });

  it("breaks ties on createdAt when priority and deadline match", () => {
    const a = task({ id: "a", priority: "High", deadline: "2026-06-23", createdAt: 200 });
    const b = task({ id: "b", priority: "High", deadline: "2026-06-23", createdAt: 100 });
    expect(orderTasks([a, b]).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("computeSchedule", () => {
  it("packs higher-priority work into the earliest free slots", () => {
    const low = task({ id: "low", priority: "Low", estimatedHours: 1 });
    const crit = task({ id: "crit", priority: "Critical", estimatedHours: 1 });
    const s = computeSchedule([low, crit], SETTINGS, [], NOW);
    // Critical takes the first slot (Mon 07:00), Low the next (Mon 08:00).
    expect(s.slotAssignments.get("2026-06-22|7")).toBe("crit");
    expect(s.slotAssignments.get("2026-06-22|8")).toBe("low");
  });

  it("spans multiple consecutive hours for multi-hour estimates", () => {
    const big = task({ id: "big", estimatedHours: 3 });
    const s = computeSchedule([big], SETTINGS, [], NOW);
    expect(s.slotAssignments.get("2026-06-22|7")).toBe("big");
    expect(s.slotAssignments.get("2026-06-22|8")).toBe("big");
    expect(s.slotAssignments.get("2026-06-22|9")).toBe("big");
    expect(s.slotAssignments.get("2026-06-22|10")).toBeUndefined();
  });

  it("skips hours occupied by a meeting", () => {
    const t = task({ id: "t", estimatedHours: 1 });
    const meeting = { id: "m", date: "2026-06-22", startHour: 7, endHour: 9, title: "Standup" };
    const s = computeSchedule([t], SETTINGS, [meeting], NOW);
    // 07 and 08 are busy with the meeting → task lands at 09.
    expect(s.meetingSlots.get("2026-06-22|7")?.id).toBe("m");
    expect(s.slotAssignments.get("2026-06-22|7")).toBeUndefined();
    expect(s.slotAssignments.get("2026-06-22|9")).toBe("t");
  });

  it("excludes closed tasks", () => {
    const done = task({ id: "done", status: "Complete" });
    const s = computeSchedule([done], SETTINGS, [], NOW);
    expect(s.assignments).toHaveLength(0);
    expect([...s.slotAssignments.values()]).not.toContain("done");
  });

  it("flags a task as late when its last slot lands after the deadline", () => {
    // 9 work-hours/day. A 10h task starting Monday spills into Tuesday, past a
    // Monday deadline.
    const t = task({ id: "t", estimatedHours: 10, deadline: "2026-06-22" });
    const s = computeSchedule([t], SETTINGS, [], NOW);
    expect(s.taskFlags.get("t")).toBe("late");
  });

  it("flags tasks that don't fit in the week as unscheduled", () => {
    // Work week = 5 days × 9h = 45 slots. Two 40h tasks = 80h > 45.
    const a = task({ id: "a", estimatedHours: 40, priority: "Critical" });
    const b = task({ id: "b", estimatedHours: 40, priority: "Low" });
    const s = computeSchedule([a, b], SETTINGS, [], NOW);
    expect(s.taskFlags.get("b")).toBe("unscheduled");
    expect(s.unscheduled).toContain("b");
  });

  it("never schedules onto non-workdays", () => {
    const t = task({ id: "t", estimatedHours: 45, priority: "Critical" });
    const s = computeSchedule([t], SETTINGS, [], NOW);
    // No assignment should fall on Saturday (2026-06-27) or Sunday (2026-06-28).
    for (const a of s.assignments) {
      for (const slot of a.slots) {
        const dow = new Date(`${slot.date}T00:00:00`).getDay();
        expect([0, 6]).not.toContain(dow);
      }
    }
  });

  it("skips past hours on the current day", () => {
    const afternoon = new Date("2026-06-22T13:30:00");
    const t = task({ id: "t", estimatedHours: 1 });
    const s = computeSchedule([t], SETTINGS, [], afternoon);
    // Hours up to and including 13 are past → first free slot is 14:00.
    expect(s.slotAssignments.get("2026-06-22|13")).toBeUndefined();
    expect(s.slotAssignments.get("2026-06-22|14")).toBe("t");
  });

  it("uses default work settings when given an empty config", () => {
    expect(DEFAULT_WORK_SETTINGS.workdays).toEqual([1, 2, 3, 4, 5]);
  });
});
