import { describe, expect, it } from "vitest";
import { buildWeatherRiskByTask, computeScheduleStats } from "../scheduleGanttStats";

describe("buildWeatherRiskByTask", () => {
  it("only attaches risks to weather-sensitive phases", () => {
    const risks = [{ id: "r1" }];
    const out = buildWeatherRiskByTask(
      { risks },
      [
        { id: "t1", phase: "Installation" },
        { id: "t2", phase: "Detailing" },
      ],
      () => "2026-07-01",
      () => "2026-07-03",
      (list) => list,
    );
    expect(Object.keys(out)).toEqual(["t1"]);
  });
});

describe("computeScheduleStats", () => {
  it("counts complete / in-progress / unscheduled actionable tasks", () => {
    const tasks = [
      { id: "a", status: "Complete", dependencies: "[]" },
      { id: "b", status: "In Progress", dependencies: "[]" },
      { id: "c", status: "Not Started", dependencies: "[]" },
    ];
    const stats = computeScheduleStats(tasks, {
      today: new Date("2026-07-01T00:00:00.000Z"),
      effectiveDates: {},
      weatherRiskByTask: {},
      effStart: (t) => (t.id === "c" ? null : "2026-07-01"),
      effEnd: (t) => (t.id === "c" ? null : "2026-07-02"),
      isOverdue: () => false,
    });
    expect(stats.totalTasks).toBe(3);
    expect(stats.completeTasks).toBe(1);
    expect(stats.inProgressTasks).toBe(1);
    expect(stats.unscheduledTasks).toBe(1);
  });
});
