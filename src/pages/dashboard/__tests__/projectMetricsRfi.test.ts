import { describe, expect, it } from "vitest";
import {
  openRFICount,
  overdueRFICount,
  rfiAgingBuckets,
  oldestOpenRFIAgeDays,
  ballInCourtRollup,
  rfiStatusRollup,
  overdueDeliveryCount,
} from "../projectMetrics";

const PAST = "2020-01-01";

describe("projectMetrics RFI predicates (chk_rfis_status vocabulary)", () => {
  const rfis = [
    { status: "Open", date_required: PAST, submitted_date: PAST, ball_in_court: "GC" },
    { status: "Under Review", date_required: PAST, submitted_date: PAST, ball_in_court: "Engineer" },
    { status: "Incomplete Response", date_required: PAST, submitted_date: PAST, ball_in_court: "Architect" },
    { status: "Answered", date_required: PAST, submitted_date: PAST, ball_in_court: "GC" },
    { status: "Closed", date_required: PAST, submitted_date: PAST, ball_in_court: "GC" },
    { status: "Void", date_required: PAST, submitted_date: PAST, ball_in_court: "GC" },
  ];

  it("openRFICount excludes Answered, Closed and Void", () => {
    expect(openRFICount(rfis)).toBe(3);
  });

  it("overdueRFICount ignores terminal RFIs even when past date_required", () => {
    expect(overdueRFICount(rfis)).toBe(3);
  });

  it("aging / oldest / ball-in-court rollups only look at open RFIs", () => {
    const total = rfiAgingBuckets(rfis).reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(3);
    expect(oldestOpenRFIAgeDays([{ status: "Void", submitted_date: PAST }])).toBe(0);
    const bic = ballInCourtRollup(rfis);
    expect(bic.GC).toBe(1);
    expect(bic.Engineer).toBe(1);
    expect(bic.Architect).toBe(1);
  });

  it("rfiStatusRollup buckets are exactly the DB statuses", () => {
    const rollup = rfiStatusRollup([...rfis, { status: "Draft" }, { status: null }]);
    expect(Object.keys(rollup)).toEqual([
      "Open",
      "Under Review",
      "Incomplete Response",
      "Answered",
      "Closed",
      "Void",
    ]);
    expect(rollup).toEqual({
      "Open": 1,
      "Under Review": 1,
      "Incomplete Response": 1,
      "Answered": 1,
      "Closed": 1,
      "Void": 1,
    });
  });
});

describe("overdueDeliveryCount (deliveries union table)", () => {
  it("counts only open logistics rows past their scheduled date", () => {
    const deliveries = [
      { status: "Scheduled", scheduled_date: PAST },                                  // late
      { status: "In Transit", scheduled_date: PAST },                                 // late
      { status: "Delivered", scheduled_date: PAST },                                  // closed
      { status: "received", scheduled_date: PAST },                                   // closed (case-insensitive)
      { status: "Cancelled", scheduled_date: PAST },                                  // closed
      { status: "Identified", scheduled_date: PAST, delivery_type: "PROCUREMENT" },   // procurement pipeline
      { status: "Scheduled", scheduled_date: null },                                  // unscheduled
      { status: "Scheduled", scheduled_date: "2999-01-01" },                          // future
    ];
    expect(overdueDeliveryCount(deliveries)).toBe(2);
  });
});
