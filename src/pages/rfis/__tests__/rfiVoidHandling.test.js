/**
 * Regression tests for the Void RFI gaps found in the module audit.
 *
 * Void is one of the six statuses the `rfis.status` CHECK constraint allows and
 * it is terminal, but the module treated it as if it did not exist: counted in
 * the total, absent from every bucket and filter, dropped from the board, aged
 * forever, still raising overdue alerts, and rendered as an amber "Open" pill.
 */
import { describe, expect, it } from "vitest";
import { buildRfiCounts, daysOpen, filterAndSortRfis, isClosed, isOverdue } from "../utils";
import { statusColumns, STATUS_CFG } from "../constants";
import { planRfiOverdueAlerts } from "../rfiOverdueAlerts";

const rfi = (over = {}) => ({
  id: "r1",
  rfi_number: "RFI 001",
  status: "Open",
  priority: "Medium",
  submitted_date: "2026-01-01",
  ...over,
});

const passthroughSeq = () => true;
const noFilters = { filter: "all", disciplineFilter: "All", seqFilter: null, search: "" };

const planOpts = {
  existingRelatedIds: new Set(),
  existingTitles: new Set(),
  alreadyCreatedIds: new Set(),
  projectMap: {},
};

describe("Void is terminal everywhere", () => {
  it("counts as closed", () => {
    expect(isClosed(rfi({ status: "Void" }))).toBe(true);
  });

  it("is never overdue, however old the due date", () => {
    expect(isOverdue(rfi({ status: "Void", date_required: "2020-01-01" }))).toBe(false);
  });

  it("stops ageing instead of accruing days-open forever", () => {
    // daysOpen's terminal check was a local ["Answered","Closed"] list that
    // omitted Void, so a voided RFI aged against today and floated to the top
    // of age-sorted views.
    const voided = rfi({ status: "Void", submitted_date: "2020-01-01", date_answered: "2020-01-11" });
    expect(daysOpen(voided)).toBe(10);
  });
});

describe("Void is reachable in the UI", () => {
  it("has its own count bucket, and buckets reconcile against the total", () => {
    const rows = [
      rfi({ id: "a", status: "Open" }),
      rfi({ id: "b", status: "Under Review" }),
      rfi({ id: "c", status: "Incomplete Response" }),
      rfi({ id: "d", status: "Answered" }),
      rfi({ id: "e", status: "Closed" }),
      rfi({ id: "f", status: "Void" }),
    ];
    const c = buildRfiCounts(rows);
    expect(c.void).toBe(1);
    expect(c.open + c.review + c.incomplete + c.answered + c.closed + c.void).toBe(c.all);
  });

  it("splits the register into live vs settled work", () => {
    const rows = [
      rfi({ id: "a", status: "Open" }),
      rfi({ id: "b", status: "Under Review" }),
      rfi({ id: "c", status: "Answered" }),
      rfi({ id: "d", status: "Void" }),
    ];
    const c = buildRfiCounts(rows);
    expect(c.liveOpen).toBe(2);
    expect(c.liveClosed).toBe(2);
    expect(c.liveOpen + c.liveClosed).toBe(c.all);
  });

  it("is selectable by filter instead of being visible only under 'all'", () => {
    const rows = [rfi({ id: "a", status: "Open" }), rfi({ id: "b", status: "Void" })];
    const voids = filterAndSortRfis(rows, { ...noFilters, filter: "void" }, passthroughSeq);
    expect(voids.map((r) => r.id)).toEqual(["b"]);
  });

  it("supports lifecycle filters the per-status chips could not express", () => {
    const rows = [
      rfi({ id: "a", status: "Open" }),
      rfi({ id: "b", status: "Answered" }),
      rfi({ id: "c", status: "Void" }),
    ];
    expect(
      filterAndSortRfis(rows, { ...noFilters, filter: "live" }, passthroughSeq).map((r) => r.id),
    ).toEqual(["a"]);
    expect(
      filterAndSortRfis(rows, { ...noFilters, filter: "settled" }, passthroughSeq).map((r) => r.id),
    ).toEqual(["b", "c"]);
  });

  it("has a board column, so voided RFIs are not dropped off the board", () => {
    expect(statusColumns).toContain("Void");
  });

  it("has its own palette and does not borrow Open's amber", () => {
    // ListView and DetailPanel both resolve via STATUS_CFG[status] || STATUS_CFG.Open.
    expect(STATUS_CFG.Void).toBeDefined();
    expect(STATUS_CFG.Void.color).not.toBe(STATUS_CFG.Open.color);
  });
});

describe("Void raises no overdue alerts", () => {
  const longPastDue = "2020-01-01";

  it("plans no alert for a voided RFI with a long-past due date", () => {
    const planned = planRfiOverdueAlerts(
      [{ id: "r1", status: "Void", date_required: longPastDue, rfi_number: "RFI 001" }],
      planOpts,
    );
    expect(planned).toHaveLength(0);
  });

  it("still plans one for a genuinely open overdue RFI", () => {
    const planned = planRfiOverdueAlerts(
      [{ id: "r2", status: "Open", date_required: longPastDue, rfi_number: "RFI 002" }],
      planOpts,
    );
    expect(planned).toHaveLength(1);
    expect(planned[0].rfiId).toBe("r2");
  });

  it("plans none for Answered or Closed either", () => {
    const planned = planRfiOverdueAlerts(
      [
        { id: "a", status: "Answered", date_required: longPastDue, rfi_number: "RFI 003" },
        { id: "b", status: "Closed", date_required: longPastDue, rfi_number: "RFI 004" },
      ],
      planOpts,
    );
    expect(planned).toHaveLength(0);
  });
});
