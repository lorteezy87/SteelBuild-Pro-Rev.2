// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { computePhaseWbs, generateWBS, sanitizeScheduleTaskUpdatePayload } from "../wbs";
import { normalizeSchedulePhase } from "../schedulePageHelpers";
import { derivePhaseFromHierarchy, deriveMppDependencies, inferTaskType, parseMsProjectXml } from "../mppImport";
import type { ParsedMppTask, ScheduleTask } from "../types";

describe("generateWBS", () => {
  it("starts a phase at <phaseNum>.1 when there are no existing tasks", () => {
    expect(generateWBS("Detailing", [])).toBe("2.1");
    expect(generateWBS("Fabrication", [])).toBe("4.1");
  });

  it("increments from the highest new-format index within the same phase", () => {
    const existing = [
      { phase: "Detailing", wbs_code: "2.1" },
      { phase: "Detailing", wbs_code: "2.3" },
      { phase: "Fabrication", wbs_code: "4.9" }, // other phase is ignored
    ];
    expect(generateWBS("Detailing", existing)).toBe("2.4");
  });

  it("reads the trailing number out of legacy ABC-NNN codes", () => {
    expect(generateWBS("Detailing", [{ phase: "Detailing", wbs_code: "DET-003" }])).toBe("2.4");
  });

  it("falls back to 0.<n> for an unknown phase", () => {
    expect(generateWBS("Nonexistent", [])).toBe("0.1");
  });
});

describe("normalizeSchedulePhase", () => {
  it("accepts canonical phases and falls back invalid URL values to all", () => {
    expect(normalizeSchedulePhase("Detailing")).toBe("Detailing");
    expect(normalizeSchedulePhase(null)).toBe("all");
    expect(normalizeSchedulePhase("not-a-phase")).toBe("all");
  });
});

describe("sanitizeScheduleTaskUpdatePayload", () => {
  it("drops id, timestamps and underscore-prefixed fields from the update body", () => {
    const { id, fields } = sanitizeScheduleTaskUpdatePayload({
      id: "task-1",
      task_name: "Weld",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
      _signals: { risk: "high" },
      duration: 5,
    } as any);
    expect(id).toBe("task-1");
    expect(fields).toEqual({ task_name: "Weld", duration: 5 });
  });

  it("restores stored values for summary rows so overlaid dates aren't persisted", () => {
    const { fields } = sanitizeScheduleTaskUpdatePayload({
      id: "summary-1",
      _hasChildren: true,
      start_date: "2026-09-09", // overlaid effective date — must be overwritten
      _stored_start_date: "2026-01-01",
      _stored_end_date: "2026-02-01",
      _stored_duration: 10,
    } as any);
    expect(fields.start_date).toBe("2026-01-01");
    expect(fields.end_date).toBe("2026-02-01");
    expect(fields.duration).toBe(10);
  });
});

describe("computePhaseWbs", () => {
  it("leaves coded tasks untouched and only backfills persisted rows missing a code", () => {
    const input: ScheduleTask[] = [
      { id: "a", phase: "Detailing", wbs_code: "2.3" },
      { id: "b", phase: "Detailing" }, // missing → 2.4
      { phase: "Detailing" },          // missing + no id → filled but NOT backfilled
    ];
    const { tasks, toBackfill } = computePhaseWbs(input);
    // First (coded) row is the same object reference, untouched.
    expect(tasks[0]).toBe(input[0]);
    expect(tasks[1].wbs_code).toBe("2.4"); // picks up from the 2.3 max
    expect(tasks[2].wbs_code).toBe("2.5");
    // Only the persisted (id-bearing) missing row is queued for backfill.
    expect(toBackfill).toEqual([{ id: "b", wbs: "2.4" }]);
  });

  it("counts legacy trailing-number codes toward the per-phase max", () => {
    const { tasks } = computePhaseWbs([
      { id: "a", phase: "Detailing", wbs_code: "DET-003" },
      { id: "b", phase: "Detailing" },
    ]);
    expect(tasks[1].wbs_code).toBe("2.4");
  });

  it("uses phase 0 for an unknown phase and 'Other' for a missing phase", () => {
    const { tasks } = computePhaseWbs([
      { id: "a", phase: "Nonexistent" },
      { id: "b" }, // no phase → "Other" bucket, phase number 0
    ]);
    expect(tasks[0].wbs_code).toBe("0.1");
    expect(tasks[1].wbs_code).toBe("0.1"); // different bucket, restarts at 1
  });
});

describe("deriveMppDependencies", () => {
  const base: Omit<ParsedMppTask, "uid" | "preds"> = {
    name: "", start: null, finish: null, pct: 0, isSummary: false,
    outlineLevel: 1, outlineNumber: "", milestone: false, durationDays: null,
    resources: [], notes: "",
  };

  it("maps MS link types and rounds a 4800-tenths (8h) lag to 1 day", () => {
    const parsed: ParsedMppTask[] = [
      { ...base, uid: "1", preds: [] },
      { ...base, uid: "2", preds: [{ predUid: "1", linkType: "1", lagDuration: "4800" }] },
    ];
    const out = deriveMppDependencies(parsed, { "1": "db-1", "2": "db-2" });
    expect(out).toEqual([
      { dbId: "db-2", predLinks: [{ id: "db-1", type: "FS", lag_days: 1 }] },
    ]);
  });

  it("rounds lag: 2000 tenths (<½ day) → 0, 7200 tenths (1.5 days) → 2 (Math.round, .5 up)", () => {
    const parsed: ParsedMppTask[] = [
      { ...base, uid: "2", preds: [{ predUid: "1", linkType: "0", lagDuration: "2000" }] },
      { ...base, uid: "3", preds: [{ predUid: "1", linkType: "3", lagDuration: "7200" }] },
    ];
    const out = deriveMppDependencies(parsed, { "1": "db-1", "2": "db-2", "3": "db-3" });
    expect(out).toEqual([
      { dbId: "db-2", predLinks: [{ id: "db-1", type: "FF", lag_days: 0 }] },
      { dbId: "db-3", predLinks: [{ id: "db-1", type: "SS", lag_days: 2 }] },
    ]);
  });

  it("defaults an unknown link type to FS and drops predecessors missing from the id map", () => {
    const parsed: ParsedMppTask[] = [
      { ...base, uid: "2", preds: [
        { predUid: "1", linkType: "9", lagDuration: "0" },   // unknown type → FS
        { predUid: "999", linkType: "1", lagDuration: "0" }, // no db id → dropped
      ] },
    ];
    const out = deriveMppDependencies(parsed, { "1": "db-1", "2": "db-2" });
    expect(out).toEqual([
      { dbId: "db-2", predLinks: [{ id: "db-1", type: "FS", lag_days: 0 }] },
    ]);
  });

  it("omits a task whose predecessors all resolve to nothing", () => {
    const parsed: ParsedMppTask[] = [
      { ...base, uid: "2", preds: [{ predUid: "999", linkType: "1", lagDuration: "0" }] },
    ];
    expect(deriveMppDependencies(parsed, { "2": "db-2" })).toEqual([]);
  });
});

describe("inferTaskType", () => {
  it("prioritises milestone and summary before name heuristics", () => {
    expect(inferTaskType("Weld beams", false, true)).toBe("Milestone");
    expect(inferTaskType("Weld beams", true, false)).toBe("Task");
  });

  it("classifies by keyword and defaults to Task", () => {
    expect(inferTaskType("Field erect columns", false, false)).toBe("Install");
    expect(inferTaskType("Ship trusses to site", false, false)).toBe("Delivery");
    expect(inferTaskType("Drawing review", false, false)).toBe("Submittal");
    expect(inferTaskType("Coordinate kickoff", false, false)).toBe("Task");
  });
});

describe("derivePhaseFromHierarchy", () => {
  const summary: ParsedMppTask = {
    uid: "1", name: "Fabrication", start: null, finish: null, pct: 0, preds: [],
    isSummary: true, outlineLevel: 1, outlineNumber: "1", milestone: false, durationDays: null, resources: [], notes: "",
  };
  const child: ParsedMppTask = {
    uid: "2", name: "Weld beams", start: null, finish: null, pct: 0, preds: [],
    isSummary: false, outlineLevel: 2, outlineNumber: "1.1", milestone: false, durationDays: null, resources: [], notes: "",
  };

  it("returns its own name for a top-level (outline ≤ 1) row", () => {
    expect(derivePhaseFromHierarchy(summary, [summary, child])).toBe("Fabrication");
  });

  it("walks up to the nearest level-1 summary for a nested row", () => {
    expect(derivePhaseFromHierarchy(child, [summary, child])).toBe("Fabrication");
  });

  it("returns null when no preceding level-1 summary exists", () => {
    expect(derivePhaseFromHierarchy(child, [child])).toBeNull();
  });
});

describe("parseMsProjectXml", () => {
  const xml = `
    <Project>
      <Resources>
        <Resource><UID>1</UID><Name>Crew A</Name></Resource>
      </Resources>
      <Assignments>
        <Assignment><TaskUID>2</TaskUID><ResourceUID>1</ResourceUID></Assignment>
      </Assignments>
      <Tasks>
        <Task><UID>0</UID><Name>Project Root</Name></Task>
        <Task><UID>1</UID><Name>Fabrication</Name><Summary>1</Summary><OutlineLevel>1</OutlineLevel><OutlineNumber>1</OutlineNumber></Task>
        <Task>
          <UID>2</UID><Name>Weld beams</Name><Summary>0</Summary>
          <OutlineLevel>2</OutlineLevel><OutlineNumber>1.1</OutlineNumber>
          <Start>2026-03-01T08:00:00</Start><Finish>2026-03-05T17:00:00</Finish>
          <PercentComplete>50</PercentComplete><Duration>PT48H0M0S</Duration>
          <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>4800</LinkLag></PredecessorLink>
        </Task>
      </Tasks>
    </Project>`;

  it("skips the root summary, parses dates/duration/resources and predecessor links", () => {
    const tasks = parseMsProjectXml(xml);
    expect(tasks.map((t) => t.uid)).toEqual(["1", "2"]); // UID 0 skipped

    const weld = tasks.find((t) => t.uid === "2")!;
    expect(weld.name).toBe("Weld beams");
    expect(weld.start).toBe("2026-03-01");
    expect(weld.finish).toBe("2026-03-05");
    expect(weld.pct).toBe(50);
    expect(weld.durationDays).toBe(6); // 48h / 8 = 6 days
    expect(weld.resources).toEqual(["Crew A"]);
    expect(weld.preds).toEqual([{ predUid: "1", linkType: "1", lagDuration: "4800" }]);
  });
});
