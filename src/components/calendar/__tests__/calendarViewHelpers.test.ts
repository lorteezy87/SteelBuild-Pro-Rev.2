import { describe, expect, it } from "vitest";
import { bucketEventsByDay, eventsForDay, groupEventsByType } from "../calendarViewHelpers";

describe("bucketEventsByDay", () => {
  it("places multi-day events on each overlapping day", () => {
    const d1 = new Date(2026, 5, 1);
    const d2 = new Date(2026, 5, 2);
    const events = [
      { id: "a", start: "2026-06-01", end: "2026-06-02", type: "task" },
      { id: "b", start: "2026-06-03", end: "2026-06-03", type: "rfi" },
    ];
    const map = bucketEventsByDay([d1, d2], events);
    expect(map.get("2026-06-01")?.map((e) => e.id)).toEqual(["a"]);
    expect(map.get("2026-06-02")?.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("eventsForDay + groupEventsByType", () => {
  it("filters day then groups by type key", () => {
    const day = new Date(2026, 5, 1);
    const events = [
      { id: "1", start: "2026-06-01", type: "task" },
      { id: "2", start: "2026-06-02", type: "task" },
    ];
    const list = eventsForDay(day, events);
    expect(list.map((e) => e.id)).toEqual(["1"]);
    const g = groupEventsByType(list);
    expect(g.get("task")?.length).toBe(1);
  });
});
