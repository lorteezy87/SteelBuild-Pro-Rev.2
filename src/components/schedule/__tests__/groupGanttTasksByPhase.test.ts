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
