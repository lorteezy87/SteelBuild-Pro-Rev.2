import { describe, expect, it } from "vitest";
import {
  normalizeCsvDate,
  normalizePhase,
  normalizeScheduleStatus,
  parseDurationDays,
  parsePercentComplete,
  parsePredecessorCell,
  parsePredecessorToken,
  parseScheduleCsv,
  reconcileStatusAndPct,
  SCHEDULE_CSV_TEMPLATE,
} from "../importScheduleCsv";

describe("normalizeCsvDate", () => {
  it("accepts ISO, US slash, month-name, and datetime suffixes", () => {
    expect(normalizeCsvDate("2026-03-01")).toBe("2026-03-01");
    expect(normalizeCsvDate("3/1/2026")).toBe("2026-03-01");
    expect(normalizeCsvDate("03/01/26")).toBe("2026-03-01");
    expect(normalizeCsvDate("Mar 1, 2026")).toBe("2026-03-01");
    expect(normalizeCsvDate("1-Mar-26")).toBe("2026-03-01");
    expect(normalizeCsvDate("3/1/2026 8:00 AM")).toBe("2026-03-01");
    expect(normalizeCsvDate("2026-03-01 08:00")).toBe("2026-03-01");
  });

  it("converts Excel serial dates", () => {
    expect(normalizeCsvDate("46082")).toBe("2026-03-01");
  });

  it("returns null for blank or garbage", () => {
    expect(normalizeCsvDate("")).toBeNull();
    expect(normalizeCsvDate("soon")).toBeNull();
  });
});

describe("parseDurationDays", () => {
  it("reads days, weeks, hours, and MS Project PT hours", () => {
    expect(parseDurationDays("5")).toBe(5);
    expect(parseDurationDays("5 days")).toBe(5);
    expect(parseDurationDays("5 days?")).toBe(5);
    expect(parseDurationDays("1w")).toBe(5);
    expect(parseDurationDays("16h")).toBe(2);
    expect(parseDurationDays("PT40H0M0S")).toBe(5);
  });

  it("returns null for blank", () => {
    expect(parseDurationDays("")).toBeNull();
    expect(parseDurationDays(null)).toBeNull();
  });
});

describe("parsePercentComplete", () => {
  it("accepts percents, whole numbers, and Excel fractions", () => {
    expect(parsePercentComplete("50%")).toBe(50);
    expect(parsePercentComplete("50")).toBe(50);
    expect(parsePercentComplete("0.5")).toBe(50);
    expect(parsePercentComplete("1")).toBe(1);
    expect(parsePercentComplete("")).toBe(0);
  });
});

describe("status mapping stays inside the DB CHECK", () => {
  const legal = new Set(["Not Started", "In Progress", "Complete", "On Hold", "Delayed"]);

  it("maps common synonyms", () => {
    expect(normalizeScheduleStatus("ns")).toBe("Not Started");
    expect(normalizeScheduleStatus("wip")).toBe("In Progress");
    expect(normalizeScheduleStatus("done")).toBe("Complete");
    expect(normalizeScheduleStatus("paused")).toBe("On Hold");
    expect(normalizeScheduleStatus("late")).toBe("Delayed");
  });

  it("never emits a status the DB would reject", () => {
    for (const raw of ["open", "active", "closed", "hold", "¯\\_(ツ)_/¯", ""]) {
      const s = normalizeScheduleStatus(raw);
      if (s !== null) expect(legal.has(s)).toBe(true);
    }
  });

  it("reconciles percent with Complete / Not Started / In Progress", () => {
    expect(reconcileStatusAndPct("Complete", 40)).toEqual({ status: "Complete", pct: 100 });
    expect(reconcileStatusAndPct("Not Started", 40)).toEqual({ status: "In Progress", pct: 40 });
    expect(reconcileStatusAndPct("", 100)).toEqual({ status: "Complete", pct: 100 });
    expect(reconcileStatusAndPct("On Hold", 50)).toEqual({ status: "On Hold", pct: 50 });
    expect(legal.has(reconcileStatusAndPct("Closed", 0).status)).toBe(true);
  });
});

describe("normalizePhase", () => {
  it("maps aliases onto SteelBuild phases", () => {
    expect(normalizePhase("Fab")).toBe("Fabrication");
    expect(normalizePhase("Erection")).toBe("Erection");
    expect(normalizePhase("INSTALLATION/ERECTION")).toBe("Installation");
    expect(normalizePhase("Precon")).toBe("Pre-Construction");
  });
});

describe("parsePredecessorToken", () => {
  it("defaults to FS with zero lag", () => {
    expect(parsePredecessorToken("1")).toEqual({
      token: "1",
      linkType: "1",
      lagTenths: "0",
    });
  });

  it("reads type and lag in days or weeks", () => {
    expect(parsePredecessorToken("1FS+2d")).toMatchObject({
      token: "1",
      linkType: "1",
      lagTenths: "9600",
    });
    expect(parsePredecessorToken("1.2.3SS-1 day")).toMatchObject({
      token: "1.2.3",
      linkType: "3",
      lagTenths: "-4800",
    });
    expect(parsePredecessorToken("A1000FF+1w")).toMatchObject({
      token: "A1000",
      linkType: "0",
    });
  });

  it("splits comma-separated predecessor cells", () => {
    const toks = parsePredecessorCell("1FS+2d, 3SS");
    expect(toks.map((t) => t.token)).toEqual(["1", "3"]);
  });
});

describe("parseScheduleCsv", () => {
  it("parses the SteelBuild template", () => {
    const { tasks, warnings, skippedBlankRows } = parseScheduleCsv(SCHEDULE_CSV_TEMPLATE);
    expect(skippedBlankRows).toBe(0);
    expect(warnings.filter((w) => /couldn't confidently/i.test(w))).toHaveLength(0);
    expect(tasks).toHaveLength(3);
    expect(tasks[0].name).toBe("Fabrication");
    expect(tasks[0].isSummary).toBe(true);
    expect(tasks[1].name).toBe("Weld beams");
    expect(tasks[1].start).toBe("2026-03-01");
    expect(tasks[1].finish).toBe("2026-03-05");
    expect(tasks[1].durationDays).toBe(5);
    expect(tasks[1].resources).toEqual(["Shop crew"]);
    expect(tasks[1].phaseHint).toBe("Fabrication");
    expect(tasks[2].preds).toEqual([
      { predUid: "1.1", linkType: "1", lagDuration: "4800" },
    ]);
  });

  it("parses Microsoft Project CSV headers and predecessor UIDs", () => {
    const csv = [
      "ID,Name,Duration,Start,Finish,Predecessors,Resource Names,% Complete,Outline Level,Outline Number,Milestone,Notes,Summary",
      "1,Detailing,10 days,3/1/2026,3/14/2026,,,0,1,1,No,,Yes",
      "2,Issue IFC,2 days,3/15/2026,3/16/2026,1FS+1d,Detailer,0,2,1.1,No,,No",
    ].join("\n");
    const { tasks } = parseScheduleCsv(csv);
    expect(tasks.map((t) => t.uid)).toEqual(["1", "2"]);
    expect(tasks[0].isSummary).toBe(true);
    expect(tasks[1].preds[0]).toMatchObject({ predUid: "1", linkType: "1" });
    expect(tasks[1].outlineNumber).toBe("1.1");
    expect(tasks[1].outlineLevel).toBe(2);
  });

  it("parses Primavera P6 activity headers", () => {
    const csv = [
      "Activity ID,Activity Name,Start,Finish,Original Duration,Predecessors",
      "A1000,Fabricate beams,2026-04-01,2026-04-10,8,",
      "A1010,Ship beams,2026-04-11,2026-04-12,1,A1000FS",
    ].join("\n");
    const { tasks } = parseScheduleCsv(csv);
    expect(tasks[0].uid).toBe("A1000");
    expect(tasks[1].preds[0].predUid).toBe("A1000");
    expect(tasks[0].durationDays).toBe(8);
  });

  it("skips blank-name rows, reports missing name column, and warns on bad preds", () => {
    const csv = "WBS,Start\n1.1,2026-03-01\n";
    const { tasks, warnings, skippedBlankRows } = parseScheduleCsv(csv);
    expect(tasks).toHaveLength(0);
    expect(skippedBlankRows).toBeGreaterThan(0);
    expect(warnings.join(" ")).toMatch(/task-name/i);
  });

  it("warns when a predecessor cannot be resolved", () => {
    const csv = [
      "Task Name,Predecessors",
      "Weld,MISSINGFS",
    ].join("\n");
    const { tasks, warnings } = parseScheduleCsv(csv);
    expect(tasks[0].preds).toEqual([]);
    expect(warnings.join(" ")).toMatch(/MISSING/);
  });

  it("strips a UTF-8 BOM and accepts tab-delimited files", () => {
    const csv = "\uFEFFTask Name\tStart\nWeld\t2026-03-01\n";
    const { tasks } = parseScheduleCsv(csv);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe("Weld");
    expect(tasks[0].start).toBe("2026-03-01");
  });

  it("finds the header under a short preamble", () => {
    const csv = [
      "Acme Steel — Job 1044",
      "Exported 2026-03-01",
      "WBS,Task Name,Start,Finish",
      "1,Kickoff,2026-03-01,2026-03-02",
    ].join("\n");
    const { tasks } = parseScheduleCsv(csv);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].name).toBe("Kickoff");
  });

  it("returns an empty-file warning", () => {
    const { tasks, warnings } = parseScheduleCsv("");
    expect(tasks).toHaveLength(0);
    expect(warnings[0]).toMatch(/empty/i);
  });
});
