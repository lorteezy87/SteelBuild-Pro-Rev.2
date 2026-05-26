import { describe, expect, it } from "vitest";
import { buildRfiAgenda } from "../rfiAgenda";

// rfiUrgency uses real-time daysSince/daysUntil, so build dates relative to now.
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysAhead = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("buildRfiAgenda", () => {
  it("selects overdue, blocking, due-soon, and awaiting RFIs and drops the rest", () => {
    const rfis = [
      { id: "overdue", rfi_number: "001", title: "Past due", status: "Open", date_required: daysAgo(5) },
      { id: "blocking", rfi_number: "002", title: "Blocks fab", status: "Open", schedule_impact: true, submitted_date: daysAgo(10) },
      { id: "duesoon", rfi_number: "003", title: "Due soon", status: "Open", date_required: daysAhead(2) },
      { id: "awaiting", rfi_number: "004", title: "With EOR", status: "Open", ball_in_court: "EOR", submitted_date: daysAgo(6) },
      { id: "closed", rfi_number: "005", title: "Done", status: "Closed", date_required: daysAgo(20) },
      { id: "answered", rfi_number: "006", title: "Answered", status: "Answered", date_required: daysAgo(20) },
      { id: "fresh", rfi_number: "007", title: "Brand new", status: "Open", ball_in_court: "Contractor", submitted_date: daysAgo(1) },
    ];

    const agenda = buildRfiAgenda(rfis);
    const ids = agenda.items.map((i) => i.rfiId);

    expect(ids).toContain("overdue");
    expect(ids).toContain("blocking");
    expect(ids).toContain("duesoon");
    expect(ids).toContain("awaiting");
    // terminal + low-noise dropped
    expect(ids).not.toContain("closed");
    expect(ids).not.toContain("answered");
    expect(ids).not.toContain("fresh");
    expect(agenda.total).toBe(4);
  });

  it("ranks overdue first, then blocking, then due-soon, then awaiting", () => {
    const rfis = [
      { id: "awaiting", rfi_number: "004", status: "Open", ball_in_court: "EOR", submitted_date: daysAgo(6) },
      { id: "duesoon", rfi_number: "003", status: "Open", date_required: daysAhead(1) },
      { id: "overdue", rfi_number: "001", status: "Open", date_required: daysAgo(5) },
      { id: "blocking", rfi_number: "002", status: "Open", schedule_impact: true, submitted_date: daysAgo(10) },
    ];
    const order = buildRfiAgenda(rfis).items.map((i) => i.rfiId);
    expect(order).toEqual(["overdue", "blocking", "duesoon", "awaiting"]);
  });

  it("groups items and reports counts", () => {
    const rfis = [
      { id: "o1", rfi_number: "001", status: "Open", date_required: daysAgo(8) },
      { id: "o2", rfi_number: "002", status: "Open", date_required: daysAgo(2) },
      { id: "b1", rfi_number: "003", status: "Open", cost_impact: true, submitted_date: daysAgo(9) },
    ];
    const agenda = buildRfiAgenda(rfis);
    expect(agenda.counts.overdue).toBe(2);
    expect(agenda.counts.blocking).toBe(1);
    expect(agenda.groups.Overdue.map((i) => i.rfiId)).toEqual(["o1", "o2"]); // more overdue first
    expect(agenda.groups.Blocking).toHaveLength(1);
  });

  it("carries the human-readable reason, BIC, and priority for each item", () => {
    const rfis = [
      { id: "x", rfi_number: "010", title: "Conn detail", status: "Open", priority: "Critical", ball_in_court: "AOR", date_required: daysAgo(3) },
    ];
    const item = buildRfiAgenda(rfis).items[0];
    expect(item.group).toBe("Overdue");
    expect(item.priority).toBe("Critical");
    expect(item.bic).toBe("AOR");
    expect(typeof item.reason).toBe("string");
    expect(item.reason.length).toBeGreaterThan(0);
  });

  it("returns an empty agenda for no input", () => {
    const agenda = buildRfiAgenda([]);
    expect(agenda.total).toBe(0);
    expect(agenda.items).toEqual([]);
    expect(agenda.groups.Overdue).toEqual([]);
  });

  it("ignores soft-deleted RFIs", () => {
    const rfis = [{ id: "d", rfi_number: "001", status: "Open", date_required: daysAgo(5), is_deleted: true }];
    expect(buildRfiAgenda(rfis).total).toBe(0);
  });
});
