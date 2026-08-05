import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  toISODate,
  mostRecentTuesday,
  formatLongDate,
  shiftDate,
  indexProjectsById,
  buildProjectNoteRows,
  projectIdsWithRows,
  filterAvailableProjects,
  countHighlightedNotes,
} from "../productionNotesHelpers";

describe("productionNotesHelpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00")); // Wednesday
  });
  afterEach(() => vi.useRealTimers());

  it("computes ISO and most recent Tuesday", () => {
    expect(toISODate(new Date("2026-04-21T15:00:00"))).toBe("2026-04-21");
    expect(mostRecentTuesday()).toBe("2026-04-21");
  });

  it("formats and shifts dates", () => {
    expect(formatLongDate("2026-04-21")).toContain("TUESDAY");
    expect(shiftDate("2026-04-21", 7)).toBe("2026-04-28");
  });

  it("indexes projects", () => {
    expect(indexProjectsById([{ id: "a", name: "A" }, { id: "b" }]).get("a")?.name).toBe("A");
  });

  it("groups notes and filters available projects", () => {
    const projectsById = indexProjectsById([
      { id: "p1", name: "Alpha", project_number: "A-1" },
      { id: "p2", name: "Beta", project_number: "B-1" },
    ]);
    const rows = buildProjectNoteRows(
      [
        { project_id: "p2", content: "b" },
        { project_id: "p1", content: "a" },
        { project_id: "gone", content: "x" },
        { project_id: null, content: "skip" },
      ] as any,
      projectsById,
    );
    expect(rows.map((r) => r.projectId)).toEqual(["p1", "p2"]);
    const withRows = projectIdsWithRows(rows);
    expect(
      filterAvailableProjects(
        [
          { id: "p1", name: "Alpha", project_number: "A-1" },
          { id: "p2", name: "Beta", project_number: "B-1" },
          { id: "p3", name: "Gamma", project_number: "G-1" },
        ],
        withRows,
        "gam",
      ).map((p) => p.id),
    ).toEqual(["p3"]);
  });
});

describe("countHighlightedNotes", () => {
  it("counts high-priority bullets", () => {
    expect(countHighlightedNotes([{ is_high_priority: true }, { is_high_priority: false }, {}])).toBe(1);
  });
});
