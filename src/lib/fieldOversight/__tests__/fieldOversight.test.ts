import { describe, expect, it } from "vitest";
import { makeCalendar } from "@/lib/schedule/workingCalendar";
import {
  READINESS_CATEGORY, READINESS_ITEMS, buildReadinessRequest, cycleReadinessMark, deriveReadiness,
  readinessCreateInput, readinessTone, readinessUpdatePatch, workingDaysToStart,
} from "../readiness";
import {
  DELAY_CR_REASON, buildDelayNotice, delayCost, delayCreateFields, delayUpdateFields, deriveDelays,
  emptyDelayDraft, needsNotice, noticeSentPatch, noticeState, validateDelayDraft,
} from "../delays";
import { formatDailyReport, missingDailyReports } from "../dailyReports";
import { buildFieldBrief, deriveFieldSignals, deriveScheduleCore } from "../fieldGate";
import { withMetadataSection } from "../types";
import type { ActionItemLike, ChangeRequestLike, ScheduleTaskLike } from "../types";
import type { Json } from "@/types/supabase";
import type { ReadinessMark } from "../readiness";
import type { DelayInputs } from "../delays";

// 2026-10-21 is a Wednesday; 10-23 Friday; 10-26 Monday.
const WED = "2026-10-21";
const FRI = "2026-10-23";
const MON = "2026-10-26";

function readinessRow(over: Partial<ActionItemLike> = {}): ActionItemLike {
  return {
    id: "r1", category: READINESS_CATEGORY, title: "Site readiness — Seq 2", status: "Open",
    due_date: MON, metadata: { site_readiness: { version: 1, sequence: "Seq 2", marks: {} } }, ...over,
  };
}

describe("metadata merge", () => {
  it("keeps sibling metadata keys when writing a section", () => {
    const merged = withMetadataSection({ other: { keep: true }, site_readiness: { old: 1 } }, "site_readiness", { fresh: 2 });
    expect(merged).toEqual({ other: { keep: true }, site_readiness: { fresh: 2 } });
  });
});

describe("site readiness", () => {
  it("reads only SITE_READINESS action items and ignores deleted rows", () => {
    const rows = [readinessRow(), readinessRow({ id: "c", category: "CONSTRAINT" }), readinessRow({ id: "d", is_deleted: true })];
    expect(deriveReadiness(rows, []).map((r) => r.id)).toEqual(["r1"]);
  });

  it("prefers the linked schedule task's start over the due date", () => {
    const task: ScheduleTaskLike = { id: "t1", start_date: FRI, phase: "Installation" };
    const [r] = deriveReadiness([readinessRow({ source_entity_type: "schedule_task", source_entity_id: "t1" })], [task]);
    expect(r.start).toBe(FRI);
    expect(r.startSource).toBe("task");
  });

  it("falls back to the due date, and to null when neither is recorded", () => {
    expect(deriveReadiness([readinessRow()], [])[0].startSource).toBe("due_date");
    expect(deriveReadiness([readinessRow({ due_date: null })], [])[0].start).toBeNull();
  });

  it("cycles open → done → N/A → open and stamps who marked it", () => {
    let marks = cycleReadinessMark({}, "anchors", "Nick", "2026-10-21T15:00:00Z");
    expect(marks.anchors).toEqual({ state: "done", by: "Nick", at: "2026-10-21T15:00:00Z" });
    marks = cycleReadinessMark(marks, "anchors", "Nick", "t2");
    expect(marks.anchors.state).toBe("na");
    marks = cycleReadinessMark(marks, "anchors", "Nick", "t3");
    expect(marks.anchors).toBeUndefined();
    expect(cycleReadinessMark(marks, "not-a-key", "x", "t")).toBe(marks);
  });

  it("keeps a Cancelled or Closed sequence closed until its checklist completes", () => {
    expect(readinessUpdatePatch(readinessRow({ status: "Cancelled" }), "Seq 2", {}).status).toBe("Cancelled");
    expect(readinessUpdatePatch(readinessRow({ status: "Complete" }), "Seq 2", {}).status).toBe("Open");
  });

  it("snaps a weekend start to the next working day", () => {
    // Saturday 10-24 on Mon–Fri mobilizes Monday: one working day out from Friday, not "today".
    expect(workingDaysToStart({ start: "2026-10-24" }, FRI)).toBe(1);
  });

  it("is Complete only when every item is done or N/A", () => {
    const done: ReadinessMark = { state: "done", by: null, at: null };
    const all: Record<string, ReadinessMark> = Object.fromEntries(READINESS_ITEMS.map((i) => [i.key, done]));
    expect(readinessUpdatePatch(readinessRow(), "Seq 2", all).status).toBe("Complete");
    const { anchors: _omit, ...rest } = all;
    expect(readinessUpdatePatch(readinessRow(), "Seq 2", rest).status).toBe("Open");
  });

  it("creates rows the action_items constraints accept", () => {
    const input = readinessCreateInput({ sequence: " Seq 3 ", scheduleTaskId: "t9", mobilizationDate: MON, owner: null, notes: null });
    expect(input).toMatchObject({ category: READINESS_CATEGORY, status: "Open", priority: "High", source_entity_type: "schedule_task", source_entity_id: "t9", title: "Site readiness — Seq 3" });
    const unlinked = readinessCreateInput({ sequence: "Seq 4", scheduleTaskId: null, mobilizationDate: null, owner: null, notes: null });
    expect(unlinked.source_entity_type).toBeNull();
  });

  it("counts working days across a weekend", () => {
    expect(workingDaysToStart({ start: MON }, FRI)).toBe(1);
    expect(workingDaysToStart({ start: MON }, WED)).toBe(3);
    expect(workingDaysToStart({ start: WED }, WED)).toBe(0);
    expect(workingDaysToStart({ start: WED }, FRI)).toBeLessThan(0);
    expect(workingDaysToStart({ start: null }, WED)).toBeNull();
  });

  it("honours a Mon–Sat project calendar", () => {
    const sixDay = makeCalendar({ work_days: [1, 2, 3, 4, 5, 6] });
    expect(workingDaysToStart({ start: MON }, FRI, sixDay)).toBe(2);
  });

  it("tones a sequence by time to mobilization", () => {
    const [r] = deriveReadiness([readinessRow()], []);
    expect(readinessTone(r, FRI)).toBe("critical");
    expect(readinessTone(r, "2026-10-19")).toBe("warning");
    expect(readinessTone(r, "2026-10-12")).toBe("open");
    expect(readinessTone(r, "2026-10-28")).toBe("started");
  });

  it("writes the request from the signed-in org and lists only other parties' items", () => {
    const [r] = deriveReadiness([readinessRow()], []);
    const text = buildReadinessRequest({ record: r, project: { name: "Madison", general_contractor: "Acme Builders" }, senderName: "Pat PM", orgName: "Example Erectors" });
    expect(text).toContain("Example Erectors is scheduled");
    expect(text).toContain("Acme Builders team,");
    expect(text).toContain("1926.752(a)");
    expect(text).not.toContain("Lift plan");
    const anon = buildReadinessRequest({ record: r, project: null, senderName: null, orgName: null });
    expect(anon).toContain("We are scheduled");
  });
});

function delayRow(meta: { [key: string]: Json }, over: Partial<ChangeRequestLike> = {}): ChangeRequestLike {
  return { id: "d1", cr_number: "CR-004", reason: DELAY_CR_REASON, status: "Submitted", request_date: WED, metadata: { delay_log: meta }, ...over };
}

describe("delay log", () => {
  it("keeps cost unknown when nothing is recorded", () => {
    const c = delayCost({ ...readNothing() });
    expect(c.total).toBeNull();
    expect(c.manHours).toBeNull();
  });

  it("totals only the parts that are recorded", () => {
    const c = delayCost({ ...readNothing(), crew: 6, hoursEach: 4, laborRate: 95, craneHours: 4 });
    expect(c.manHours).toBe(24);
    expect(c.labor).toBe(2280);
    expect(c.crane).toBeNull();
    expect(c.total).toBe(2280);
  });

  it("only reads delay change requests", () => {
    const rows = [delayRow({ cause: "steel" }), { id: "x", reason: "Owner change", status: "Submitted" }];
    expect(deriveDelays(rows).map((d) => d.id)).toEqual(["d1"]);
  });

  it("measures the notice window in working days, skipping the weekend", () => {
    expect(noticeState({ impactDate: FRI, noticeSentOn: null }, FRI)).toEqual({ kind: "due", workingDaysLeft: 2 });
    expect(noticeState({ impactDate: FRI, noticeSentOn: null }, MON)).toEqual({ kind: "due", workingDaysLeft: 1 });
    expect(noticeState({ impactDate: FRI, noticeSentOn: null }, "2026-10-27")).toEqual({ kind: "due", workingDaysLeft: 0 });
    expect(noticeState({ impactDate: FRI, noticeSentOn: null }, "2026-10-28")).toEqual({ kind: "overdue", workingDaysLate: 1 });
    expect(noticeState({ impactDate: FRI, noticeSentOn: MON }, "2026-11-30")).toEqual({ kind: "sent", on: MON });
    expect(noticeState({ impactDate: null, noticeSentOn: null }, WED)).toEqual({ kind: "unknown" });
  });

  it("creates CR fields without a number, a requester or an invented $0", () => {
    const fields = delayCreateFields({ ...emptyDelayDraft(WED), cause: "steel" });
    expect(fields).not.toHaveProperty("cr_number");
    expect(fields).not.toHaveProperty("requested_by");
    expect(fields.estimated_cost_impact).toBeNull();
    expect(fields.reason).toBe(DELAY_CR_REASON);
    expect(fields.metadata).toMatchObject({ delay_log: { cause: "steel", impact_date: WED } });
  });

  it("updates without wiping what a PM set in the Change Requests register", () => {
    const existing: ChangeRequestLike = { id: "d1", title: "Steel late — Bldg B", affected_areas: "Bldg B, Grid 1–6", requested_by: "pm@example.com", priority: "Critical", metadata: { keep: 1, delay_log: { cause: "steel" } } } as ChangeRequestLike;
    const patch = delayUpdateFields({ ...emptyDelayDraft(WED), cause: "steel", crew: "4", hoursEach: "8", laborRate: "90", responsibleParty: "Acme" }, existing);
    expect(patch).not.toHaveProperty("requested_by");
    expect(patch).not.toHaveProperty("priority");
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("affected_areas");
    expect(patch.estimated_cost_impact).toBe(2880);
    expect(patch.metadata).toMatchObject({ keep: 1, delay_log: { crew: 4, hours_each: 8 } });
    const generated = delayUpdateFields({ ...emptyDelayDraft(WED), cause: "site", responsibleParty: "Acme" }, { id: "d2", title: "Delay — Steel late or short-shipped — 2026-10-21", affected_areas: "Responsible: Old GC" });
    expect(generated.title).toBe("Delay — Site not ready — 2026-10-21");
    expect(generated.affected_areas).toBe("Responsible: Acme");
  });

  it("stops asking for notice once a delay is approved, rejected or converted", () => {
    const [open] = deriveDelays([delayRow({ cause: "site" })]);
    const [approved] = deriveDelays([delayRow({ cause: "site" }, { status: "Approved" })]);
    const [converted] = deriveDelays([delayRow({ cause: "site" }, { change_order_id: "co-1" })]);
    expect([needsNotice(open), needsNotice(approved), needsNotice(converted)]).toEqual([true, false, false]);
    const signals = deriveFieldSignals({ readiness: [], delays: [approved, converted], tasks: [], deliveries: [], logs: [], weather: [], today: "2026-11-30" });
    expect(signals).toEqual([]);
  });

  it("validates numbers and notice ordering", () => {
    const draft = { ...emptyDelayDraft(WED), crew: "six", noticeSentOn: "2026-10-20" };
    expect(validateDelayDraft(draft)).toEqual(["Crew must be a number of zero or more.", "Notice cannot be sent before the date of impact."]);
    expect(validateDelayDraft(emptyDelayDraft(WED))).toEqual([]);
  });

  it("records a notice without dropping the cost inputs", () => {
    const [d] = deriveDelays([delayRow({ cause: "site", crew: 4, hours_each: 8 })]);
    const patch = noticeSentPatch(d, FRI) as { metadata: { delay_log: Record<string, unknown> } };
    expect(patch.metadata.delay_log).toMatchObject({ crew: 4, hours_each: 8, notice_sent_on: FRI, cause: "site" });
  });

  it("writes the notice from the signed-in org, with the GC as addressee", () => {
    const [d] = deriveDelays([delayRow({ cause: "site", crew: 6, hours_each: 4, labor_rate: 95, responsible_party: "Acme Builders" })]);
    const text = buildDelayNotice({ record: d, project: { name: "CAMI", project_number: "1042", general_contractor: "Acme Builders" }, senderName: "Pat PM", orgName: "Example Erectors", today: FRI });
    expect(text).toContain("To: Acme Builders — 1042 CAMI");
    expect(text).toContain("NOTICE OF DELAY — CR-004 — Site not ready");
    expect(text).toContain("24 man-hours at $95/MH = $2,280");
    expect(text).toContain("Example Erectors's structural steel erection");
  });
});

function readNothing(): DelayInputs {
  return { impactDate: null, cause: null, responsibleParty: null, crew: null, hoursEach: null, laborRate: null, craneHours: null, craneRate: null, otherCost: null, scheduleTaskId: null, dailyLogId: null, noticeSentOn: null, whatHappened: null };
}

const erection: ScheduleTaskLike = { id: "e1", task_name: "Set Seq 1 columns", phase: "Installation", status: "In Progress", start_date: "2026-10-19", end_date: FRI };

describe("daily report coverage", () => {
  it("flags field days without a daily and skips today, weekends and covered days", () => {
    const missing = missingDailyReports({ tasks: [erection], deliveries: [], logs: [{ id: "l", date: "2026-10-19" }], today: MON });
    expect(missing.map((m) => m.date)).toEqual(["2026-10-20", WED, "2026-10-22", FRI]);
    expect(missing[0].reasons[0]).toContain("Set Seq 1 columns");
  });

  it("does not call a day missing when nothing was scheduled", () => {
    expect(missingDailyReports({ tasks: [], deliveries: [], logs: [], today: MON })).toEqual([]);
  });

  it("counts deliveries and ignores cancelled ones", () => {
    const missing = missingDailyReports({
      tasks: [], logs: [], today: MON,
      deliveries: [{ id: "a", delivery_number: "DEL-7", scheduled_date: FRI, status: "Scheduled" }, { id: "b", scheduled_date: WED, status: "Cancelled" }],
    });
    expect(missing).toEqual([{ date: FRI, reasons: ["Delivery DEL-7"] }]);
  });

  it("formats a daily without inventing zeros", () => {
    const text = formatDailyReport({ id: "l", date: FRI, headcount: 6, activities: "Set 14 columns" }, { name: "Madison" }, "Example Erectors");
    expect(text).toContain("Manpower: 6\n");
    expect(text).not.toContain("man-hours");
    expect(text).not.toContain("Delay hours");
    expect(text).toContain("Work performed:\nSet 14 columns");
  });
});

describe("field gate", () => {
  const readiness = deriveReadiness([readinessRow()], []);
  const delays = deriveDelays([delayRow({ cause: "steel" }, { request_date: WED })]);

  it("raises readiness, notice and daily findings, critical first then by date", () => {
    const signals = deriveFieldSignals({ readiness, delays, tasks: [erection], deliveries: [], logs: [], weather: [], today: FRI });
    // Both criticals: the Wednesday delay sorts ahead of Monday's mobilization.
    expect(signals.map((s) => s.code)).toEqual(["DN", "RD", "DR", "DR", "DR", "DR"]);
    expect(signals[0].severity).toBe("critical");
    expect(signals[1].severity).toBe("critical");
  });

  it("keeps raising open items after the sequence has started", () => {
    const signals = deriveFieldSignals({ readiness, delays: [], tasks: [], deliveries: [], logs: [], weather: [], today: "2026-10-28" });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ code: "RD", severity: "critical" });
    expect(signals[0].title).toContain("started Mon, Oct 26");
  });

  it("only raises weather against scheduled field work", () => {
    const weather = [{ date: FRI, severity: 3, summary: "High gusts" }, { date: MON, severity: 3, summary: "Rain" }];
    const signals = deriveFieldSignals({ readiness: [], delays: [], tasks: [erection], deliveries: [], logs: [{ id: "x", date: "2026-10-22" }], weather, today: FRI });
    const wx = signals.filter((s) => s.code === "WX");
    expect(wx).toHaveLength(1);
    expect(wx[0].title).toContain("High gusts");
  });

  it("builds ten working days with the gate on the first two", () => {
    const core = deriveScheduleCore({ readiness, tasks: [erection], deliveries: [], weather: null, today: FRI });
    expect(core).toHaveLength(10);
    expect(core[0]).toMatchObject({ date: FRI, inGate: true, tone: "clear" });
    expect(core[1]).toMatchObject({ date: MON, inGate: true, tone: "critical", readinessOpen: READINESS_ITEMS.length });
    expect(core[2].inGate).toBe(false);
    expect(core.every((d) => d.weatherSeverity === null)).toBe(true);
  });

  it("says when the forecast is unknown instead of implying clear weather", () => {
    const text = buildFieldBrief({ project: { name: "Madison" }, signals: [], core: [], today: FRI, weatherKnown: false });
    expect(text).toContain("forecast not available");
  });
});
