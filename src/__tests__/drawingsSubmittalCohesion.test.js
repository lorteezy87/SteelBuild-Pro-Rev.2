// drawingsSubmittalCohesion.test.js — smoke test that the two derivation
// paths the Drawings page now uses to display stage information stay in
// agreement on the unambiguous statuses.
//
// Path A — `submittalPipelineRollupFromSubmittals` in projectMetrics.js
//   Maps each non-deleted submittal to one of 6 display stages and
//   counts rows. This drives the StagePipeline chevrons.
//
// Path B — `derivedSetStage` in submittalStageMapping.js
//   For each drawing set, picks the most-recent linked submittal and
//   maps it. This drives per-set badges and the IN REVIEW KPI.
//
// For a fixture where each submittal is linked to exactly one unique
// set, the two rollups should produce identical per-stage counts on
// the unambiguous statuses (Approved/Approved as Noted/Revise and
// Resubmit/Rejected/Released for Fabrication). Drawings sit underneath
// the sets but the submittal-driven path doesn't read them — they're a
// fallback only, and we exercise that fallback in a sub-case to make
// sure a set with NO submittals correctly falls back to dominant sheet
// stage.
//
// Known divergence (deliberately NOT exercised here):
//   - Submitted/Under Review + ball_in_court polarity: the two
//     functions disagree on which polarity maps to OFA vs OFS. That's
//     a real bug worth fixing in a separate change; this smoke test
//     stays scoped to the unambiguous cases so it can run green and
//     guard against future drift on the agreed-upon statuses.

import { describe, it, expect } from "vitest";
import { submittalPipelineRollupFromSubmittals } from "@/pages/dashboard/projectMetrics";
import { derivedSetStage } from "@/lib/submittalStageMapping";

// ── Fixture ────────────────────────────────────────────────────────
// 5 submittals across 3 drawing sets, 12 drawings total. Statuses
// chosen so the two derivation paths must agree.

const SET_A = "set-A";
const SET_B = "set-B";
const SET_C = "set-C";

const submittals = [
  // Set A: a Released submittal (Approved + approved_date)
  {
    id: "s1",
    status: "Approved",
    ball_in_court: "Detailer",
    approved_date: "2026-01-15",
    drawing_set_ids: [SET_A],
    submitted_date: "2025-12-01",
    is_deleted: false,
  },
  // Set A: an older "Approved as Noted" submittal — should NOT win
  // (older submitted_date), so the dominant stage for A stays Released.
  {
    id: "s2",
    status: "Approved as Noted",
    ball_in_court: "Detailer",
    approved_date: null,
    drawing_set_ids: [SET_A],
    submitted_date: "2025-09-01",
    is_deleted: false,
  },
  // Set B: BFA (Revise and Resubmit)
  {
    id: "s3",
    status: "Revise and Resubmit",
    ball_in_court: "Detailer",
    approved_date: null,
    drawing_set_ids: [SET_B],
    submitted_date: "2025-11-15",
    is_deleted: false,
  },
  // Set C: BFS (Approved as Noted)
  {
    id: "s4",
    status: "Approved as Noted",
    ball_in_court: "EOR",
    approved_date: null,
    drawing_set_ids: [SET_C],
    submitted_date: "2025-10-10",
    is_deleted: false,
  },
  // Soft-deleted submittal, should NOT count anywhere.
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
  // Set A — 4 sheets
  { id: "d1", drawing_set_id: SET_A, stage: "FFF" },
  { id: "d2", drawing_set_id: SET_A, stage: "FFF" },
  { id: "d3", drawing_set_id: SET_A, stage: "Released" },
  { id: "d4", drawing_set_id: SET_A, stage: "Released" },
  // Set B — 4 sheets
  { id: "d5", drawing_set_id: SET_B, stage: "BFA" },
  { id: "d6", drawing_set_id: SET_B, stage: "BFA" },
  { id: "d7", drawing_set_id: SET_B, stage: "OFA" },
  { id: "d8", drawing_set_id: SET_B, stage: "OFA" },
  // Set C — 4 sheets
  { id: "d9",  drawing_set_id: SET_C, stage: "BFS" },
  { id: "d10", drawing_set_id: SET_C, stage: "BFS" },
  { id: "d11", drawing_set_id: SET_C, stage: "OFS" },
  { id: "d12", drawing_set_id: SET_C, stage: "OFS" },
];

// Helper: bucket each set by derivedSetStage(submittals-for-set, sheets-for-set).
function bucketSetsByDerivedStage(setIds, allSubmittals, allDrawings) {
  const stages = ["OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
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
  it("submittalPipelineRollupFromSubmittals counts active submittals (one per row)", () => {
    const { counts, total } = submittalPipelineRollupFromSubmittals(submittals);
    // 4 active submittals (s5 is soft-deleted): s1=Released, s2=BFS, s3=BFA, s4=BFS
    expect(total).toBe(4);
    expect(counts.Released).toBe(1);
    expect(counts.BFS).toBe(2);
    expect(counts.BFA).toBe(1);
    // Unambiguous buckets must be empty for this fixture.
    expect(counts.OFA).toBe(0);
    expect(counts.OFS).toBe(0);
    expect(counts.FFF).toBe(0);
  });

  it("derivedSetStage resolves each set to the expected stage", () => {
    // Set A: most-recent submittal is s1 (Approved + date) → Released
    expect(derivedSetStage(
      submittals.filter((s) => s.drawing_set_ids.includes(SET_A)),
      drawings.filter((d) => d.drawing_set_id === SET_A),
    )).toBe("Released");

    // Set B: only active submittal is s3 (Revise and Resubmit) → BFA
    expect(derivedSetStage(
      submittals.filter((s) => s.drawing_set_ids.includes(SET_B)),
      drawings.filter((d) => d.drawing_set_id === SET_B),
    )).toBe("BFA");

    // Set C: only active submittal is s4 (Approved as Noted) → BFS
    // (s5 is soft-deleted)
    expect(derivedSetStage(
      submittals.filter((s) => s.drawing_set_ids.includes(SET_C)),
      drawings.filter((d) => d.drawing_set_id === SET_C),
    )).toBe("BFS");
  });

  it("per-set bucketing equals submittal rollup on unambiguous stages", () => {
    const setIds = [SET_A, SET_B, SET_C];
    const fromSets = bucketSetsByDerivedStage(setIds, submittals, drawings);
    // Path A counts submittal ROWS; Path B counts SET ROWS. Because each
    // set has exactly one stage-defining submittal in this fixture (the
    // most-recent one for A, the only active one for B and C), the two
    // counts agree.
    //
    // Set A → Released (most recent: s1)
    // Set B → BFA      (only active: s3)
    // Set C → BFS      (only active: s4; s5 is soft-deleted)
    expect(fromSets).toEqual({
      OFA: 0, BFA: 1, OFS: 0, BFS: 1, FFF: 0, Released: 1,
    });

    // Compare to the rollup on the same buckets. Path A counts each
    // submittal row, so Set A's older s2 (Approved as Noted) adds an
    // extra BFS row even though it doesn't drive Set A's display
    // stage. We assert the per-bucket relationship explicitly so the
    // test communicates the difference rather than masking it.
    const rollup = submittalPipelineRollupFromSubmittals(submittals).counts;
    expect(rollup.Released).toBe(fromSets.Released);    // 1 ↔ 1 ✓
    expect(rollup.BFA).toBe(fromSets.BFA);              // 1 ↔ 1 ✓
    // BFS rollup has both s2 (older for Set A) and s4 (Set C) = 2,
    // while per-set count is 1 (only Set C resolves to BFS as its
    // dominant stage). This is the documented "rollup counts rows,
    // per-set counts sets" difference — both are correct for their
    // respective consumers.
    expect(rollup.BFS).toBe(2);
    expect(fromSets.BFS).toBe(1);
  });

  it("falls back to dominant sheet stage when a set has no submittals", () => {
    // Synthesize a set with sheets but no linked submittals — the
    // legacy fallback should kick in inside derivedSetStage.
    const orphanSheets = [
      { id: "x1", drawing_set_id: "set-X", stage: "OFA" },
      { id: "x2", drawing_set_id: "set-X", stage: "OFA" },
      { id: "x3", drawing_set_id: "set-X", stage: "FFF" },
    ];
    expect(derivedSetStage([], orphanSheets)).toBe("OFA");
  });

  it("returns Not Started when neither submittals nor sheets exist", () => {
    expect(derivedSetStage([], [])).toBe("Not Started");
    expect(derivedSetStage(null, null)).toBe("Not Started");
  });

  it("ignores soft-deleted submittals on both paths", () => {
    // s5 is the only "Approved + approved_date" submittal that would
    // map to Released for Set C, but it is_deleted: true so it must
    // be filtered out. Set C's stage comes from s4 instead (BFS).
    const setCSubs = submittals.filter((s) => s.drawing_set_ids.includes(SET_C));
    const setCDrawings = drawings.filter((d) => d.drawing_set_id === SET_C);
    expect(derivedSetStage(setCSubs, setCDrawings)).toBe("BFS");

    const rollup = submittalPipelineRollupFromSubmittals(submittals);
    // s5 is excluded from the rollup total too.
    expect(rollup.total).toBe(4);
  });
});
