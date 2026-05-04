// drawingsSubmittalCohesion.test.js — smoke test that the two derivation
// paths the Drawings page now uses to display stage information stay in
// agreement.
//
// Path A — `submittalPipelineRollupFromSubmittals` in projectMetrics.js
//   Maps each non-deleted submittal to one of 6 active display stages
//   (IFA / OFA / BFA / OFS / IFC / Released) and counts ROWS. This drives
//   the StagePipeline chevrons on the Drawings page.
//
// Path B — `derivedSetStage` in submittalStageMapping.js
//   For each drawing set, picks the most-recent linked submittal and
//   maps it to one stage. This drives per-set badges and the IN REVIEW KPI.
//
// Both paths rely on the same submittalStatusToStage helper internally,
// so they agree per-row. The two-path consumer split is "rollup counts
// rows" vs "per-set count counts sets" — these can legitimately differ
// when one set has multiple submittals in different stages. We exercise
// both modes to lock in the agreed behaviour.

import { describe, it, expect } from "vitest";
import { submittalPipelineRollupFromSubmittals } from "@/pages/dashboard/projectMetrics";
import { derivedSetStage } from "@/lib/submittalStageMapping";

// ── Fixture ────────────────────────────────────────────────────────
// 5 submittals across 3 drawing sets, 12 drawings total.

const SET_A = "set-A";
const SET_B = "set-B";
const SET_C = "set-C";

const submittals = [
  // Set A: Released for Fabrication (terminal)
  {
    id: "s1",
    status: "Released for Fabrication",
    ball_in_court: null,
    approved_date: "2026-01-15",
    drawing_set_ids: [SET_A],
    submitted_date: "2025-12-01",
    is_deleted: false,
  },
  // Set A: an older "Approved as Noted" with bic Detailer (post-approval
  // scrub) — should NOT win as most-recent (older submitted_date).
  {
    id: "s2",
    status: "Approved as Noted",
    ball_in_court: "Detailer",
    approved_date: null,
    drawing_set_ids: [SET_A],
    submitted_date: "2025-09-01",
    is_deleted: false,
  },
  // Set B: Revise and Resubmit → IFA (loop back)
  {
    id: "s3",
    status: "Revise and Resubmit",
    ball_in_court: "Detailer",
    approved_date: null,
    drawing_set_ids: [SET_B],
    submitted_date: "2025-11-15",
    is_deleted: false,
  },
  // Set C: Approved as Noted + bic EOR → BFA (just-returned)
  {
    id: "s4",
    status: "Approved as Noted",
    ball_in_court: "EOR",
    approved_date: null,
    drawing_set_ids: [SET_C],
    submitted_date: "2025-10-10",
    is_deleted: false,
  },
  // Soft-deleted Approved submittal — must NOT count anywhere.
  {
    id: "s5",
    status: "Approved",
    ball_in_court: null,
    approved_date: "2026-02-01",
    drawing_set_ids: [SET_C],
    submitted_date: "2025-08-01",
    is_deleted: true,
  },
];

const drawings = [
  // Set A — 4 sheets, all Released
  { id: "d1", drawing_set_id: SET_A, stage: "Released" },
  { id: "d2", drawing_set_id: SET_A, stage: "Released" },
  { id: "d3", drawing_set_id: SET_A, stage: "Released" },
  { id: "d4", drawing_set_id: SET_A, stage: "Released" },
  // Set B — 4 sheets in IFA (post-R&R)
  { id: "d5", drawing_set_id: SET_B, stage: "IFA" },
  { id: "d6", drawing_set_id: SET_B, stage: "IFA" },
  { id: "d7", drawing_set_id: SET_B, stage: "OFA" },
  { id: "d8", drawing_set_id: SET_B, stage: "OFA" },
  // Set C — 4 sheets, mix of OFA and BFA
  { id: "d9",  drawing_set_id: SET_C, stage: "OFA" },
  { id: "d10", drawing_set_id: SET_C, stage: "OFA" },
  { id: "d11", drawing_set_id: SET_C, stage: "BFA" },
  { id: "d12", drawing_set_id: SET_C, stage: "BFA" },
];

// Helper: bucket each set by derivedSetStage(submittals-for-set, sheets-for-set).
function bucketSetsByDerivedStage(setIds, allSubmittals, allDrawings) {
  const stages = ["IFA", "OFA", "BFA", "OFS", "IFC", "Released"];
  const counts = stages.reduce((acc, s) => { acc[s] = 0; return acc; }, {});
  for (const setId of setIds) {
    const subs = allSubmittals.filter((s) =>
      Array.isArray(s.drawing_set_ids) && s.drawing_set_ids.includes(setId),
    );
    const sheets = allDrawings.filter((d) => d.drawing_set_id === setId);
    const stage = derivedSetStage(subs, sheets);
    if (counts[stage] !== undefined) counts[stage]++;
  }
  return counts;
}

describe("Drawings ↔ Submittals cohesion smoke test", () => {
  it("submittalPipelineRollupFromSubmittals counts active submittal rows", () => {
    const { counts, total } = submittalPipelineRollupFromSubmittals(submittals);
    // 4 active submittals (s5 soft-deleted):
    //   s1 Released for Fabrication      → Released
    //   s2 Approved as Noted + Detailer  → OFS
    //   s3 Revise and Resubmit           → IFA (loop back)
    //   s4 Approved as Noted + EOR       → BFA
    expect(total).toBe(4);
    expect(counts.Released).toBe(1);
    expect(counts.OFS).toBe(1);
    expect(counts.IFA).toBe(1);
    expect(counts.BFA).toBe(1);
    // Unused buckets must be empty for this fixture.
    expect(counts.OFA).toBe(0);
    expect(counts.IFC).toBe(0);
  });

  it("derivedSetStage resolves each set to the expected stage", () => {
    // Set A: most-recent submittal is s1 (Released for Fabrication)
    expect(derivedSetStage(
      submittals.filter((s) => s.drawing_set_ids.includes(SET_A)),
      drawings.filter((d) => d.drawing_set_id === SET_A),
    )).toBe("Released");

    // Set B: only active submittal is s3 (Revise and Resubmit) → IFA
    expect(derivedSetStage(
      submittals.filter((s) => s.drawing_set_ids.includes(SET_B)),
      drawings.filter((d) => d.drawing_set_id === SET_B),
    )).toBe("IFA");

    // Set C: only active submittal is s4 (Approved as Noted + EOR) → BFA
    // (s5 is soft-deleted and excluded)
    expect(derivedSetStage(
      submittals.filter((s) => s.drawing_set_ids.includes(SET_C)),
      drawings.filter((d) => d.drawing_set_id === SET_C),
    )).toBe("BFA");
  });

  it("per-set bucketing differs from rollup when a set has multiple submittals", () => {
    const setIds = [SET_A, SET_B, SET_C];
    const fromSets = bucketSetsByDerivedStage(setIds, submittals, drawings);
    // Set A → Released (most recent: s1)
    // Set B → IFA      (only active: s3, R&R loop)
    // Set C → BFA      (only active: s4)
    expect(fromSets).toEqual({
      IFA: 1, OFA: 0, BFA: 1, OFS: 0, IFC: 0, Released: 1,
    });

    // Compare to the row-rollup. Path A counts each submittal row, so
    // Set A's older s2 (Approved as Noted + Detailer = OFS) adds an
    // extra OFS row even though it doesn't drive Set A's display
    // stage. We assert the per-bucket relationship explicitly so the
    // test documents the difference rather than masking it.
    const rollup = submittalPipelineRollupFromSubmittals(submittals).counts;
    expect(rollup.Released).toBe(fromSets.Released);    // 1 ↔ 1 ✓
    expect(rollup.BFA).toBe(fromSets.BFA);              // 1 ↔ 1 ✓
    expect(rollup.IFA).toBe(fromSets.IFA);              // 1 ↔ 1 ✓
    // OFS rollup has s2 (older Set A submittal mapped to OFS) = 1,
    // while per-set is 0 (Set A's dominant stage is Released, not OFS).
    expect(rollup.OFS).toBe(1);
    expect(fromSets.OFS).toBe(0);
  });

  it("falls back to dominant sheet stage when a set has no submittals", () => {
    const orphanSheets = [
      { id: "x1", drawing_set_id: "set-X", stage: "OFA" },
      { id: "x2", drawing_set_id: "set-X", stage: "OFA" },
      { id: "x3", drawing_set_id: "set-X", stage: "BFA" },
    ];
    expect(derivedSetStage([], orphanSheets)).toBe("OFA");
  });

  it("returns Not Started when neither submittals nor sheets exist", () => {
    expect(derivedSetStage([], [])).toBe("Not Started");
    expect(derivedSetStage(null, null)).toBe("Not Started");
  });

  it("ignores soft-deleted submittals on both paths", () => {
    // s5 is "Approved + approved_date" but is_deleted, so it must be
    // filtered. Set C's stage comes from s4 (Approved as Noted + EOR → BFA).
    const setCSubs = submittals.filter((s) => s.drawing_set_ids.includes(SET_C));
    const setCDrawings = drawings.filter((d) => d.drawing_set_id === SET_C);
    expect(derivedSetStage(setCSubs, setCDrawings)).toBe("BFA");

    const rollup = submittalPipelineRollupFromSubmittals(submittals);
    expect(rollup.total).toBe(4);
  });
});
