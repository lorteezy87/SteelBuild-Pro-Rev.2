import { describe, it, expect } from "vitest";
import { evaluateRrResubmitGate, RR_SOURCE_STATUSES } from "@/lib/rrResubmitGate";

const BASE = {
  priorStatus: "Revise and Resubmit",
  nextStatus: "Submitted",
  submittedDate: "2026-07-25",
  recipient: "EOR",
  revision: "B",
  priorCycleRevision: "A",
};

describe("RR_SOURCE_STATUSES", () => {
  it("covers exactly the R&R loop-back dispositions", () => {
    expect([...RR_SOURCE_STATUSES].sort()).toEqual(["Rejected", "Revise and Resubmit"]);
  });
});

describe("evaluateRrResubmitGate", () => {
  it("passes a fully-evidenced resubmission", () => {
    expect(evaluateRrResubmitGate(BASE)).toEqual({ ok: true });
  });

  it("does not apply outside an R&R → sent move", () => {
    // Ordinary first submission — no gate.
    expect(evaluateRrResubmitGate({ ...BASE, priorStatus: "Draft" })).toEqual({ ok: true });
    // A verdict move — no gate.
    expect(evaluateRrResubmitGate({ ...BASE, priorStatus: "Under Review", nextStatus: "Approved" })).toEqual({ ok: true });
    // R&R → Void (abandoning the package) — no gate.
    expect(evaluateRrResubmitGate({ ...BASE, nextStatus: "Void" })).toEqual({ ok: true });
  });

  it("blocks a resubmission without an actual submission date", () => {
    for (const submittedDate of [null, undefined, "", "  "]) {
      const r = evaluateRrResubmitGate({ ...BASE, submittedDate });
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.missing).toContain("submission date");
    }
  });

  it("blocks a resubmission without a recipient", () => {
    const r = evaluateRrResubmitGate({ ...BASE, recipient: "" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.missing).toContain("recipient");
  });

  it("blocks when the revision was not advanced past the returned cycle's revision", () => {
    const r = evaluateRrResubmitGate({ ...BASE, revision: "A", priorCycleRevision: "A" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.missing).toContain("next revision");
  });

  it("revision comparison is case/whitespace-insensitive", () => {
    const r = evaluateRrResubmitGate({ ...BASE, revision: " a ", priorCycleRevision: "A" });
    expect(r.ok).toBe(false);
  });

  it("skips the revision check when the returned cycle's revision is unknown", () => {
    // Historical rounds without a metadata stamp: nothing to compare against.
    expect(evaluateRrResubmitGate({ ...BASE, revision: "A", priorCycleRevision: null })).toEqual({ ok: true });
    // No revision tracking at all on this package: not blocked.
    expect(evaluateRrResubmitGate({ ...BASE, revision: null, priorCycleRevision: null })).toEqual({ ok: true });
  });

  it("applies to Rejected loop-backs and Under Review sends too", () => {
    const r = evaluateRrResubmitGate({
      ...BASE,
      priorStatus: "Rejected",
      nextStatus: "Under Review",
      submittedDate: null,
    });
    expect(r.ok).toBe(false);
  });

  it("collects every missing item into one actionable reason", () => {
    const r = evaluateRrResubmitGate({
      ...BASE,
      submittedDate: null,
      recipient: null,
      revision: "A",
      priorCycleRevision: "A",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.missing).toEqual(["submission date", "recipient", "next revision"]);
      expect(r.reason).toMatch(/RR_RESUBMIT_BLOCKED/);
      expect(r.reason).toMatch(/submission date/);
    }
  });
});
