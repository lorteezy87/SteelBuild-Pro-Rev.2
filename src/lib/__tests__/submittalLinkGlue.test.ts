import { describe, expect, it } from "vitest";
import {
  buildCreateInitialFromSet,
  buildStatusSuggestPatch,
  filterSuggestAgainstCurrent,
  isOpenForLink,
  needsUnlinkedSubmittalHint,
  openLinkedSubmittalsForSet,
} from "../submittalLinkGlue";

describe("isOpenForLink", () => {
  it("treats Draft / Submitted / Under Review / R&R as open", () => {
    expect(isOpenForLink({ status: "Draft" })).toBe(true);
    expect(isOpenForLink({ status: "Submitted" })).toBe(true);
    expect(isOpenForLink({ status: "Under Review" })).toBe(true);
    expect(isOpenForLink({ status: "Revise and Resubmit" })).toBe(true);
  });

  it("treats terminal + Void as closed", () => {
    expect(isOpenForLink({ status: "Approved" })).toBe(false);
    expect(isOpenForLink({ status: "Approved as Noted" })).toBe(false);
    expect(isOpenForLink({ status: "Released for Fabrication" })).toBe(false);
    expect(isOpenForLink({ status: "Void" })).toBe(false);
  });

  it("skips deleted rows", () => {
    expect(isOpenForLink({ status: "Submitted", is_deleted: true })).toBe(false);
  });
});

describe("openLinkedSubmittalsForSet", () => {
  const rows = [
    { id: "a", status: "Submitted", drawing_set_ids: ["set-1"], submittal_number: "001" },
    { id: "b", status: "Approved", drawing_set_ids: ["set-1"], submittal_number: "002" },
    { id: "c", status: "Under Review", drawing_set_ids: ["set-2"], submittal_number: "003" },
    { id: "d", status: "Draft", drawing_set_ids: ["set-1"], is_deleted: true, submittal_number: "004" },
    { id: "e", status: "Revise and Resubmit", drawing_set_ids: ["set-1", "set-2"], submittal_number: "005" },
  ];

  it("returns [] when no open linked submittals", () => {
    expect(openLinkedSubmittalsForSet("set-missing", rows)).toEqual([]);
    expect(openLinkedSubmittalsForSet("set-1", [
      { id: "b", status: "Approved", drawing_set_ids: ["set-1"] },
    ])).toEqual([]);
  });

  it("returns the single open linked submittal", () => {
    const only = openLinkedSubmittalsForSet("set-2", [
      { id: "c", status: "Under Review", drawing_set_ids: ["set-2"], submittal_number: "003" },
    ]);
    expect(only.map((s) => s.id)).toEqual(["c"]);
  });

  it("returns all open linked submittals for a set (N)", () => {
    const many = openLinkedSubmittalsForSet("set-1", rows);
    expect(many.map((s) => s.id).sort()).toEqual(["a", "e"]);
  });
});

describe("buildStatusSuggestPatch", () => {
  it("suggests Detailer BIC after R&R when ball was still with EOR", () => {
    const patch = buildStatusSuggestPatch(
      { status: "Submitted", ball_in_court: "EOR", submitted_date: "2026-07-01" },
      "Revise and Resubmit",
      { today: "2026-07-26" },
    );
    expect(patch).toMatchObject({
      ball_in_court: "Detailer",
      returned_date: "2026-07-26",
    });
  });

  it("suggests submitted_date when sending out without one", () => {
    const patch = buildStatusSuggestPatch(
      { status: "Draft", ball_in_court: "Detailer", submitted_date: null },
      "Submitted",
      { today: "2026-07-26" },
    );
    expect(patch?.submitted_date).toBe("2026-07-26");
    expect(patch?.ball_in_court).toBe("EOR");
  });

  it("returns null when status change already has matching BIC and dates", () => {
    const patch = buildStatusSuggestPatch(
      {
        status: "Revise and Resubmit",
        ball_in_court: "Detailer",
        submitted_date: "2026-07-01",
        returned_date: "2026-07-10",
      },
      "Revise and Resubmit",
      { today: "2026-07-26" },
    );
    expect(patch).toBeNull();
  });

  it("re-stamps returned_date on every transition INTO a verdict status, even when a prior cycle's date exists", () => {
    const patch = buildStatusSuggestPatch(
      { status: "Under Review", ball_in_court: "EOR", submitted_date: "2026-07-20", returned_date: "2026-06-01" },
      "Approved as Noted",
      { today: "2026-07-26" },
    );
    expect(patch?.returned_date).toBe("2026-07-26");
    const rr = buildStatusSuggestPatch(
      { status: "Approved", ball_in_court: "GC", returned_date: "2026-06-01", approved_date: "2026-06-01" },
      "Revise and Resubmit",
      { today: "2026-07-26" },
    );
    expect(rr?.returned_date).toBe("2026-07-26");
  });

  it("does not re-stamp returned_date on a same-status edit that already has one", () => {
    const patch = buildStatusSuggestPatch(
      { status: "Approved", ball_in_court: "GC", returned_date: "2026-06-01", approved_date: "2026-06-01" },
      "Approved",
      { today: "2026-07-26" },
    );
    expect(patch?.returned_date).toBeUndefined();
  });

  it("clears BIC suggestion for Void / Released for Fabrication", () => {
    const patch = buildStatusSuggestPatch(
      { status: "Approved", ball_in_court: "GC", approved_date: "2026-07-01" },
      "Void",
      { today: "2026-07-26" },
    );
    expect(patch).toEqual({ ball_in_court: null });
  });
});

describe("needsUnlinkedSubmittalHint", () => {
  it("is true only when in-flight work and zero open links", () => {
    expect(needsUnlinkedSubmittalHint({ hasInFlightWork: true, openLinkedCount: 0 })).toBe(true);
    expect(needsUnlinkedSubmittalHint({ hasInFlightWork: true, openLinkedCount: 1 })).toBe(false);
    expect(needsUnlinkedSubmittalHint({ hasInFlightWork: false, openLinkedCount: 0 })).toBe(false);
  });
});

describe("buildCreateInitialFromSet", () => {
  it("seeds drawing_set_ids and optional prefilled status", () => {
    expect(buildCreateInitialFromSet("set-1")).toEqual({
      drawing_set_ids: ["set-1"],
      requireLinkedSet: true,
    });
    expect(buildCreateInitialFromSet("set-1", { prefilledStatus: "Submitted" })).toEqual({
      drawing_set_ids: ["set-1"],
      status: "Submitted",
      requireLinkedSet: true,
    });
  });

  it("carries the ball_in_court half of the stage pair, but only alongside a status", () => {
    expect(buildCreateInitialFromSet("set-1", { prefilledStatus: "Approved as Noted", prefilledBallInCourt: "Detailer" })).toEqual({
      drawing_set_ids: ["set-1"],
      status: "Approved as Noted",
      ball_in_court: "Detailer",
      requireLinkedSet: true,
    });
    expect(buildCreateInitialFromSet("set-1", { prefilledBallInCourt: "GC" })).toEqual({
      drawing_set_ids: ["set-1"],
      requireLinkedSet: true,
    });
  });
});

describe("filterSuggestAgainstCurrent", () => {
  it("drops BIC/dates already written on the updated row", () => {
    const filtered = filterSuggestAgainstCurrent(
      { ball_in_court: "EOR", submitted_date: "2026-07-26", returned_date: "2026-07-26" },
      { ball_in_court: "EOR", submitted_date: "2026-07-26", returned_date: null },
    );
    expect(filtered).toEqual({ returned_date: "2026-07-26" });
  });

  it("keeps a returned_date suggestion when the row only carries a stale prior-cycle date", () => {
    expect(
      filterSuggestAgainstCurrent(
        { returned_date: "2026-07-26" },
        { returned_date: "2026-06-01" },
      ),
    ).toEqual({ returned_date: "2026-07-26" });
  });

  it("returns null when nothing remains", () => {
    expect(
      filterSuggestAgainstCurrent(
        { ball_in_court: "Detailer", returned_date: "2026-07-10" },
        { ball_in_court: "Detailer", returned_date: "2026-07-10" },
      ),
    ).toBeNull();
  });
});
