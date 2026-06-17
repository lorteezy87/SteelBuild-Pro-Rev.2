import { describe, it, expect } from "vitest";
import {
  UNRESOLVED_RESPONSE_STATUSES,
  collectOpenItems,
  pickCarryForwardResponses,
  formatCarryForwardNotes,
  buildResponseMatrix,
} from "@/lib/submittalResubmittal";

describe("submittalResubmittal — collectOpenItems", () => {
  it("keeps only dispositions that require another round", () => {
    const items = collectOpenItems([
      { sheet_number: "S1.1", response_status: "No Exception", reviewer_comment: "ok" },
      { sheet_number: "S2.1", response_status: "Approved as Noted", reviewer_comment: "minor" },
      { sheet_number: "S3.1", response_status: "Revise and Resubmit", reviewer_comment: "fix bolts" },
      { sheet_number: "S4.1", response_status: "Rejected", reviewer_comment: "wrong grade" },
      { sheet_number: "S5.1", response_status: "See Comments", reviewer_comment: "see markup" },
    ]);
    expect(items.map((i) => i.sheet_number)).toEqual(["S3.1", "S4.1", "S5.1"]);
  });

  it("normalizes blank sheet numbers and comments, preserves order", () => {
    const items = collectOpenItems([
      { sheet_number: "  ", response_status: "Rejected", reviewer_comment: "  trim me " },
      { drawing_id: "d1", response_status: "Revise and Resubmit" },
    ]);
    expect(items).toEqual([
      { drawing_id: null, sheet_number: "—", response_status: "Rejected", reviewer_comment: "trim me" },
      { drawing_id: "d1", sheet_number: "—", response_status: "Revise and Resubmit", reviewer_comment: "" },
    ]);
  });

  it("is safe on null / non-array input", () => {
    expect(collectOpenItems(null)).toEqual([]);
    expect(collectOpenItems(undefined)).toEqual([]);
    // @ts-expect-error — defensive against bad runtime input
    expect(collectOpenItems("nope")).toEqual([]);
  });

  it("treats clear-to-fab statuses as resolved (not in the unresolved set)", () => {
    expect(UNRESOLVED_RESPONSE_STATUSES.has("No Exception")).toBe(false);
    expect(UNRESOLVED_RESPONSE_STATUSES.has("Approved as Noted")).toBe(false);
    expect(UNRESOLVED_RESPONSE_STATUSES.has("Revise and Resubmit")).toBe(true);
  });
});

describe("submittalResubmittal — pickCarryForwardResponses", () => {
  const rounds = [
    { id: "r1", round_number: 1 },
    { id: "r2", round_number: 2 },
    { id: "r3", round_number: 3 }, // bare status-event round, no responses
  ];
  const responses = [
    { submittal_round_id: "r1", sheet_number: "S1", response_status: "Revise and Resubmit" },
    { submittal_round_id: "r2", sheet_number: "S1", response_status: "Rejected" },
    { submittal_round_id: "r2", sheet_number: "S2", response_status: "No Exception" },
  ];

  it("returns the latest round that actually has sheet responses (skips bare event rounds)", () => {
    const picked = pickCarryForwardResponses(rounds, responses);
    expect(picked.round?.id).toBe("r2");
    expect(picked.responses).toHaveLength(2);
  });

  it("returns an empty result when no round has responses", () => {
    const picked = pickCarryForwardResponses(rounds, []);
    expect(picked.round).toBeNull();
    expect(picked.responses).toEqual([]);
  });

  it("is safe on null input", () => {
    expect(pickCarryForwardResponses(null, null)).toEqual({ round: null, responses: [] });
  });
});

describe("submittalResubmittal — formatCarryForwardNotes", () => {
  it("builds a round-referenced checklist of open items", () => {
    const open = collectOpenItems([
      { sheet_number: "S3.1", response_status: "Revise and Resubmit", reviewer_comment: "fix bolts" },
      { sheet_number: "S4.1", response_status: "Rejected", reviewer_comment: "wrong grade" },
    ]);
    const notes = formatCarryForwardNotes(2, open);
    expect(notes).toBe(
      [
        "Resubmittal addressing 2 reviewer comments from Round 2:",
        "• Sheet S3.1 (Revise and Resubmit) — fix bolts",
        "• Sheet S4.1 (Rejected) — wrong grade",
      ].join("\n"),
    );
  });

  it("uses singular 'comment' for one item and omits the round when unknown", () => {
    const open = collectOpenItems([
      { sheet_number: "S1", response_status: "See Comments", reviewer_comment: "" },
    ]);
    const notes = formatCarryForwardNotes(null, open);
    expect(notes).toBe("Resubmittal addressing 1 reviewer comment:\n• Sheet S1 (See Comments)");
  });

  it("returns empty string when there is nothing to carry forward", () => {
    expect(formatCarryForwardNotes(3, [])).toBe("");
    expect(formatCarryForwardNotes(3, null)).toBe("");
  });
});

describe("submittalResubmittal — buildResponseMatrix", () => {
  const rounds = [
    { id: "r1", round_number: 1 },
    { id: "r2", round_number: 2 },
    { id: "r3", round_number: 3 }, // bare event round — no responses, no column
  ];
  const responses = [
    { submittal_round_id: "r1", drawing_id: "dA", sheet_number: "S1.1", response_status: "Revise and Resubmit", reviewer_comment: "fix" },
    { submittal_round_id: "r1", drawing_id: "dB", sheet_number: "S2.1", response_status: "Rejected", reviewer_comment: "no" },
    { submittal_round_id: "r2", drawing_id: "dA", sheet_number: "S1.1", response_status: "No Exception", reviewer_comment: "" },
    // dB not re-reviewed in r2 → sparse cell
  ];

  it("builds columns only from rounds that have responses, ascending", () => {
    const m = buildResponseMatrix({ rounds, responses });
    expect(m.columns.map((c) => c.id)).toEqual(["r1", "r2"]);
    expect(m.columns.map((c) => c.round_number)).toEqual([1, 2]);
  });

  it("pivots responses into sheet rows with sparse per-round cells", () => {
    const m = buildResponseMatrix({ rounds, responses });
    const s1 = m.rows.find((r) => r.sheet_number === "S1.1");
    const s2 = m.rows.find((r) => r.sheet_number === "S2.1");
    expect(s1?.cells.r1.response_status).toBe("Revise and Resubmit");
    expect(s1?.cells.r2.response_status).toBe("No Exception");
    expect(s2?.cells.r1.response_status).toBe("Rejected");
    expect(s2?.cells.r2).toBeUndefined(); // not re-reviewed in round 2
  });

  it("sorts sheet rows naturally by sheet number", () => {
    const m = buildResponseMatrix({
      rounds: [{ id: "r1", round_number: 1 }],
      responses: [
        { submittal_round_id: "r1", sheet_number: "S10", response_status: "Rejected" },
        { submittal_round_id: "r1", sheet_number: "S2", response_status: "Rejected" },
      ],
    });
    expect(m.rows.map((r) => r.sheet_number)).toEqual(["S2", "S10"]);
  });

  it("fills a blank sheet number / title from the linked drawing", () => {
    const m = buildResponseMatrix({
      rounds: [{ id: "r1", round_number: 1 }],
      responses: [{ submittal_round_id: "r1", drawing_id: "dA", response_status: "Rejected" }],
      drawings: [{ id: "dA", sheet_number: "E1.0", title: "Embeds" }],
    });
    expect(m.rows[0].sheet_number).toBe("E1.0");
    expect(m.rows[0].title).toBe("Embeds");
  });

  it("is safe on empty input", () => {
    expect(buildResponseMatrix({})).toEqual({ columns: [], rows: [] });
    expect(buildResponseMatrix({ rounds: null, responses: null })).toEqual({ columns: [], rows: [] });
  });
});
