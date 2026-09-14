import { describe, it, expect } from "vitest";
import {
  buildApprovalCycles,
  roundRevision,
  VERDICT_STATUSES,
} from "@/lib/submittalCycles";

// ── Fixtures ────────────────────────────────────────────────────────
// A realistic two-cycle history: Rev A went out, came back R&R; Rev B
// went out and came back Approved as Noted (→ OFS).

const CYCLE_1_RR = {
  id: "r1",
  round_number: 1,
  status: "Revise and Resubmit",
  ball_in_court: "Detailer",
  submitted_date: "2026-06-01",
  returned_date: "2026-06-12",
  response_notes: "Rework moment connections per EOR markups.",
  metadata: { revision: "A" },
};

const CYCLE_2_AAN = {
  id: "r2",
  round_number: 2,
  status: "Approved as Noted",
  ball_in_court: "Detailer",
  submitted_date: "2026-06-15",
  returned_date: "2026-06-25",
  response_notes: "",
  metadata: { revision: "B" },
};

describe("VERDICT_STATUSES", () => {
  it("contains exactly the cycle-closing dispositions", () => {
    expect([...VERDICT_STATUSES].sort()).toEqual([
      "Approved",
      "Approved as Noted",
      "Rejected",
      "Released for Fabrication",
      "Revise and Resubmit",
    ]);
  });
});

describe("roundRevision", () => {
  it("reads the revision stamped in round metadata", () => {
    expect(roundRevision(CYCLE_1_RR)).toBe("A");
    expect(roundRevision({ metadata: { revision: " Rev 2 " } })).toBe("Rev 2");
  });
  it("returns null when unstamped / malformed", () => {
    expect(roundRevision({ metadata: {} })).toBeNull();
    expect(roundRevision({ metadata: null })).toBeNull();
    expect(roundRevision({})).toBeNull();
    expect(roundRevision(null)).toBeNull();
    expect(roundRevision({ metadata: { revision: "" } })).toBeNull();
    expect(roundRevision({ metadata: { revision: 42 } })).toBeNull();
  });
});

describe("buildApprovalCycles", () => {
  it("keeps every cycle visible — a return never overwrites the prior cycle", () => {
    const cycles = buildApprovalCycles([CYCLE_1_RR, CYCLE_2_AAN]);
    expect(cycles).toHaveLength(2);

    expect(cycles[0]).toMatchObject({
      cycleNumber: 1,
      revision: "A",
      submittedDate: "2026-06-01",
      returnedDate: "2026-06-12",
      disposition: "Revise and Resubmit",
      resultingStage: "R&R",
      isOpen: false,
      isCurrent: false,
    });
    expect(cycles[1]).toMatchObject({
      cycleNumber: 2,
      revision: "B",
      disposition: "Approved as Noted",
      resultingStage: "OFS", // AAN + Detailer BIC → scrub
      isOpen: false,
      isCurrent: true,
    });
  });

  it("supports multiple consecutive R&R cycles", () => {
    const rr2 = { ...CYCLE_2_AAN, id: "r2b", status: "Revise and Resubmit", metadata: { revision: "B" } };
    const open3 = {
      id: "r3",
      round_number: 3,
      status: "Submitted",
      ball_in_court: "EOR",
      submitted_date: "2026-07-01",
      returned_date: null as string | null,
      metadata: { revision: "C" },
    };
    const cycles = buildApprovalCycles([CYCLE_1_RR, rr2, open3]);
    expect(cycles.map((c) => c.disposition)).toEqual([
      "Revise and Resubmit",
      "Revise and Resubmit",
      null, // still out — no verdict yet
    ]);
    expect(cycles.map((c) => c.revision)).toEqual(["A", "B", "C"]);
    expect(cycles[2]).toMatchObject({ isOpen: true, resultingStage: "OFA" });
  });

  it("an open cycle has no disposition and derives its in-flight stage", () => {
    const open = {
      id: "r1", round_number: 1, status: "Under Review", ball_in_court: "EOR",
      submitted_date: "2026-06-01", returned_date: null as string | null, metadata: {},
    };
    const [cycle] = buildApprovalCycles([open]);
    expect(cycle.disposition).toBeNull();
    expect(cycle.isOpen).toBe(true);
    expect(cycle.resultingStage).toBe("OFA");
  });

  it("falls back to the submittal's revision for the CURRENT unstamped cycle only", () => {
    const r1 = { ...CYCLE_1_RR, metadata: {} };
    const r2 = { ...CYCLE_2_AAN, metadata: {} };
    const cycles = buildApprovalCycles([r1, r2], { revision: "B" });
    // Historical cycle without a stamp: unknown, not invented.
    expect(cycles[0].revision).toBeNull();
    // Current cycle: the submittal's live revision is authoritative.
    expect(cycles[1].revision).toBe("B");
  });

  it("sorts by round_number even when input is out of order, and drops empty rows", () => {
    const cycles = buildApprovalCycles([CYCLE_2_AAN, null as never, CYCLE_1_RR]);
    expect(cycles.map((c) => c.cycleNumber)).toEqual([1, 2]);
  });

  it("returns [] for empty / non-array input", () => {
    expect(buildApprovalCycles([])).toEqual([]);
    expect(buildApprovalCycles(null)).toEqual([]);
    expect(buildApprovalCycles(undefined)).toEqual([]);
  });

  it("maps every verdict to its resulting workflow stage", () => {
    const mk = (status: string, bic: string | null, n: number) => ({
      id: `r${n}`, round_number: n, status, ball_in_court: bic,
      submitted_date: "2026-06-01", returned_date: "2026-06-05", metadata: {},
    });
    const cycles = buildApprovalCycles([
      mk("Revise and Resubmit", "Detailer", 1),
      mk("Rejected", "EOR", 2),
      mk("Approved", "GC", 3),
      mk("Released for Fabrication", null, 4),
    ]);
    expect(cycles.map((c) => c.resultingStage)).toEqual(["R&R", "R&R", "IFC", "Released"]);
  });
});
