import { describe, it, expect } from "vitest";
import {
  mapRowToPlannerTask,
  mapRowToPlannerMeeting,
  parseHour,
} from "../mappers";

describe("mapRowToPlannerTask", () => {
  it("maps a full row and normalizes priority", () => {
    const t = mapRowToPlannerTask({
      id: "1",
      project_id: "p1",
      title: "Submit anchor bolts",
      priority: "high",
      estimated_hours: "4",
      due_date: "2026-07-01",
      status: "Open",
      created_at: "2026-06-01T00:00:00Z",
    });
    expect(t).toMatchObject({
      id: "1",
      projectId: "p1",
      title: "Submit anchor bolts",
      priority: "High",
      estimatedHours: 4,
      deadline: "2026-07-01",
      status: "Open",
    });
    expect(t.createdAt).toBe(Date.parse("2026-06-01T00:00:00Z"));
  });

  it("defaults missing/invalid fields", () => {
    const t = mapRowToPlannerTask({ id: "2" });
    expect(t.priority).toBe("Medium");
    expect(t.estimatedHours).toBe(1);
    expect(t.deadline).toBeNull();
    expect(t.title).toBe("Untitled task");
    expect(t.projectId).toBe("");
  });

  it("clamps non-positive estimated hours to 1", () => {
    expect(mapRowToPlannerTask({ id: "3", estimated_hours: 0 }).estimatedHours).toBe(1);
    expect(mapRowToPlannerTask({ id: "4", estimated_hours: -5 }).estimatedHours).toBe(1);
  });
});

describe("parseHour", () => {
  it("parses HH:MM:SS and HH:MM", () => {
    expect(parseHour("09:30:00")).toBe(9);
    expect(parseHour("14:00")).toBe(14);
    expect(parseHour("7")).toBe(7);
  });
  it("rejects junk and out-of-range", () => {
    expect(parseHour(null)).toBeNull();
    expect(parseHour("nope")).toBeNull();
    expect(parseHour("25:00")).toBeNull();
  });
});

describe("mapRowToPlannerMeeting", () => {
  it("maps a meeting with a valid time block", () => {
    const m = mapRowToPlannerMeeting({
      id: "m1",
      meeting_date: "2026-06-22",
      start_time: "08:00:00",
      end_time: "09:00:00",
      title: "Coordination",
    });
    expect(m).toEqual({ id: "m1", date: "2026-06-22", startHour: 8, endHour: 9, title: "Coordination" });
  });

  it("returns null when the time block is missing or inverted", () => {
    expect(mapRowToPlannerMeeting({ id: "m2", meeting_date: "2026-06-22" })).toBeNull();
    expect(
      mapRowToPlannerMeeting({ id: "m3", meeting_date: "2026-06-22", start_time: "10:00", end_time: "09:00" }),
    ).toBeNull();
    expect(mapRowToPlannerMeeting({ id: "m4", start_time: "08:00", end_time: "09:00" })).toBeNull();
  });
});
