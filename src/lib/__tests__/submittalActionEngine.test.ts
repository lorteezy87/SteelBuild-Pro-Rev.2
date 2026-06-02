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

  it("Revise and Resubmit (→ IFA) frames the move as a resubmit", () => {
    const a = nextSubmittalAction({ status: "Revise and Resubmit", ball_in_court: "Detailer" });
    expect(a.currentStage).toBe("IFA");
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
