import { describe, expect, it } from "vitest";
import {
  ACK_OVERDUE_HOURS,
  CONTRACT_RETURN_DAYS,
  DAYS_OUT_SCALE,
  ackColor,
  ackState,
  alertBox,
  impactPill,
  addDays,
  badgeLabel,
  badgeStyle,
  bicSlices,
  daysBetween,
  heldSheetsForRfi,
  type SheetLinkage,
  daysOutBar,
  dueDateColor,
  formatDay,
  formatShortDay,
  humanizeWait,
  isPastContractReturn,
  isPastDue,
  parseCalendarDay,
  releasedPct,
  routingSteps,
  rowChrome,
  submittalAlertTone,
  todayCalendarDay,
  type CalendarDay,
} from "../boardReportDerive";
import { registerStatus, rfiImpact, submittalStatus, countLabel } from "../useBoardReportData";

const day = (year: number, month: number, d: number): CalendarDay => ({ year, month, day: d });

describe("calendar days", () => {
  /**
   * The suite runs with TZ=UTC, which is exactly the condition that hides this
   * bug, so the zone is forced here rather than inherited. `new Date(iso)`
   * reads a bare date as midnight UTC; in Phoenix that is the PREVIOUS day, so
   * a package sent on the 6th would read as sent on the 5th and its days-out
   * count — and therefore whether it is past the contract return — would be
   * off by one for every user west of Greenwich.
   */
  it("reads a bare ISO date as that calendar day, not as midnight UTC", () => {
    expect(parseCalendarDay("2026-10-06")).toEqual(day(2026, 10, 6));
    expect(parseCalendarDay("2026-01-01T23:30:00Z")).toEqual(day(2026, 1, 1));
  });

  it("treats a missing or unparseable date as unknown rather than as today", () => {
    expect(parseCalendarDay(null)).toBeNull();
    expect(parseCalendarDay("")).toBeNull();
    expect(parseCalendarDay("not a date")).toBeNull();
    expect(parseCalendarDay("2026-13-01")).toBeNull();
  });

  it("reads today from the viewer's own clock, not UTC", () => {
    // A local clock at 7pm on the 20th is the 20th, even though it is already
    // the 21st in UTC.
    const localEvening = new Date(2026, 9, 20, 19, 0, 0);
    expect(todayCalendarDay(localEvening)).toEqual(day(2026, 10, 20));
  });

  it("counts elapsed calendar days across a month boundary", () => {
    expect(daysBetween(day(2026, 10, 6), day(2026, 10, 18))).toBe(12);
    expect(daysBetween(day(2026, 9, 28), day(2026, 10, 2))).toBe(4);
    expect(daysBetween(day(2026, 10, 18), day(2026, 10, 18))).toBe(0);
  });

  it("adds days across a month boundary", () => {
    expect(addDays(day(2026, 10, 25), CONTRACT_RETURN_DAYS)).toEqual(day(2026, 11, 8));
  });

  it("prints an unknown date as an em dash rather than as a guess", () => {
    expect(formatDay(null)).toBe("—");
    expect(formatShortDay(null)).toBe("—");
    expect(formatDay(day(2026, 10, 6))).toBe("Oct 6");
    expect(formatShortDay(day(2026, 10, 6))).toBe("10/06");
  });
});

describe("submittal days-out bar", () => {
  it("puts the contract return at the track's midpoint", () => {
    // The tick is drawn at 50%; that is only the contract return if the track
    // is scaled to exactly twice it.
    expect(DAYS_OUT_SCALE).toBe(CONTRACT_RETURN_DAYS * 2);
    expect(daysOutBar(CONTRACT_RETURN_DAYS, "REV").width).toBe("50.0%");
  });

  it("caps the fill so an ancient package cannot overflow the track", () => {
    expect(daysOutBar(400, "LATE").width).toBe("100.0%");
  });

  it("never renders a negative width from a future send date", () => {
    expect(daysOutBar(-5, "REV").width).toBe("0.0%");
  });

  it("colors the count red only once past the contract return", () => {
    expect(daysOutBar(13, "REV").countColor).not.toBe(daysOutBar(20, "LATE").countColor);
  });

  it("is late strictly past the window, not on the last day of it", () => {
    expect(isPastContractReturn(CONTRACT_RETURN_DAYS)).toBe(false);
    expect(isPastContractReturn(CONTRACT_RETURN_DAYS + 1)).toBe(true);
  });
});

describe("submittal routing", () => {
  const base = {
    sentOn: day(2026, 10, 6),
    status: "REV" as const,
    detailer: "Steelcad Detailing",
    gc: "Okland",
    holder: "Desert Ridge Structural",
    returnTo: "Acme Steel",
  };

  it("skips the forward step when the GC still holds it", () => {
    const steps = routingSteps({ ...base, ballInCourt: "GC" });
    expect(steps.map((s) => s.title)).toEqual([
      "Submitted by detailer",
      "Received by GC",
      "Contract return date",
      "Return to Acme Steel",
    ]);
  });

  it("inserts the forward step when someone past the GC holds it", () => {
    const steps = routingSteps({ ...base, ballInCourt: "EOR" });
    expect(steps.map((s) => s.title)).toContain("Forwarded to EOR");
  });

  it("dates the contract return at sent plus the contract window", () => {
    const steps = routingSteps({ ...base, ballInCourt: "GC" });
    const contract = steps.find((s) => s.title === "Contract return date");
    expect(contract?.date).toBe("Oct 20");
  });

  /**
   * The design comps label this step with a hardcoded fabricator name.
   * CLAUDE.md records the owner's decision that no part of this product may
   * name that company; the step takes the signed-in organization instead.
   */
  it("names the receiving organization rather than a hardcoded company", () => {
    const steps = routingSteps({ ...base, ballInCourt: "GC", returnTo: "Harbor Fabrication" });
    expect(steps.at(-1)?.title).toBe("Return to Harbor Fabrication");
    expect(JSON.stringify(steps)).not.toMatch(/S&H/i);
  });

  it("marks the contract return late only when the package is late", () => {
    expect(routingSteps({ ...base, ballInCourt: "GC" }).find((s) => s.title === "Contract return date")?.state).toBe("todo");
    expect(
      routingSteps({ ...base, ballInCourt: "GC", status: "LATE" }).find((s) => s.title === "Contract return date")?.state,
    ).toBe("late");
  });

  it("runs the resubmit path, not the review path, for a returned package", () => {
    const steps = routingSteps({ ...base, ballInCourt: "Detailer", status: "R&R" });
    expect(steps.map((s) => s.title)).toEqual([
      "Submitted by detailer",
      "Returned revise & resubmit",
      "Resubmit due",
    ]);
  });

  it("leaves every date an em dash when the send date is unknown", () => {
    const steps = routingSteps({ ...base, sentOn: null, ballInCourt: "GC" });
    expect(steps.every((s) => s.date === "—")).toBe(true);
  });
});

describe("alerts", () => {
  it("ranks late above due-soon above quiet", () => {
    expect(submittalAlertTone(20, "LATE")).toBe("late");
    expect(submittalAlertTone(4, "R&R")).toBe("warn");
    expect(submittalAlertTone(12, "REV")).toBe("warn");
    expect(submittalAlertTone(3, "REV")).toBeNull();
  });
});

describe("transmittal acknowledgement", () => {
  it("chases only once past the threshold", () => {
    expect(ackState(false, ACK_OVERDUE_HOURS - 1)).toBe("waiting");
    expect(ackState(false, ACK_OVERDUE_HOURS)).toBe("overdue");
  });

  it("reads acknowledged regardless of how long it took", () => {
    expect(ackState(true, null)).toBe("acknowledged");
    expect(ackState(true, 500)).toBe("acknowledged");
  });

  it("gives overdue and waiting different colors", () => {
    expect(ackColor(ackState(false, 100))).not.toBe(ackColor(ackState(false, 1)));
  });

  it("humanizes the wait without claiming precision it does not have", () => {
    expect(humanizeWait(20)).toBe("20 hours");
    expect(humanizeWait(96)).toBe("4 days");
  });
});

describe("RFI impact", () => {
  it("ranks a fab hold above cost above schedule", () => {
    expect(rfiImpact({ metadata: { fab_hold: true }, cost_impact: true })).toBe("Fab hold");
    expect(rfiImpact({ metadata: { fab_impact: true } })).toBe("Fab hold");
    expect(rfiImpact({ cost_impact: true, schedule_impact: true })).toBe("Cost");
    expect(rfiImpact({ schedule_impact: true })).toBe("Schedule");
  });

  /**
   * The live signal is the operator's tick in metadata. `holds_released_count`
   * counts holds RELEASED when an RFI was answered, so reading it got the
   * question backwards both ways: an active blocker read Info and vanished
   * from the hold KPI, while an answered RFI was paraded as a current one.
   */
  it("reads the live fab-hold tick, not released-hold history", () => {
    expect(rfiImpact({ metadata: { fab_hold: true } })).toBe("Fab hold");
    expect(rfiImpact({ metadata: {}, holds_released_count: 94 } as Parameters<typeof rfiImpact>[0])).toBe("Info");
  });

  it("falls back to Info rather than inventing an impact", () => {
    expect(rfiImpact({})).toBe("Info");
    expect(rfiImpact({ cost_impact: null, schedule_impact: "" })).toBe("Info");
    expect(rfiImpact({ cost_impact: "none" })).toBe("Info");
    expect(rfiImpact({ metadata: { fab_hold: false } })).toBe("Info");
  });

  it("reds a due date only once it is actually past", () => {
    const today = day(2026, 10, 18);
    expect(dueDateColor(day(2026, 10, 18), today)).toBe(dueDateColor(day(2026, 10, 25), today));
    expect(dueDateColor(day(2026, 10, 17), today)).not.toBe(dueDateColor(day(2026, 10, 25), today));
  });

  it("agrees with the past-due predicate the filter uses", () => {
    const today = day(2026, 10, 18);
    expect(isPastDue(day(2026, 10, 17), today)).toBe(true);
    expect(isPastDue(day(2026, 10, 18), today)).toBe(false);
    expect(isPastDue(null, today)).toBe(false);
  });

  it("does not color an unknown due date as late", () => {
    const today = day(2026, 10, 18);
    expect(dueDateColor(null, today)).toBe(dueDateColor(day(2026, 10, 25), today));
  });
});

describe("register status", () => {
  /**
   * A sheet can be released AND held. The hold is the thing that stops work,
   * so it has to win — reading this one the other way would show a green
   * Released badge on steel nobody may cut.
   */
  it("lets a hold outrank the workflow stage", () => {
    expect(registerStatus({ stage: "Released", current_status: null, active_hold_id: "h1" })).toBe("HOLD");
  });

  it("maps the terminal stages to released and the in-flight ones to review", () => {
    expect(registerStatus({ stage: "Released", current_status: null, active_hold_id: null })).toBe("REL");
    expect(registerStatus({ stage: "IFC", current_status: null, active_hold_id: null })).toBe("REL");
    expect(registerStatus({ stage: "IFA", current_status: null, active_hold_id: null })).toBe("REV");
    expect(registerStatus({ stage: "BFA", current_status: null, active_hold_id: null })).toBe("REV");
  });

  it("reads a revise-and-resubmit return off the status, not the stage", () => {
    expect(registerStatus({ stage: "IFA", current_status: "Revise & Resubmit", active_hold_id: null })).toBe("R&R");
  });

  it("reports a stageless sheet as not started rather than as detailing", () => {
    expect(registerStatus({ stage: null, current_status: null, active_hold_id: null })).toBe("NONE");
    expect(badgeLabel("NONE")).toBe("—");
  });
});

describe("submittal status", () => {
  /**
   * Lifecycle before age. A Draft was never sent so it cannot be late, a Void
   * one is dead, and a Rejected one is a resubmit. Ageing them first put all
   * three into the default "Out for review" list and the headline counts.
   */
  it("decides lifecycle before applying the age rule", () => {
    expect(submittalStatus("Draft", 400, null)).toBe("DET");
    expect(submittalStatus(null, 400, null)).toBe("DET");
    expect(submittalStatus("Void", 400, null)).toBe("NONE");
    expect(submittalStatus("Rejected", 400, null)).toBe("R&R");
    expect(submittalStatus("Approved", 400, null)).toBe("REL");
    expect(submittalStatus("Approved as Noted", 400, null)).toBe("REL");
  });

  it("is late only when it is both unreturned and past the window", () => {
    expect(submittalStatus("Under Review", 20, null)).toBe("LATE");
    // Returned on time-out day: it came back, so it is not late.
    expect(submittalStatus("Under Review", 20, "2026-10-14")).toBe("REV");
    expect(submittalStatus("Under Review", 10, null)).toBe("REV");
  });

  it("puts a returned-for-revision package ahead of the lateness test", () => {
    expect(submittalStatus("Revise and Resubmit", 40, null)).toBe("R&R");
  });
});

describe("chrome", () => {
  it("marks the selected row with the accent rail and nothing else", () => {
    expect(rowChrome(true).boxShadow).toContain("inset 3px 0 0");
    expect(rowChrome(false).boxShadow).toBe("none");
    expect(rowChrome(false).background).toBe("transparent");
  });

  it("gives light and dark their own badge treatments", () => {
    expect(badgeStyle("REL", false)).not.toEqual(badgeStyle("REL", true));
  });

  /**
   * AGENTS.md: the app is dual-theme and a page may not force itself light.
   * Every colour helper has to actually answer differently in dark.
   */
  it("answers differently in dark for every colour helper that takes a skin", () => {
    expect(daysOutBar(5, "REV", false).countColor).not.toBe(daysOutBar(5, "REV", true).countColor);
    expect(alertBox("ok", false).background).not.toBe(alertBox("ok", true).background);
    expect(impactPill("Info", false).background).not.toBe(impactPill("Info", true).background);
    expect(rowChrome(true, false).background).not.toBe(rowChrome(true, true).background);
  });
});

describe("counts", () => {
  it("never divides by zero on an empty register", () => {
    expect(releasedPct(0, 0)).toBe("0%");
    expect(releasedPct(196, 394)).toBe("50%");
  });

  /**
   * A capped read's length is a floor, not a total. Printing it as a total is
   * the quiet kind of wrong a dashboard is worst at — it looks authoritative.
   */
  it("marks a truncated count as a floor rather than stating a total", () => {
    expect(countLabel(394, false)).toBe("394");
    expect(countLabel(1000, true)).toBe("at least 1,000");
  });

  it("shares out the ball-in-court bar and survives an empty board", () => {
    const slices = bicSlices([
      { party: "GC", count: 9 },
      { party: "EOR", count: 3 },
    ]);
    expect(slices.map((s) => s.share)).toEqual(["75.00%", "25.00%"]);
    expect(bicSlices([])).toEqual([]);
  });

  it("takes its parties from the caller and invents none", () => {
    const slices = bicSlices([{ party: "Detailer", count: 1 }]);
    expect(slices.map((s) => s.party)).toEqual(["Detailer"]);
  });
});

/**
 * The sheets an RFI is holding. The third case is the point: an unread column
 * and a genuinely empty list look identical on screen and mean opposite things
 * to a PM deciding whether steel can run.
 */
describe("held sheets", () => {
  const rows = [
    { sheet: "E-203", rfiNumbers: ["RFI #001", "RFI #002"] },
    { sheet: "4001", rfiNumbers: ["RFI #002"] },
    { sheet: "S-201", rfiNumbers: [] },
  ];

  it("matches through the canonical normaliser, not a string compare", () => {
    // The CSV holds what a detailer typed; the RFI record has its own format.
    for (const typed of ["RFI #001", "RFI 001", "rfi-001", "  rfi#001 "]) {
      expect(heldSheetsForRfi(typed, rows)).toEqual({ known: true, sheets: ["E-203"] });
    }
  });

  it("returns every sheet that names the RFI", () => {
    expect(heldSheetsForRfi("RFI #002", rows)).toEqual({ known: true, sheets: ["E-203", "4001"] });
  });

  it("reports a real empty when the column was read and nothing matched", () => {
    expect(heldSheetsForRfi("RFI #099", rows)).toEqual({ known: true, sheets: [] });
  });

  it("reports UNKNOWN, not empty, when no row carried the linkage column", () => {
    // The state before migration 20261022082000 is applied: the view returns no
    // `linked_rfi_ids` key at all, so every row maps to null.
    const unread: SheetLinkage[] = [
      { sheet: "E-203", rfiNumbers: null },
      { sheet: "4001", rfiNumbers: null },
    ];
    expect(heldSheetsForRfi("RFI #001", unread)).toEqual({ known: false });
  });

  it("treats a partially linked register as read, since the column is per-view", () => {
    const mixed: SheetLinkage[] = [
      { sheet: "E-203", rfiNumbers: ["RFI #001"] },
      { sheet: "4001", rfiNumbers: null },
    ];
    expect(heldSheetsForRfi("RFI #001", mixed)).toEqual({ known: true, sheets: ["E-203"] });
  });

  it("claims nothing for an RFI with no usable number", () => {
    expect(heldSheetsForRfi("", rows)).toEqual({ known: false });
    expect(heldSheetsForRfi("   ", rows)).toEqual({ known: false });
  });
});
