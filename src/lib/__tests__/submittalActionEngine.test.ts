import { describe, expect, it } from "vitest";
import { nextSubmittalAction } from "../submittalActionEngine";

// Pro derives stage from (status, ball_in_court). These cases pin the verb
// engine to the canonical flow Not Started → IFA → OFA → BFA → OFS → IFC →
// Released, mirroring the standalone Submittals app's stageTransition coverage
// but over Pro's status×BIC matrix.

describe("nextSubmittalAction", () => {
  it("Draft (→ IFA) suggests Send for Approval (OFA)", () => {
    const a = nextSubmittalAction({ status: "Draft", ball_in_court: "Detailer" });
    expect(a.currentStage).toBe("IFA");
    expect(a.label).toBe("Send for Approval (OFA)");
    expect(a.nextStage).toBe("OFA");
    expect(a.nextStatus).toBe("Submitted");
    expect(a.nextBallInCourt).toBe("EOR");
    expect(a.disabled).toBe(false);
  });

  it("Submitted to EOR (→ OFA) suggests Log Return (BFA)", () => {
    const a = nextSubmittalAction({ status: "Submitted", ball_in_court: "EOR" });
    expect(a.currentStage).toBe("OFA");
    expect(a.label).toBe("Log Return (BFA)");
    expect(a.nextStage).toBe("BFA");
    expect(a.nextStatus).toBe("Approved as Noted");
  });

  it("Submitted to Detailer (→ IFA) is still internal prep → OFA", () => {
    const a = nextSubmittalAction({ status: "Submitted", ball_in_court: "Detailer" });
    expect(a.currentStage).toBe("IFA");
    expect(a.nextStage).toBe("OFA");
  });

  it("Approved as Noted at EOR (→ BFA) routes to detailer scrub (OFS)", () => {
    const a = nextSubmittalAction({ status: "Approved as Noted", ball_in_court: "EOR" });
    expect(a.currentStage).toBe("BFA");
    expect(a.label).toBe("Send for Scrub (OFS)");
    expect(a.nextStage).toBe("OFS");
    expect(a.nextBallInCourt).toBe("Detailer");
  });

  it("Approved at EOR (→ BFA) skips scrub → Issue for Construction (IFC)", () => {
    const a = nextSubmittalAction({ status: "Approved", ball_in_court: "EOR" });
    expect(a.currentStage).toBe("BFA");
    expect(a.label).toBe("Issue for Construction (IFC)");
    expect(a.nextStage).toBe("IFC");
  });

  it("Approved as Noted at Detailer (→ OFS) suggests Issue for Construction (IFC)", () => {
    const a = nextSubmittalAction({ status: "Approved as Noted", ball_in_court: "Detailer" });
    expect(a.currentStage).toBe("OFS");
    expect(a.label).toBe("Issue for Construction (IFC)");
    expect(a.nextStage).toBe("IFC");
  });

  it("Approved at GC (→ IFC) suggests Release for Fabrication", () => {
    const a = nextSubmittalAction({ status: "Approved", ball_in_court: "GC" });
    expect(a.currentStage).toBe("IFC");
    expect(a.label).toBe("Release for Fabrication");
    expect(a.nextStage).toBe("Released");
    expect(a.nextStatus).toBe("Released for Fabrication");
  });

  it("Revise and Resubmit (→ R&R first-class stage) frames the move as a resubmit", () => {
    const a = nextSubmittalAction({ status: "Revise and Resubmit", ball_in_court: "Detailer" });
    expect(a.currentStage).toBe("R&R");
    expect(a.label).toBe("Resubmit for Approval (OFA)");
    expect(a.nextStage).toBe("OFA");
  });

  it("Rejected behaves like R&R (loop back to resubmit)", () => {
    const a = nextSubmittalAction({ status: "Rejected", ball_in_court: "Detailer" });
    expect(a.label).toBe("Resubmit for Approval (OFA)");
    expect(a.nextStage).toBe("OFA");
  });

  it("Released for Fabrication is terminal — disabled, no next move", () => {
    const a = nextSubmittalAction({ status: "Released for Fabrication", ball_in_court: null });
    expect(a.disabled).toBe(true);
    expect(a.isTerminal).toBe(true);
    expect(a.nextStatus).toBeNull();
  });

  it("Void is terminal — disabled", () => {
    const a = nextSubmittalAction({ status: "Void" });
    expect(a.disabled).toBe(true);
    expect(a.isTerminal).toBe(true);
    expect(a.label).toBe("Voided");
  });

  it("null / undefined submittal defaults to a Draft-style first move", () => {
    const a = nextSubmittalAction(undefined);
    expect(a.disabled).toBe(false);
    expect(a.nextStage).toBe("OFA");
  });

  it("a full happy-path chain advances Draft → … → Released", () => {
    let s: { status: string | null; ball_in_court: string | null } = { status: "Draft", ball_in_court: "Detailer" };
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a = nextSubmittalAction(s);
      seen.push(a.currentStage);
      if (a.disabled || !a.nextStatus) break;
      s = { status: a.nextStatus, ball_in_court: a.nextBallInCourt };
    }
    // Should touch the key stages and terminate at Released.
    expect(seen).toContain("OFA");
    expect(seen).toContain("BFA");
    expect(seen).toContain("IFC");
    expect(seen[seen.length - 1]).toBe("Released");
  });
});

// ── Flag-gated routing: submittal_approved_to_scrub ────────────────────────
// When `approvedRoutesToScrub` is on, a BFA "Approved" flows through the
// detailer scrub (OFS) exactly like "Approved as Noted", instead of skipping
// straight to IFC. Flag-off (default / absent) behavior is asserted unchanged
// in the primary describe block above.

describe("nextSubmittalAction with approvedRoutesToScrub", () => {
  it("Approved at EOR (→ BFA) routes to scrub (OFS) like AAN when flag on", () => {
    const a = nextSubmittalAction(
      { status: "Approved", ball_in_court: "EOR" },
      { approvedRoutesToScrub: true },
    );
    expect(a.currentStage).toBe("BFA");
    expect(a.label).toBe("Send for Scrub (OFS)");
    expect(a.nextStage).toBe("OFS");
    expect(a.nextBallInCourt).toBe("Detailer");
  });

  it("flag-on Approved matches the flag-off AAN branch exactly (label + routing)", () => {
    const approvedOn = nextSubmittalAction(
      { status: "Approved", ball_in_court: "EOR" },
      { approvedRoutesToScrub: true },
    );
    const aanOff = nextSubmittalAction({ status: "Approved as Noted", ball_in_court: "EOR" });
    expect(approvedOn.label).toBe(aanOff.label);
    expect(approvedOn.nextStage).toBe(aanOff.nextStage);
    expect(approvedOn.nextStatus).toBe(aanOff.nextStatus);
    expect(approvedOn.nextBallInCourt).toBe(aanOff.nextBallInCourt);
  });

  it("flag-off (explicit false) keeps the legacy Approved → IFC skip", () => {
    const a = nextSubmittalAction(
      { status: "Approved", ball_in_court: "EOR" },
      { approvedRoutesToScrub: false },
    );
    expect(a.label).toBe("Issue for Construction (IFC)");
    expect(a.nextStage).toBe("IFC");
  });

  it("empty opts object is identical to the no-opts default (Approved → IFC)", () => {
    const withOpts = nextSubmittalAction({ status: "Approved", ball_in_court: "EOR" }, {});
    const noOpts = nextSubmittalAction({ status: "Approved", ball_in_court: "EOR" });
    expect(withOpts.nextStage).toBe("IFC");
    expect(withOpts.label).toBe(noOpts.label);
    expect(withOpts.nextStage).toBe(noOpts.nextStage);
  });

  it("flag-on happy path chains Approved → OFS → IFC → Released", () => {
    let s: { status: string | null; ball_in_court: string | null } = {
      status: "Approved",
      ball_in_court: "EOR",
    };
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a = nextSubmittalAction(s, { approvedRoutesToScrub: true });
      seen.push(a.currentStage);
      if (a.disabled || !a.nextStatus) break;
      s = { status: a.nextStatus, ball_in_court: a.nextBallInCourt };
    }
    expect(seen).toContain("BFA");
    expect(seen).toContain("OFS");
    expect(seen).toContain("IFC");
    expect(seen[seen.length - 1]).toBe("Released");
  });

  it("flag-on does not disturb non-Approved dispositions (AAN still → OFS)", () => {
    const a = nextSubmittalAction(
      { status: "Approved as Noted", ball_in_court: "EOR" },
      { approvedRoutesToScrub: true },
    );
    expect(a.label).toBe("Send for Scrub (OFS)");
    expect(a.nextStage).toBe("OFS");
  });
});

// ── Custom approval chains (approvalChains.js) ─────────────────────────────

describe("nextSubmittalAction with a custom approval chain", () => {
  const CHAIN = [
    { party: "Detailer" },
    { party: "GC" },
    { party: "Architect" },
    { party: "EOR" },
  ];

  it("routes Draft at step 0 to the second party, bumping the step", () => {
    const a = nextSubmittalAction({
      status: "Draft", ball_in_court: "Detailer",
      approval_chain: CHAIN, approval_chain_step: 0,
    });
    expect(a.label).toBe("Route to GC (2/4)");
    expect(a.nextStatus).toBe("Submitted");
    expect(a.nextBallInCourt).toBe("GC");
    expect(a.nextStage).toBe("OFA");
    expect(a.chainStepIndex).toBe(1);
  });

  it("routes a mid-chain Submitted hop to the next party", () => {
    const a = nextSubmittalAction({
      status: "Submitted", ball_in_court: "GC",
      approval_chain: CHAIN, approval_chain_step: 1,
    });
    expect(a.label).toBe("Route to Architect (3/4)");
    expect(a.nextBallInCourt).toBe("Architect");
    expect(a.chainStepIndex).toBe(2);
  });

  it("falls back to the default flow at the final chain step (log return)", () => {
    const a = nextSubmittalAction({
      status: "Submitted", ball_in_court: "EOR",
      approval_chain: CHAIN, approval_chain_step: 3,
    });
    expect(a.label).toBe("Log Return (BFA)");
    expect(a.nextStage).toBe("BFA");
    expect(a.chainStepIndex).toBeUndefined();
  });

  it("R&R with a chain restarts at the first outbound hop", () => {
    const a = nextSubmittalAction({
      status: "Revise and Resubmit", ball_in_court: "Detailer",
      approval_chain: CHAIN, approval_chain_step: 3,
    });
    expect(a.label).toBe("Resubmit & route to GC");
    expect(a.nextStatus).toBe("Submitted");
    expect(a.nextBallInCourt).toBe("GC");
    expect(a.chainStepIndex).toBe(1);
  });

  it("decision statuses ignore the chain (Approved as Noted → scrub)", () => {
    const a = nextSubmittalAction({
      status: "Approved as Noted", ball_in_court: "EOR",
      approval_chain: CHAIN, approval_chain_step: 3,
    });
    expect(a.label).toBe("Send for Scrub (OFS)");
    expect(a.chainStepIndex).toBeUndefined();
  });

  it("a chain without an active step uses the default flow", () => {
    const a = nextSubmittalAction({
      status: "Draft", ball_in_court: "Detailer",
      approval_chain: CHAIN, approval_chain_step: null,
    });
    expect(a.label).toBe("Send for Approval (OFA)");
    expect(a.chainStepIndex).toBeUndefined();
  });

  it("terminal statuses stay terminal even with a chain", () => {
    const a = nextSubmittalAction({
      status: "Released for Fabrication",
      approval_chain: CHAIN, approval_chain_step: 1,
    });
    expect(a.disabled).toBe(true);
    expect(a.isTerminal).toBe(true);
  });
});
