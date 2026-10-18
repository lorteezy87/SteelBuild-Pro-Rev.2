import { describe, expect, it } from "vitest";
import {
  buildDelayLedgerCsv,
  buildReviewDelayLedger,
  delayTier,
  type LedgerRound,
  type LedgerSubmittal,
} from "../reviewDelayLedger";

// 2026-07-06 is a Monday.
const TODAY = "2026-08-03"; // Monday

const sub = (over: Partial<LedgerSubmittal> = {}): LedgerSubmittal => ({
  id: "s1",
  submittal_number: "SUB-001",
  title: "Main building columns",
  status: "Under Review",
  reviewer: "EOR",
  ...over,
});

describe("delayTier", () => {
  it("steps at 7 / 14 / 21 calendar days over", () => {
    expect(delayTier(0)).toBe("on_time");
    expect(delayTier(1)).toBe("follow_up");
    expect(delayTier(6)).toBe("follow_up");
    expect(delayTier(7)).toBe("reviewer_escalation");
    expect(delayTier(13)).toBe("reviewer_escalation");
    expect(delayTier(14)).toBe("executive_escalation");
    expect(delayTier(20)).toBe("executive_escalation");
    expect(delayTier(21)).toBe("delay_notice");
  });
});

describe("buildReviewDelayLedger — working-day basis", () => {
  it("uses the project's approval lead (default 10 working days)", () => {
    const l = buildReviewDelayLedger({ submittals: [], rounds: [], today: TODAY });
    expect(l.allowanceDays).toBe(10);
    const l2 = buildReviewDelayLedger({
      submittals: [],
      rounds: [],
      today: TODAY,
      projectMeta: { detailing_lead_days: { approval: 7 } },
    });
    expect(l2.allowanceDays).toBe(7);
  });

  it("measures a returned round against sent + allowance", () => {
    // Sent Mon 07-06, 10 working days → due Mon 07-20. Returned Fri 07-24 → 4 working days over.
    const rounds: LedgerRound[] = [
      { submittal_id: "s1", round_number: 1, status: "Revise and Resubmit", submitted_date: "2026-07-06", returned_date: "2026-07-24", reviewer: "EOR" },
    ];
    const l = buildReviewDelayLedger({ submittals: [sub({ status: "Revise and Resubmit" })], rounds, today: TODAY });
    const e = l.entries[0];
    expect(e.dueDate).toBe("2026-07-20");
    expect(e.open).toBe(false);
    expect(e.daysHeld).toBe(14);
    expect(e.daysOver).toBe(4);
    expect(e.calendarDaysOver).toBe(4);
    expect(e.tier).toBe("follow_up");
    expect(l.summary).toMatchObject({ measured: 1, late: 1, openLate: 0, totalDaysOver: 4, unknown: 0 });
  });

  it("measures an open round up to today and flags a delay notice at 21+ calendar days", () => {
    // Sent 06-15 (Mon) → due 06-29. Today 08-03 → 35 calendar days over, 25 working.
    const rounds: LedgerRound[] = [{ submittal_id: "s1", round_number: 2, status: "Under Review", submitted_date: "2026-06-15" }];
    const l = buildReviewDelayLedger({ submittals: [sub()], rounds, today: TODAY });
    const e = l.entries[0];
    expect(e.open).toBe(true);
    expect(e.dueDate).toBe("2026-06-29");
    expect(e.daysOver).toBe(25);
    expect(e.calendarDaysOver).toBe(35);
    expect(e.tier).toBe("delay_notice");
    expect(l.summary.openLate).toBe(1);
    expect(l.summary.noticeDue).toBe(1);
  });

  it("reports an on-time round with zero days over", () => {
    const rounds: LedgerRound[] = [
      { submittal_id: "s1", round_number: 1, status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-15" },
    ];
    const l = buildReviewDelayLedger({ submittals: [sub({ status: "Approved" })], rounds, today: TODAY });
    expect(l.entries[0].daysOver).toBe(0);
    expect(l.entries[0].tier).toBe("on_time");
    expect(l.summary.late).toBe(0);
  });

  it("lets a linked drawing set's approval override set the allowance", () => {
    const rounds: LedgerRound[] = [
      { submittal_id: "s1", round_number: 1, status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-15" },
    ];
    const l = buildReviewDelayLedger({
      submittals: [sub({ status: "Approved", drawing_set_ids: ["ds-1"] })],
      rounds,
      today: TODAY,
      projectMeta: { detailing_lead_days: { approval: 10 } },
      packageMetaBySetId: new Map([["ds-1", { detailing_lead_days: { approval: 3 } }]]),
    });
    // Due Thu 07-09, returned Wed 07-15 → 4 working days over.
    expect(l.entries[0].allowanceDays).toBe(3);
    expect(l.entries[0].daysOver).toBe(4);
  });
});

describe("buildReviewDelayLedger — calendar basis", () => {
  it("counts the allowance and overrun in calendar days", () => {
    const rounds: LedgerRound[] = [
      { submittal_id: "s1", round_number: 1, status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-24" },
    ];
    const l = buildReviewDelayLedger({ submittals: [sub({ status: "Approved" })], rounds, today: TODAY, basis: "calendar" });
    expect(l.entries[0].dueDate).toBe("2026-07-16");
    expect(l.entries[0].daysOver).toBe(8);
    expect(l.entries[0].calendarDaysOver).toBe(8);
    expect(l.entries[0].tier).toBe("reviewer_escalation");
  });
});

describe("buildReviewDelayLedger — absence is not evidence", () => {
  it("lists a round with no sent date as unknown and keeps it out of totals", () => {
    const rounds: LedgerRound[] = [{ submittal_id: "s1", round_number: 1, status: "Under Review" }];
    const l = buildReviewDelayLedger({ submittals: [sub()], rounds, today: TODAY });
    expect(l.entries[0].unknown).toBe("no-sent-date");
    expect(l.entries[0].daysOver).toBeNull();
    expect(l.summary).toMatchObject({ measured: 0, unknown: 1, totalDaysOver: 0 });
    expect(l.reviewers).toHaveLength(0);
  });

  it("never invents a return date for a dispositioned round without one", () => {
    const rounds: LedgerRound[] = [{ submittal_id: "s1", round_number: 1, status: "Approved as Noted", submitted_date: "2026-06-01" }];
    const l = buildReviewDelayLedger({ submittals: [sub({ status: "Approved as Noted" })], rounds, today: TODAY });
    expect(l.entries[0].unknown).toBe("no-return-date");
    expect(l.entries[0].open).toBe(false);
    expect(l.summary.late).toBe(0);
  });

  it("does not keep an open round ticking once the submittal has closed", () => {
    // Round row still says Submitted but the submittal was released.
    const rounds: LedgerRound[] = [{ submittal_id: "s1", round_number: 1, status: "Submitted", submitted_date: "2026-06-01" }];
    const l = buildReviewDelayLedger({ submittals: [sub({ status: "Released for Fabrication" })], rounds, today: TODAY });
    expect(l.entries[0].open).toBe(false);
    expect(l.entries[0].unknown).toBe("no-return-date");
  });

  it("flags a return date earlier than the sent date", () => {
    const rounds: LedgerRound[] = [
      { submittal_id: "s1", round_number: 1, status: "Approved", submitted_date: "2026-07-10", returned_date: "2026-07-01" },
    ];
    const l = buildReviewDelayLedger({ submittals: [sub({ status: "Approved" })], rounds, today: TODAY });
    expect(l.entries[0].unknown).toBe("return-before-sent");
  });
});

describe("buildReviewDelayLedger — scope rules", () => {
  it("skips Void and deleted submittals and deleted rounds", () => {
    const rounds: LedgerRound[] = [
      { submittal_id: "s1", round_number: 1, status: "Under Review", submitted_date: "2026-06-01" },
      { submittal_id: "s2", round_number: 1, status: "Under Review", submitted_date: "2026-06-01" },
      { submittal_id: "s3", round_number: 1, status: "Under Review", submitted_date: "2026-06-01", is_deleted: true },
    ];
    const l = buildReviewDelayLedger({
      submittals: [sub({ status: "Void" }), sub({ id: "s2", is_deleted: true }), sub({ id: "s3" })],
      rounds,
      today: TODAY,
    });
    // s3's only round is deleted, so it falls back to its own (empty) dates:
    // listed as unknown, never measured from the deleted round.
    expect(l.entries).toHaveLength(1);
    expect(l.entries[0]).toMatchObject({ submittalId: "s3", source: "submittal", unknown: "no-sent-date" });
  });

  it("uses submittal-level dates only when there is no round log, and skips drafts", () => {
    const l = buildReviewDelayLedger({
      submittals: [
        sub({ id: "legacy", status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-24" }),
        sub({ id: "draft", status: "Draft" }),
        sub({ id: "withRounds", status: "Approved", submitted_date: "2026-01-01", returned_date: "2026-03-01" }),
      ],
      rounds: [{ submittal_id: "withRounds", round_number: 1, status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-15" }],
      today: TODAY,
    });
    expect(l.entries.map((e) => [e.submittalId, e.source])).toEqual(
      expect.arrayContaining([
        ["legacy", "submittal"],
        ["withRounds", "round"],
      ]),
    );
    expect(l.entries).toHaveLength(2);
    expect(l.entries.find((e) => e.submittalId === "withRounds")?.daysOver).toBe(0);
  });

  it("keeps every round of a resubmitted submittal", () => {
    const rounds: LedgerRound[] = [
      { submittal_id: "s1", round_number: 1, status: "Revise and Resubmit", submitted_date: "2026-06-01", returned_date: "2026-06-26", reviewer: "EOR" },
      { submittal_id: "s1", round_number: 2, status: "Under Review", submitted_date: "2026-07-06", reviewer: "EOR" },
    ];
    const l = buildReviewDelayLedger({ submittals: [sub()], rounds, today: TODAY });
    expect(l.entries.map((e) => e.roundNumber).sort()).toEqual([1, 2]);
  });
});

describe("reviewer roll-up", () => {
  it("totals days over, open-late rounds and closed-round averages per reviewer", () => {
    const rounds: LedgerRound[] = [
      { submittal_id: "a", round_number: 1, status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-24", reviewer: "EOR" }, // 4 over, held 14
      { submittal_id: "b", round_number: 1, status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-17", reviewer: "EOR" }, // 0 over, held 9
      { submittal_id: "c", round_number: 1, status: "Under Review", submitted_date: "2026-06-15", reviewer: "EOR" }, // open, 25 over
      { submittal_id: "d", round_number: 1, status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-10", reviewer: "Architect" },
    ];
    const subs = ["a", "b", "c", "d"].map((id) => sub({ id, submittal_number: id.toUpperCase(), status: id === "c" ? "Under Review" : "Approved" }));
    const l = buildReviewDelayLedger({ submittals: subs, rounds, today: TODAY });
    const eor = l.reviewers.find((r) => r.reviewer === "EOR")!;
    expect(eor).toMatchObject({ rounds: 3, closed: 2, open: 1, onTime: 1, late: 2, openLate: 1, totalDaysOver: 29, worstDaysOver: 25 });
    expect(eor.avgDaysHeldClosed).toBe(11.5);
    expect(l.reviewers[0].reviewer).toBe("EOR");
    expect(l.reviewers.find((r) => r.reviewer === "Architect")?.late).toBe(0);
  });

  it("falls back to the submittal reviewer, then Unassigned", () => {
    const l = buildReviewDelayLedger({
      submittals: [sub({ id: "x", reviewer: "GC" }), sub({ id: "y", reviewer: null, ball_in_court: null })],
      rounds: [
        { submittal_id: "x", round_number: 1, status: "Under Review", submitted_date: "2026-07-27" },
        { submittal_id: "y", round_number: 1, status: "Under Review", submitted_date: "2026-07-27" },
      ],
      today: TODAY,
    });
    expect(l.entries.map((e) => e.reviewer).sort()).toEqual(["GC", "Unassigned"]);
  });
});

describe("buildDelayLedgerCsv", () => {
  it("writes one row per round with the unit in the headers and neutralises formulas", () => {
    const rounds: LedgerRound[] = [
      { submittal_id: "s1", round_number: 1, status: "Under Review", submitted_date: "2026-06-15", reviewer: "=HYPERLINK(1)" },
      { submittal_id: "s1", round_number: 2, status: "Under Review" },
    ];
    const csv = buildDelayLedgerCsv(buildReviewDelayLedger({ submittals: [sub()], rounds, today: TODAY }), "Job 26314");
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"Days over (working days)"');
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect(csv).toContain("No sent date recorded; excluded from totals");
    expect(lines[1]).toContain('"Job 26314"');
  });
});
