import { describe, expect, it } from "vitest";
import {
  isSubmittalRestartStatus,
  validateSubmittalTransition,
} from "@/lib/submittalTransitions";

describe("validateSubmittalTransition", () => {
  it("allows same-status no-ops", () => {
    expect(validateSubmittalTransition("Approved", "Approved")).toEqual({ ok: true });
  });

  it("allows the canonical approval → fab-release path", () => {
    expect(validateSubmittalTransition("Approved", "Released for Fabrication").ok).toBe(true);
    expect(validateSubmittalTransition("Approved as Noted", "Released for Fabrication").ok).toBe(true);
  });

  it("allows R&R / Rejected to restart into Submitted / Under Review", () => {
    expect(validateSubmittalTransition("Revise and Resubmit", "Submitted").ok).toBe(true);
    expect(validateSubmittalTransition("Rejected", "Under Review").ok).toBe(true);
  });

  it("blocks R&R → Draft (a failed cycle must stay visible until resubmitted)", () => {
    expect(validateSubmittalTransition("Revise and Resubmit", "Draft")).toMatchObject({ ok: false });
    // Rejected keeps the Draft reopen path (pending a formal reopen workflow).
    expect(validateSubmittalTransition("Rejected", "Draft").ok).toBe(true);
  });

  it("blocks skipped / illegal jumps", () => {
    expect(validateSubmittalTransition("Draft", "Released for Fabrication")).toMatchObject({
      ok: false,
    });
    expect(validateSubmittalTransition("Submitted", "Released for Fabrication")).toMatchObject({
      ok: false,
    });
    expect(validateSubmittalTransition("Released for Fabrication", "Approved")).toMatchObject({
      ok: false,
    });
    expect(validateSubmittalTransition("Void", "Draft")).toMatchObject({ ok: false });
  });

  it("rejects unknown target statuses", () => {
    expect(validateSubmittalTransition("Draft", "Mystery")).toMatchObject({ ok: false });
  });

  it("allows recovery from legacy/unknown source statuses", () => {
    expect(validateSubmittalTransition("Legacy Pending", "Under Review").ok).toBe(true);
  });
});

describe("isSubmittalRestartStatus", () => {
  it("flags revise-and-resubmit and rejected", () => {
    expect(isSubmittalRestartStatus("Revise and Resubmit")).toBe(true);
    expect(isSubmittalRestartStatus("Rejected")).toBe(true);
    expect(isSubmittalRestartStatus("Approved")).toBe(false);
  });
});
