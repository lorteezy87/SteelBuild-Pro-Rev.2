import { describe, expect, it } from "vitest";
import {
  buildNewRoundCarrySeed,
  buildStatusChangeWrite,
  buildVerbCtaAdvanceInput,
  STATUS_CHANGE_VERDICTS,
} from "../submittalAdvanceHelpers";

const baseSubmittal = {
  id: "s1",
  project_id: "p1",
  status: "Under Review",
  ball_in_court: "EOR",
  approved_date: null,
  submitted_date: "2026-07-01",
  required_date: null,
  revision: "0",
};

describe("STATUS_CHANGE_VERDICTS", () => {
  it("covers the five cycle-closing dispositions", () => {
    expect(STATUS_CHANGE_VERDICTS).toEqual([
      "Approved",
      "Approved as Noted",
      "Revise and Resubmit",
      "Rejected",
      "Released for Fabrication",
    ]);
  });
});

describe("buildStatusChangeWrite", () => {
  it("returns noop when status is unchanged", () => {
    expect(
      buildStatusChangeWrite({
        selected: baseSubmittal,
        status: "Under Review",
        today: "2026-07-10",
        revisionAutoBump: false,
        workdayDuesEnabled: false,
        projectMeta: null,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("advances on a verdict with returned_date stamped", () => {
    const write = buildStatusChangeWrite({
      selected: baseSubmittal,
      status: "Approved as Noted",
      today: "2026-07-10",
      revisionAutoBump: false,
      workdayDuesEnabled: false,
      projectMeta: null,
    });
    expect(write.kind).toBe("advance");
    if (write.kind !== "advance") return;
    expect(write.input.status).toBe("Approved as Noted");
    expect(write.input.returned_date).toBe("2026-07-10");
    expect(write.input.submitted_date).toBe("2026-07-01");
    expect(write.input.bumpTextRevision).toBe(false);
  });

  it("advances on a send with submitted_date and optional revision bump", () => {
    const write = buildStatusChangeWrite({
      selected: { ...baseSubmittal, status: "Revise and Resubmit" },
      status: "Submitted",
      today: "2026-07-11",
      revisionAutoBump: true,
      workdayDuesEnabled: false,
      projectMeta: null,
    });
    expect(write.kind).toBe("advance");
    if (write.kind !== "advance") return;
    expect(write.input.submitted_date).toBe("2026-07-11");
    expect(write.input.bumpTextRevision).toBe(true);
    expect(write.input.returned_date).toBeUndefined();
  });

  it("plain-updates Void and clears ball_in_court", () => {
    const write = buildStatusChangeWrite({
      selected: baseSubmittal,
      status: "Void",
      today: "2026-07-10",
      revisionAutoBump: false,
      workdayDuesEnabled: false,
      projectMeta: null,
    });
    expect(write).toEqual({
      kind: "update",
      patch: { id: "s1", status: "Void", ball_in_court: null },
    });
  });

  it("stamps working-day due on outbound when flag on and date empty", () => {
    const write = buildStatusChangeWrite({
      selected: { ...baseSubmittal, status: "Draft", ball_in_court: "EOR", submitted_date: null },
      status: "Submitted",
      today: "2026-07-10", // Friday
      revisionAutoBump: false,
      workdayDuesEnabled: true,
      projectMeta: { detailing_lead_days: { approval: 2 } },
    });
    expect(write.kind).toBe("advance");
    if (write.kind !== "advance") return;
    expect(write.input.extraPatch).toEqual({ required_date: "2026-07-14" });
  });
});

describe("buildVerbCtaAdvanceInput", () => {
  it("returns null without nextStatus", () => {
    expect(
      buildVerbCtaAdvanceInput({
        selected: baseSubmittal,
        action: { nextStage: "OFA" },
        today: "2026-07-10",
        revisionAutoBump: false,
        workdayDuesEnabled: false,
        projectMeta: null,
        commentDispositions: [],
      }),
    ).toBeNull();
  });

  it("stamps submitted_date on first OFA hop and merges chain step", () => {
    const input = buildVerbCtaAdvanceInput({
      selected: { ...baseSubmittal, status: "Draft", submitted_date: null },
      action: {
        nextStatus: "Submitted",
        nextBallInCourt: "EOR",
        nextStage: "OFA",
        chainStepIndex: 1,
      },
      today: "2026-07-10",
      revisionAutoBump: false,
      workdayDuesEnabled: false,
      projectMeta: null,
      commentDispositions: [{ id: "c1", submittal_id: "s1", status: "Unreviewed" }],
    });
    expect(input).toMatchObject({
      status: "Submitted",
      ball_in_court: "EOR",
      submitted_date: "2026-07-10",
      returned_date: undefined,
      bumpTextRevision: false,
      nextStage: "OFA",
      extraPatch: { approval_chain_step: 1 },
    });
    expect(input?.commentDispositions).toHaveLength(1);
  });

  it("bumps revision on resubmit OFA when flag on", () => {
    const input = buildVerbCtaAdvanceInput({
      selected: { ...baseSubmittal, status: "Revise and Resubmit", submitted_date: "2026-06-01" },
      action: { nextStatus: "Submitted", nextBallInCourt: "EOR", nextStage: "OFA" },
      today: "2026-07-12",
      revisionAutoBump: true,
      workdayDuesEnabled: false,
      projectMeta: null,
      commentDispositions: [],
    });
    expect(input?.bumpTextRevision).toBe(true);
    expect(input?.submitted_date).toBe("2026-07-12");
  });

  it("stamps returned_date on BFA and does not re-stamp submitted_date", () => {
    const input = buildVerbCtaAdvanceInput({
      selected: baseSubmittal,
      action: {
        nextStatus: "Approved as Noted",
        nextBallInCourt: "Detailer",
        nextStage: "BFA",
      },
      today: "2026-07-15",
      revisionAutoBump: true,
      workdayDuesEnabled: false,
      projectMeta: null,
      commentDispositions: [],
    });
    expect(input?.returned_date).toBe("2026-07-15");
    expect(input?.submitted_date).toBeUndefined();
    expect(input?.bumpTextRevision).toBe(false);
  });
});

describe("buildNewRoundCarrySeed", () => {
  it("seeds notes from unresolved sheet responses and required comments", () => {
    const seed = buildNewRoundCarrySeed({
      submittalId: "s1",
      submittalRounds: [
        { id: "r1", round_number: 1 },
        { id: "r2", round_number: 2 },
      ],
      allSheetResponses: [
        {
          submittal_round_id: "r1",
          sheet_number: "S-01",
          response_status: "Revise and Resubmit",
          reviewer_comment: "Fix weld",
        },
      ],
      allCommentDispositions: [
        {
          submittal_id: "s1",
          comment_number: "C1",
          comment_text: "Anchor detail",
          is_required: true,
          status: "Unreviewed",
        },
        {
          submittal_id: "other",
          comment_number: "C9",
          is_required: true,
          status: "Unreviewed",
        },
      ],
    });
    expect(seed.previousRound).toEqual({ id: "r2", round_number: 2 });
    expect(seed.carryFromRound).toBe(1);
    expect(seed.carryItems).toHaveLength(1);
    expect(seed.seededNotes).toContain("Round 1");
    expect(seed.seededNotes).toContain("Fix weld");
    expect(seed.seededNotes).toContain("C1");
    expect(seed.seededNotes).not.toContain("C9");
  });

  it("returns empty seed when nothing to carry", () => {
    const seed = buildNewRoundCarrySeed({
      submittalId: "s1",
      submittalRounds: [],
      allSheetResponses: [],
      allCommentDispositions: [],
    });
    expect(seed).toEqual({
      previousRound: null,
      carryItems: [],
      carryFromRound: null,
      seededNotes: "",
    });
  });
});
