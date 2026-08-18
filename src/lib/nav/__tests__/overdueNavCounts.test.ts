import { describe, expect, it } from "vitest";
import {
  countOverdueDeliveries,
  countOverdueDrawings,
  countOverdueRfis,
  deliveryNavOverdueConditions,
  drawingNavOverdueConditions,
  rfiNavOverdueConditions,
} from "../overdueNavCounts";

const NOW = Date.parse("2026-08-18T12:00:00.000Z");
const ISO = "2026-08-18T12:00:00.000Z";

describe("nav overdue conditions", () => {
  it("asks PostgREST for past-due open RFIs only", () => {
    expect(rfiNavOverdueConditions("proj-1", ISO)).toEqual({
      project_id: "proj-1",
      "date_required.lt": ISO,
      "status.nin": ["Answered", "Closed"],
    });
  });

  it("asks PostgREST for unreleased past-due drawings", () => {
    expect(drawingNavOverdueConditions("proj-1", ISO)).toEqual({
      project_id: "proj-1",
      "due_date.lt": ISO,
      "stage.neq": "Released",
    });
  });

  it("asks PostgREST for undelivered past-due deliveries", () => {
    expect(deliveryNavOverdueConditions("proj-1", ISO)).toEqual({
      project_id: "proj-1",
      "scheduled_date.lt": ISO,
      "status.neq": "Delivered",
    });
  });
});

describe("nav overdue counters", () => {
  it("ignores closed or future RFIs", () => {
    expect(countOverdueRfis([
      { date_required: "2026-08-01", status: "Open" },
      { date_required: "2026-08-01", status: "Closed" },
      { date_required: "2026-08-20", status: "Open" },
    ], NOW)).toBe(1);
  });

  it("ignores released or future drawings", () => {
    expect(countOverdueDrawings([
      { due_date: "2026-08-01", stage: "Shop" },
      { due_date: "2026-08-01", stage: "Released" },
    ], NOW)).toBe(1);
  });

  it("ignores delivered or future deliveries", () => {
    expect(countOverdueDeliveries([
      { scheduled_date: "2026-08-01", status: "In Transit" },
      { scheduled_date: "2026-08-01", status: "Delivered" },
    ], NOW)).toBe(1);
  });
});
