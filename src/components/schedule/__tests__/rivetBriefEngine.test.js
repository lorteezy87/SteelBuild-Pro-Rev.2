import { describe, it, expect } from "vitest";
import { buildBrief } from "@/components/schedule/rivetBriefEngine";

// buildBrief uses new Date() internally for "today"-relative bucketing, so
// build inputs relative to today. Noon avoids midnight/DST edges (AZ has no DST).
function daysOut(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

const EXPECTED_KEYS = [
  "openTasks", "delayed", "tbd", "overdue", "critical", "stalled", "nearTerm",
  "startsSoon", "dueSoon", "activeNow", "handoffCount", "unassignedTasks",
  "shiftedTasks", "effectiveDates", "totalShiftDays", "logicGaps",
  "successorCountById", "unlinked", "nextCritical", "phaseRows",
  "recoveryActions", "morningPlan", "clipboardText", "riskScore", "aiNarrative",
];

describe("buildBrief (rivet schedule-brief engine)", () => {
  it("returns the full view-model shape for empty input without throwing", () => {
    const brief = buildBrief([]);
    for (const key of EXPECTED_KEYS) expect(brief).toHaveProperty(key);
    expect(Array.isArray(brief.openTasks)).toBe(true);
    expect(brief.openTasks).toHaveLength(0);
    expect(typeof brief.clipboardText).toBe("string");
    expect(typeof brief.riskScore).toBe("number");
    expect(Number.isFinite(brief.riskScore)).toBe(true);
    expect(Array.isArray(brief.phaseRows)).toBe(true);
    expect(typeof brief.aiNarrative).toBe("object");
  });

  it("counts open work and excludes closed/complete tasks", () => {
    const tasks = [
      { id: "1", task_name: "A", status: "In Progress", phase: "Detailing", end_date: daysOut(5) },
      { id: "2", task_name: "B", status: "Complete", phase: "Detailing", end_date: daysOut(-5) },
    ];
    const openIds = buildBrief(tasks).openTasks.map((t) => t.id);
    expect(openIds).toContain("1");
    expect(openIds).not.toContain("2");
  });

  it("flags a past-due open work task as overdue", () => {
    const tasks = [
      { id: "od", task_name: "Late", status: "In Progress", phase: "Fabrication", start_date: daysOut(-20), end_date: daysOut(-10) },
    ];
    expect(buildBrief(tasks).overdue.map((t) => t.id)).toContain("od");
  });

  it("collects unassigned open work (no owner)", () => {
    const tasks = [
      { id: "u1", task_name: "No owner", status: "Not Started", phase: "Erection", end_date: daysOut(3) },
      { id: "u2", task_name: "Owned", status: "Not Started", phase: "Erection", end_date: daysOut(3), resource_names: "Crew A" },
    ];
    const unassignedIds = buildBrief(tasks).unassignedTasks.map((t) => t.id);
    expect(unassignedIds).toContain("u1");
    expect(unassignedIds).not.toContain("u2");
  });

  it("produces a non-empty clipboard brief", () => {
    const tasks = [
      { id: "x", task_name: "Task", status: "In Progress", phase: "Detailing", end_date: daysOut(2) },
    ];
    expect(buildBrief(tasks).clipboardText.length).toBeGreaterThan(0);
  });
});
