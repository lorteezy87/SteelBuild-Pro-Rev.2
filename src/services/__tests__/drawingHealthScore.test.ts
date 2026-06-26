/**
 * drawingHealthScore.test.ts
 *
 * Behavioral unit tests for calculateDrawingHealthScore + summarizeFleetHealth.
 * All inputs are plain objects — no React, no Supabase.
 *
 * Key engine constants (read from source, do NOT edit to match guesses):
 *   WEIGHTS: openRfis=20, revisionRisk=18, approval=16, aging=14,
 *            submittal=12, readiness=12, missingSheets=8
 *   gradeFor:  ≥90→A, ≥80→B, ≥70→C, ≥60→D, else→F
 *   bandFor:   ≥90→excellent, ≥75→good, ≥60→at_risk, else→critical
 *   summarizeFleetHealth([]) → averageScore=100 (source: `list.length ? ... : 100`)
 */

import { describe, expect, it } from "vitest";
import {
  calculateDrawingHealthScore,
  summarizeFleetHealth,
  type DrawingHealthScore,
} from "../drawingHealthScore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal clean pkg (released, no RFIs, no revisions, sheets present). */
const cleanPkg = () => ({
  setId: "set-1",
  name: "Main Steel - IFC",
  sheets: [
    { id: "s1", drawing_number: "S1", stage: "Released", linked_rfi_ids: null },
    { id: "s2", drawing_number: "S2", stage: "Released", linked_rfi_ids: null },
  ],
  submittals: [
    {
      id: "sub-1",
      status: "Released for Fabrication",
      ball_in_court: null,
      approved_date: null,
      round_number: 1,
      is_deleted: false,
    },
  ],
  parent: null,
});

/** Minimal empty pkg (no submittals, no sheets, no parent). */
const emptyPkg = () => ({
  setId: "set-empty",
  name: "Anchor Bolts",
  sheets: [],
  submittals: [],
  parent: null,
});

/** Pkg with a single "Approved as Noted" terminal submittal (not Released for Fab). */
const approvedNotedPkg = () => ({
  setId: "set-2",
  name: "Misc Steel - BFA",
  sheets: [{ id: "s3", drawing_number: "M1", stage: "BFA", linked_rfi_ids: null }],
  submittals: [
    {
      id: "sub-2",
      status: "Approved as Noted",
      ball_in_court: "EOR",
      approved_date: "2026-06-01",
      round_number: 1,
      is_deleted: false,
    },
  ],
  parent: null,
});

/** Pkg with one open RFI linked to a sheet; submittal is "Draft" (IFA). */
const rfiBlockedPkg = (openRfiCount = 1) => {
  const linkedIds = Array.from({ length: openRfiCount }, (_, i) => `RFI-${i + 1}`).join(",");
  return {
    setId: "set-rfi",
    name: "Connections - IFA",
    sheets: [{ id: "s4", drawing_number: "C1", stage: "IFA", linked_rfi_ids: linkedIds }],
    submittals: [
      {
        id: "sub-3",
        status: "Draft",
        ball_in_court: "Detailer",
        approved_date: null,
        round_number: 1,
        is_deleted: false,
      },
    ],
    parent: null,
  };
};

/** Build RFI objects — open by default (status "Open"); closed = "Answered". */
const makeRfi = (rfi_number: string, open = true) => ({
  id: `rfi-${rfi_number}`,
  rfi_number,
  status: open ? "Open" : "Answered",
  is_deleted: false,
});

/** Pkg that is 30 days overdue (for the aging factor), no submittal. */
const overduePkg = (today = "2026-07-01") => ({
  setId: "set-overdue",
  name: "Erection - OFA",
  sheets: [{ id: "s5", drawing_number: "E1", stage: "Not Started", linked_rfi_ids: null }],
  submittals: [],
  parent: { due_date: "2026-06-01" }, // 30 days before today
});

// ─── calculateDrawingHealthScore ──────────────────────────────────────────────

describe("calculateDrawingHealthScore", () => {
  it("clean Released-for-Fabrication package → score 100, grade A, band excellent", () => {
    const result = calculateDrawingHealthScore(cleanPkg(), { today: "2026-06-25" });
    expect(result.score).toBe(100);
    expect(result.grade).toBe("A");
    expect(result.band.key).toBe("excellent");
    expect(result.issues).toHaveLength(0);
    // All factors should have 0 deduction
    for (const f of result.factors) {
      expect(f.deduction).toBe(0);
    }
  });

  it("Approved-as-Noted (terminal, not Released) → small approval deduction, still grade A", () => {
    // approvalDed = Math.round(16 * 0.15) = 2; score = 98 → grade A, band excellent
    const result = calculateDrawingHealthScore(approvedNotedPkg(), { today: "2026-06-25" });
    expect(result.score).toBe(98);
    expect(result.grade).toBe("A");
    expect(result.band.key).toBe("excellent");
    const approvalFactor = result.factors.find((f) => f.key === "approval")!;
    expect(approvalFactor.deduction).toBe(2);
    // Approved sets do not age
    const agingFactor = result.factors.find((f) => f.key === "aging")!;
    expect(agingFactor.deduction).toBe(0);
  });

  it("one open RFI linked → openRfis deduction=8, issue entry present, score reduced", () => {
    // stageIndex for "IFA" (Draft submittal maps to IFA) = 1; maxIndex = 6
    // approvalDed = Math.round(16 * (1 - 1/6)) = Math.round(13.33) = 13
    // openRfiDed = 8 (1 RFI × 8)
    // total deduction = 13 + 8 = 21; score = 79 → grade C (≥70), band good (≥75)
    const pkg = rfiBlockedPkg(1);
    const rfis = [makeRfi("RFI-1", true)];
    const result = calculateDrawingHealthScore(pkg, { rfis, today: "2026-06-25" });

    const rfiIssue = result.issues.find((f) => f.key === "openRfis")!;
    expect(rfiIssue).toBeDefined();
    expect(rfiIssue.deduction).toBe(8);
    expect(result.score).toBeLessThan(100);

    // Score is deterministic: 79
    expect(result.score).toBe(79);
    expect(result.grade).toBe("C");
    expect(result.band.key).toBe("good");
  });

  it("closed RFI does NOT contribute to the deduction", () => {
    const pkg = rfiBlockedPkg(1);
    const closedRfis = [makeRfi("RFI-1", false)]; // "Answered" → not open
    const result = calculateDrawingHealthScore(pkg, { rfis: closedRfis, today: "2026-06-25" });
    const rfiIssue = result.factors.find((f) => f.key === "openRfis")!;
    expect(rfiIssue.deduction).toBe(0);
    expect(result.issues.find((f) => f.key === "openRfis")).toBeUndefined();
  });

  it("issues array only contains factors with deduction > 0, sorted worst first", () => {
    // Force multiple deductions: 2 open RFIs + "Not Started" approval
    const pkg = rfiBlockedPkg(2);
    // No submittal for this variant — reuse the draft submittal shape
    const rfis = [makeRfi("RFI-1", true), makeRfi("RFI-2", true)];
    const result = calculateDrawingHealthScore(pkg, { rfis, today: "2026-06-25" });

    expect(result.issues.length).toBeGreaterThan(0);
    for (const issue of result.issues) {
      expect(issue.deduction).toBeGreaterThan(0);
    }
    // Sorted descending by deduction (worst first)
    for (let i = 1; i < result.issues.length; i++) {
      expect(result.issues[i - 1].deduction).toBeGreaterThanOrEqual(result.issues[i].deduction);
    }
  });

  it("aging: 30 days overdue → approx 14 points deducted (full aging weight)", () => {
    // 30 days overdue: Math.round(30 * (14/30)) = Math.round(14) = 14 = full weight
    const pkg = overduePkg("2026-07-01");
    const result = calculateDrawingHealthScore(pkg, { today: "2026-07-01" });
    const agingFactor = result.factors.find((f) => f.key === "aging")!;
    expect(agingFactor.deduction).toBe(14); // full aging weight
    expect(agingFactor.severity).toBe("critical"); // 14/14 = 1.0 ≥ 0.66
  });

  it("readiness flags: material_impacted → 6 pts, long_lead_impact → 6 pts, capped at 12", () => {
    const pkg = {
      ...emptyPkg(),
      parent: { material_impacted: true, long_lead_impact: true },
    };
    const result = calculateDrawingHealthScore(pkg, { today: "2026-06-25" });
    const readinessFactor = result.factors.find((f) => f.key === "readiness")!;
    expect(readinessFactor.deduction).toBe(12); // both flags = 6+6 = 12 (== cap)
    expect(readinessFactor.severity).toBe("critical");
  });

  it("missing sheets: 5 of 10 missing → 4 pts (50% of weight=8)", () => {
    const pkg = {
      ...emptyPkg(),
      parent: { sheet_count: 10 },
      sheets: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, drawing_number: `S${i}` })),
    };
    const result = calculateDrawingHealthScore(pkg, { today: "2026-06-25" });
    const missingFactor = result.factors.find((f) => f.key === "missingSheets")!;
    expect(missingFactor.deduction).toBe(4); // Math.round((5/10) * 8) = 4
  });

  it("empty pkg (no sheets, no submittals) → score reflects only approval deduction", () => {
    // stageIndex for "Not Started" = 0; approvalDed = Math.round(16 * (1 - 0/6)) = 16
    // No due date, no RFIs, no revisions, no readiness flags, no missing sheets (expected=0)
    const result = calculateDrawingHealthScore(emptyPkg(), { today: "2026-06-25" });
    expect(result.score).toBe(84); // 100 - 16
    expect(result.grade).toBe("B");
    expect(result.band.key).toBe("good");
  });

  // ── Grade / band boundary assertions ──────────────────────────────────────

  it("grade A: score ≥ 90 → band excellent", () => {
    // Released for Fab = perfect 100
    const result = calculateDrawingHealthScore(cleanPkg(), { today: "2026-06-25" });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.grade).toBe("A");
    expect(result.band.key).toBe("excellent");
  });

  it("grade B: score in [80,89] → band good", () => {
    // Empty pkg: score=84 (100 - 16 approvalDed for Not Started)
    const result = calculateDrawingHealthScore(emptyPkg(), { today: "2026-06-25" });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.score).toBeLessThan(90);
    expect(result.grade).toBe("B");
    expect(result.band.key).toBe("good");
  });

  it("grade C: score in [70,79] → one open RFI + draft submittal → score=79, band good", () => {
    const pkg = rfiBlockedPkg(1);
    const result = calculateDrawingHealthScore(pkg, {
      rfis: [makeRfi("RFI-1", true)],
      today: "2026-06-25",
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThan(80);
    expect(result.grade).toBe("C");
  });

  it("grade D: score in [60,69] → 2 open RFIs + Not Started → score=68, band at_risk", () => {
    // No submittal → approvalDed for "Not Started" = 16
    // 2 open RFIs → openRfiDed = 16; total = 32; score = 68
    const pkg = {
      ...emptyPkg(),
      sheets: [{ id: "s1", drawing_number: "C1", linked_rfi_ids: "RFI-1,RFI-2" }],
    };
    const rfis = [makeRfi("RFI-1", true), makeRfi("RFI-2", true)];
    const result = calculateDrawingHealthScore(pkg, { rfis, today: "2026-06-25" });
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(70);
    expect(result.grade).toBe("D");
    expect(result.band.key).toBe("at_risk");
  });

  it("grade F + band critical: score < 60 via 4 open RFIs + aging 30d overdue + no submittal", () => {
    // 4 open RFIs → openRfiDed = min(20, 32) = 20
    // No submittal → "Not Started" (stageIndex=0) → approvalDed = 16
    // 30d overdue → agingDed = min(14, round(30*14/30)) = 14
    // total = 50; score = 50 → grade F, band critical
    const linkedIds = "RFI-1,RFI-2,RFI-3,RFI-4";
    const pkg = {
      setId: "set-f",
      name: "Critical set",
      sheets: [{ id: "s1", drawing_number: "F1", linked_rfi_ids: linkedIds }],
      submittals: [],
      parent: { due_date: "2026-06-01" }, // 30 days before today
    };
    const rfis = [
      makeRfi("RFI-1", true),
      makeRfi("RFI-2", true),
      makeRfi("RFI-3", true),
      makeRfi("RFI-4", true),
    ];
    const result = calculateDrawingHealthScore(pkg, { rfis, today: "2026-07-01" });
    expect(result.score).toBeLessThan(60);
    expect(result.grade).toBe("F");
    expect(result.band.key).toBe("critical");
  });

  it("setId and setName are surfaced correctly", () => {
    const result = calculateDrawingHealthScore(cleanPkg(), { today: "2026-06-25" });
    expect(result.setId).toBe("set-1");
    expect(result.setName).toBe("Main Steel - IFC");
  });

  it("stage is a string from STAGE_ORDER", () => {
    const result = calculateDrawingHealthScore(cleanPkg(), { today: "2026-06-25" });
    expect(typeof result.stage).toBe("string");
    expect(result.stage.length).toBeGreaterThan(0);
  });

  it("null / undefined pkg → does not throw; returns some score", () => {
    expect(() => calculateDrawingHealthScore(null as any, { today: "2026-06-25" })).not.toThrow();
    expect(() => calculateDrawingHealthScore(undefined as any, { today: "2026-06-25" })).not.toThrow();
  });
});

// ─── summarizeFleetHealth ─────────────────────────────────────────────────────

describe("summarizeFleetHealth", () => {
  it("empty array → safe zeros (no NaN), averageScore = 100 (source default)", () => {
    const fleet = summarizeFleetHealth([]);
    expect(fleet.count).toBe(0);
    expect(Number.isNaN(fleet.averageScore)).toBe(false);
    expect(fleet.averageScore).toBe(100);
    // All grade/band counts must be 0
    for (const v of Object.values(fleet.byGrade)) expect(v).toBe(0);
    for (const v of Object.values(fleet.byBand)) expect(v).toBe(0);
    expect(fleet.worst).toHaveLength(0);
  });

  it("single score → averageScore = that score, byBand / byGrade counts = 1", () => {
    const score = calculateDrawingHealthScore(cleanPkg(), { today: "2026-06-25" });
    const fleet = summarizeFleetHealth([score]);
    expect(fleet.count).toBe(1);
    expect(fleet.averageScore).toBe(score.score); // 100
    expect(fleet.byGrade[score.grade]).toBe(1);
    expect(fleet.byBand[score.band.key]).toBe(1);
    expect(fleet.worst).toHaveLength(1);
  });

  it("multiple scores → correct average, byGrade / byBand totals, worst sorted ascending", () => {
    const today = "2026-06-25";
    const s1 = calculateDrawingHealthScore(cleanPkg(), { today }); // score=100, A, excellent
    const s2 = calculateDrawingHealthScore(emptyPkg(), { today }); // score=84, B, good
    // One open RFI + Draft submittal → score=79, C, good
    const s3 = calculateDrawingHealthScore(
      rfiBlockedPkg(1),
      { rfis: [makeRfi("RFI-1", true)], today },
    );

    const fleet = summarizeFleetHealth([s1, s2, s3]);
    expect(fleet.count).toBe(3);
    expect(fleet.averageScore).toBe(Math.round((100 + 84 + 79) / 3)); // 88

    expect(fleet.byGrade["A"]).toBe(1);
    expect(fleet.byGrade["B"]).toBe(1);
    expect(fleet.byGrade["C"]).toBe(1);
    expect(fleet.byBand["excellent"]).toBe(1);
    expect(fleet.byBand["good"]).toBe(2);

    // worst is sorted ascending by score (lowest-scoring first)
    const scores = fleet.worst.map((w) => w.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeLessThanOrEqual(scores[i]);
    }
    expect(scores[0]).toBe(79); // s3 is the worst
  });

  it("worst-N cap is respected (default 5)", () => {
    const today = "2026-06-25";
    const many: DrawingHealthScore[] = Array.from({ length: 10 }, () =>
      calculateDrawingHealthScore(cleanPkg(), { today }),
    );
    const fleet = summarizeFleetHealth(many); // default worstN=5
    expect(fleet.worst.length).toBeLessThanOrEqual(5);
  });

  it("null / falsy entries in the array are filtered out gracefully", () => {
    const score = calculateDrawingHealthScore(cleanPkg(), { today: "2026-06-25" });
    // Passing null values inside the array — the source filters via `.filter(Boolean)`
    const fleet = summarizeFleetHealth([score, null as any, undefined as any]);
    expect(fleet.count).toBe(1);
    expect(Number.isNaN(fleet.averageScore)).toBe(false);
  });
});
