import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { applyEffectiveDates, computeEffectiveDates } from "@/services/scheduleCascade";
import { buildParentIdSet, isSummaryTask } from "@/lib/schedule/summaryTasks";
import { buildCalendarEvents } from "@/lib/calendarEvents";

/**
 * Cover for audit §1.2 on the Project Calendar — it rendered STORED dates while
 * the Gantt, a sibling tab in the same ScheduleHub shell, rendered cascaded
 * ones. Same task, different week, two clicks apart.
 *
 * Summary rows are suppressed rather than overlaid: their dates roll up from
 * their children, so a parent duplicated its children's span as a separate pill
 * on a flat surface that caps at 3 pills per day.
 */

const CAL_SRC = readFileSync(new URL("../ProjectCalendar.jsx", import.meta.url), "utf8");

// Approval (Detailing) gates fabrication across a phase boundary, and both sit
// under a summary parent.
const TASKS = [
  { id: "sum", task_name: "Erection phase", start_date: "2026-03-02", end_date: "2026-03-20" },
  { id: "det", task_name: "Approve drawings", parent_task_id: "sum", start_date: "2026-03-02", end_date: "2026-03-06" },
  {
    id: "fab",
    task_name: "Fabricate beams",
    parent_task_id: "sum",
    start_date: "2026-03-02",
    end_date: "2026-03-09",
    dependencies: JSON.stringify([{ id: "det", type: "FS", lag_days: 1 }]),
  },
];

/** Mirrors the page's derivation exactly. */
function calendarRows(tasks: Record<string, unknown>[]) {
  const parentIds = buildParentIdSet(tasks);
  return applyEffectiveDates(tasks, computeEffectiveDates(tasks)).filter(
    (t) => !isSummaryTask(t, parentIds),
  );
}

describe("Project Calendar rows", () => {
  it("places a cascaded task on its effective date, not its stored one", () => {
    const fab = calendarRows(TASKS).find((t) => t.id === "fab")!;
    // det ends Fri 03-06; FS+1 is Mon 03-09, not Sat 03-07 (§2.1 — the
    // cascade no longer starts work on a weekend).
    expect(fab.start_date).toBe("2026-03-09");
    expect(fab._stored_start_date).toBe("2026-03-02");
  });

  it("suppresses summary rows", () => {
    const ids = calendarRows(TASKS).map((t) => t.id);
    expect(ids).not.toContain("sum");
    expect(ids).toEqual(expect.arrayContaining(["det", "fab"]));
  });

  it("detects the summary by parentage, since this page runs no tree builder", () => {
    // _hasChildren / _isRolledUpSummary are set by the Gantt's buildTreeOrder,
    // which the calendar never calls. Only the parentIds branch can catch it.
    const raw = TASKS.find((t) => t.id === "sum")!;
    expect(raw).not.toHaveProperty("_hasChildren");
    expect(isSummaryTask(raw, buildParentIdSet(TASKS))).toBe(true);
  });

  it("a leaf task with no children is never suppressed", () => {
    const solo = [{ id: "solo", task_name: "Punch list", start_date: "2026-05-01", end_date: "2026-05-02" }];
    expect(calendarRows(solo).map((t) => t.id)).toEqual(["solo"]);
  });
});

describe("calendar events built from those rows", () => {
  const events = buildCalendarEvents({
    scheduleTasks: calendarRows(TASKS),
    deliveries: [], rfis: [], submittals: [], changeOrders: [],
    actionItems: [], inspections: [], dailyLogs: [], project: null,
  });

  it("emits no pill for the suppressed summary", () => {
    expect(events.find((e) => e.entityId === "sum")).toBeUndefined();
  });

  it("the cascaded pill sits on the effective date", () => {
    expect(events.find((e) => e.entityId === "fab")!.start).toBe("2026-03-09");
  });

  it("marks a cascaded pill as derived rather than entered", () => {
    // Without this the change would trade a visible divergence (calendar vs
    // Gantt) for an invisible one: a pill silently showing a date nobody typed.
    expect(events.find((e) => e.entityId === "fab")!.subtitle).toMatch(/cascaded \+\d+d/);
    expect(events.find((e) => e.entityId === "det")!.subtitle).not.toMatch(/cascaded/);
  });
});

describe("wiring", () => {
  it("the grid and the .ics export read the SAME derived rows", () => {
    // An .ics that disagreed with the calendar it came from would be a new
    // divergence, so both must consume calendarScheduleTasks.
    expect(CAL_SRC).toMatch(/scheduleTasks:\s*calendarScheduleTasks/);
    expect(CAL_SRC).toMatch(/calendarScheduleTasks\.forEach\(/);
    expect(CAL_SRC).not.toMatch(/\n\s*scheduleTasks\.forEach\(/);
  });

  it("uses a useMemo, not a react-query select", () => {
    // Five observers plus an optimistic writer share this cache key; a memo
    // cannot perturb what any of them read, and fails loudly rather than
    // silently yielding nothing.
    expect(CAL_SRC).toMatch(/const calendarScheduleTasks = useMemo/);
    expect(CAL_SRC).not.toMatch(/select:\s*\(/);
  });

  it("warns about cycle members and surfaces the row cap", () => {
    expect(CAL_SRC).toMatch(/computeCycleTaskIdsKey/);
    expect(CAL_SRC).toMatch(/predecessor cycle/);
    expect(CAL_SRC).toMatch(/<ListTruncationNotice/);
  });
});
