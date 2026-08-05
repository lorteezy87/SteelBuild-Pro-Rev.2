import { describe, expect, it } from "vitest";
import { groupGanttTasksByPhase } from "../scheduleGanttHelpers";

describe("groupGanttTasksByPhase", () => {
  const PHASES = [
    { id: 1, key: "Fabrication", label: "Fabrication" },
    { id: 2, key: "Erection", label: "Erection" },
  ];
  const normalizePhase = (t: any) => t.phase;
  const buildTreeOrder = (tasks: any[]) => tasks;

  it("filters and groups by phase", () => {
    const tasks = [
      { id: "1", phase: "Fabrication" },
      { id: "2", phase: "Erection" },
      { id: "3", phase: "Fabrication" },
    ];
    const all = groupGanttTasksByPhase(tasks, "all", {
      normalizePhase,
      PHASES,
      buildTreeOrder,
      uncategorizedColor: "gray",
    });
    expect(all.map((g) => g.phase.key)).toEqual(["Fabrication", "Erection"]);
    expect(all[0].tasks).toHaveLength(2);

    const fab = groupGanttTasksByPhase(tasks, "Fabrication", {
      normalizePhase,
      PHASES,
      buildTreeOrder,
      uncategorizedColor: "gray",
    });
    expect(fab).toHaveLength(1);
    expect(fab[0].tasks.map((t: any) => t.id)).toEqual(["1", "3"]);
  });

  it("puts unknown phases last as Uncategorized", () => {
    const tasks = [{ id: "x", phase: null }];
    const g = groupGanttTasksByPhase(tasks as any, "all", {
      normalizePhase,
      PHASES,
      buildTreeOrder,
      uncategorizedColor: "gray",
    });
    expect(g[0].phase.key).toBe("Uncategorized");
  });
});

import { filterGroupedTasksByVisibleIds } from "../scheduleGanttHelpers";

describe("filterGroupedTasksByVisibleIds", () => {
  it("returns original when no filter set", () => {
    const grouped = [{ phase: { key: "A" }, tasks: [{ id: "1" }] }];
    expect(filterGroupedTasksByVisibleIds(grouped as any, null)).toBe(grouped);
  });
  it("filters tasks and drops empty phases", () => {
    const grouped = [
      { phase: { key: "A" }, tasks: [{ id: "1" }, { id: "2" }] },
      { phase: { key: "B" }, tasks: [{ id: "3" }] },
    ];
    const out = filterGroupedTasksByVisibleIds(grouped as any, new Set(["2"]));
    expect(out).toHaveLength(1);
    expect(out[0].tasks.map((t: any) => t.id)).toEqual(["2"]);
  });
});

import { buildGanttFlatRows, utcToday } from "../scheduleGanttHelpers";

describe("utcToday", () => {
  it("returns UTC midnight for the given date", () => {
    const d = utcToday(new Date("2026-08-05T15:30:00.000Z"));
    expect(d.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });
});

describe("buildGanttFlatRows", () => {
  const fab = { id: 4, key: "Fabrication", label: "Fabrication" };
  const install = { id: 6, key: "Installation", label: "Installation" };
  const effStart = (t: any) => t.start_date;
  const effEnd = (t: any) => t.end_date;

  it("emits phase summaries and tasks, inserts deliveries before Installation", () => {
    const grouped = [
      {
        phase: fab,
        tasks: [
          { id: "t1", start_date: "2026-01-01", end_date: "2026-01-10", percent_complete: 50, _hasChildren: false },
        ],
      },
      {
        phase: install,
        tasks: [
          { id: "t2", start_date: "2026-02-01", end_date: "2026-02-10", percent_complete: 0, _hasChildren: false },
        ],
      },
    ];
    const deliveries = [
      { id: "d1", scheduled_date: "2026-01-20", status: "Scheduled" },
      { id: "d2", scheduled_date: "2026-01-15", status: "Delivered" },
    ];
    const rows = buildGanttFlatRows({
      grouped,
      collapsed: {},
      collapsedTasks: {},
      showDeliveries: true,
      deliveries,
      collapsedDeliveries: false,
      effStart,
      effEnd,
    });
    const types = rows.map((r: any) => r.type);
    expect(types).toEqual([
      "summary",
      "task",
      "delivery-summary",
      "delivery",
      "delivery",
      "summary",
      "task",
    ]);
    // deliveries sorted by scheduled_date
    expect(rows[3].delivery.id).toBe("d2");
    expect(rows[4].delivery.id).toBe("d1");
    expect(rows[2].deliveryCount).toBe(2);
    expect(rows[2].pctComplete).toBe(50);
  });

  it("hides child tasks under collapsed ancestors and collapsed phases", () => {
    const parent = {
      id: "p",
      parent_task_id: null,
      start_date: "2026-01-01",
      end_date: "2026-01-10",
      percent_complete: 0,
      _hasChildren: true,
    };
    const child = {
      id: "c",
      parent_task_id: "p",
      start_date: "2026-01-02",
      end_date: "2026-01-05",
      percent_complete: 0,
      _hasChildren: false,
    };
    const rows = buildGanttFlatRows({
      grouped: [{ phase: fab, tasks: [parent, child] }],
      collapsed: { Fabrication: true },
      collapsedTasks: {},
      showDeliveries: false,
      deliveries: [],
      collapsedDeliveries: false,
      effStart,
      effEnd,
    });
    expect(rows.map((r: any) => r.type)).toEqual(["summary"]);

    const openPhase = buildGanttFlatRows({
      grouped: [{ phase: fab, tasks: [parent, child] }],
      collapsed: {},
      collapsedTasks: { p: true },
      showDeliveries: false,
      deliveries: [],
      collapsedDeliveries: false,
      effStart,
      effEnd,
    });
    expect(openPhase.filter((r: any) => r.type === "task").map((r: any) => r.task.id)).toEqual(["p"]);
  });

  it("appends deliveries when no Installation phase exists", () => {
    const rows = buildGanttFlatRows({
      grouped: [
        {
          phase: fab,
          tasks: [{ id: "t1", start_date: "a", end_date: "b", percent_complete: 0, _hasChildren: false }],
        },
      ],
      collapsed: {},
      collapsedTasks: {},
      showDeliveries: true,
      deliveries: [{ id: "d1", scheduled_date: "2026-01-01", status: "Scheduled" }],
      collapsedDeliveries: true,
      effStart,
      effEnd,
    });
    expect(rows.map((r: any) => r.type)).toEqual(["summary", "task", "delivery-summary"]);
  });
});

import { isGanttTaskOverdue, ganttTint } from "../scheduleGanttHelpers";

describe("isGanttTaskOverdue / ganttTint", () => {
  const today = new Date("2026-08-01T00:00:00.000Z");
  const effEnd = (t: any) => t.end_date;

  it("flags incomplete tasks past effective end", () => {
    expect(isGanttTaskOverdue({ status: "In Progress", end_date: "2026-07-01" }, effEnd, today)).toBe(true);
    expect(isGanttTaskOverdue({ status: "Complete", end_date: "2026-07-01" }, effEnd, today)).toBe(false);
    expect(isGanttTaskOverdue({ status: "In Progress", end_date: "2026-09-01" }, effEnd, today)).toBe(false);
    expect(isGanttTaskOverdue(null, effEnd, today)).toBe(false);
  });

  it("builds color-mix tint strings", () => {
    expect(ganttTint("red", 12)).toBe("color-mix(in srgb, red 12%, transparent)");
  });
});
