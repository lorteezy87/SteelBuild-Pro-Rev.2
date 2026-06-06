import { describe, it, expect } from "vitest";
import {
  DEFAULT_LEAD_DAYS,
  resolveLeadDays,
  computeBackwardDates,
  computeScheduleRisk,
} from "@/lib/detailingSchedule";

describe("computeBackwardDates", () => {
  it("works backward from the erection date through the default lead chain", () => {
    // Erection June 10 → matches the worked example (detailing starts ~Apr 28).
    const d = computeBackwardDates("2026-06-10");
    expect(d.erectionReleaseRequiredBy).toBe("2026-06-07"); // -3
    expect(d.fabReleaseRequiredBy).toBe("2026-05-23");       // -15
    expect(d.approvalNeededBy).toBe("2026-05-21");           // -2
    expect(d.submitBy).toBe("2026-05-11");                   // -10
    expect(d.internalReviewDue).toBe("2026-05-08");          // -3
    expect(d.detailingStart).toBe("2026-04-28");             // -10
  });

  it("returns all-null when there is no erection date (TBD, never invented)", () => {
    const d = computeBackwardDates(null);
    expect(Object.values(d).every((v) => v === null)).toBe(true);
  });

  it("respects overridden lead times", () => {
    const d = computeBackwardDates("2026-06-10", { erectionPrep: 0, fab: 0, fabRelease: 0, approval: 0, internalReview: 0, detailing: 0 });
    // every milestone collapses onto the erection date
    expect(d.detailingStart).toBe("2026-06-10");
    expect(d.erectionReleaseRequiredBy).toBe("2026-06-10");
  });
});

describe("resolveLeadDays", () => {
  it("merges defaults ← project override ← package override", () => {
    const project = { metadata: { detailing_lead_days: { fab: 20, approval: 14 } } };
    const pkg = { metadata: { detailing_lead_days: { fab: 25 } } };
    const merged = resolveLeadDays(project, pkg);
    expect(merged.fab).toBe(25);                       // package wins
    expect(merged.approval).toBe(14);                  // project override
    expect(merged.detailing).toBe(DEFAULT_LEAD_DAYS.detailing); // default
  });
  it("falls back to defaults with no metadata", () => {
    expect(resolveLeadDays(null, null)).toEqual(DEFAULT_LEAD_DAYS);
  });
});

describe("computeScheduleRisk", () => {
  const bd = {
    detailingStart: "2026-05-01",
    internalReviewDue: "2026-05-05",
    submitBy: "2026-05-10",
    approvalNeededBy: "2026-05-20",
    fabReleaseRequiredBy: "2026-05-25",
    erectionReleaseRequiredBy: "2026-06-01",
  };

  it("no risk when no dates are known", () => {
    const r = computeScheduleRisk({ backwardDates: {}, effectiveState: "Not Started", today: "2026-05-12" });
    expect(r.atRisk).toBe(false);
    expect(r.severity).toBe("none");
  });

  it("one overdue milestone → at_risk", () => {
    // today past detailingStart only; package still Not Started.
    const r = computeScheduleRisk({ backwardDates: bd, effectiveState: "Not Started", today: "2026-05-03" });
    expect(r.missed).toEqual(["detailingStart"]);
    expect(r.severity).toBe("at_risk");
    expect(r.daysLate).toBe(2);
  });

  it("two+ overdue milestones → critical", () => {
    // today past submitBy; still Not Started → detailingStart + submitBy missed.
    const r = computeScheduleRisk({ backwardDates: bd, effectiveState: "Not Started", today: "2026-05-12" });
    expect(r.missed).toEqual(["detailingStart", "submitBy"]);
    expect(r.severity).toBe("critical");
  });

  it("no risk when the package has met the milestones despite passed dates", () => {
    // today past submitBy, but the package is already at OFA (submitted/out for approval)
    const r = computeScheduleRisk({ backwardDates: bd, effectiveState: "OFA", today: "2026-05-12" });
    expect(r.atRisk).toBe(false);
    expect(r.missed).toEqual([]);
  });
});
