import { describe, expect, it } from "vitest";
import { buildRfiPreflight, RFI_TYPES } from "../rfiPreflight";

const validRFI = {
  rfi_type: "Coordination",
  drawing_reference: "A-2.3",
  question: "Confirm the bolt grade for the moment connection at gridline C.",
  date_required: "2026-06-01",
  cost_impact: true,
};

describe("buildRfiPreflight", () => {
  it("blocks an empty RFI on the four required checks", () => {
    const r = buildRfiPreflight({});
    expect(r.passed).toBe(false);
    expect(r.blockers.map((b) => b.key).sort()).toEqual(
      ["question", "reference", "reply_date", "type"].sort()
    );
    expect(r.score).toBeLessThan(50);
  });

  it("passes a well-formed RFI with no blockers", () => {
    const r = buildRfiPreflight(validRFI);
    expect(r.passed).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.score).toBeGreaterThanOrEqual(75);
  });

  it("accepts work_package_id or drawing_set_id as a valid reference", () => {
    const r = buildRfiPreflight({ ...validRFI, drawing_reference: "", work_package_id: "wp-1" });
    expect(r.checks.find((c) => c.key === "reference")?.pass).toBe(true);
  });

  it("flags a multi-question RFI (soft, non-blocking)", () => {
    const r = buildRfiPreflight({ ...validRFI, question: "What grade? And what coating? And by when?" });
    const single = r.checks.find((c) => c.key === "single_question")!;
    expect(single.pass).toBe(false);
    expect(single.required).toBe(false);
    expect(r.passed).toBe(true); // soft check does not block
  });

  it("flags means-and-methods questions (soft)", () => {
    const r = buildRfiPreflight({ ...validRFI, question: "How should we sequence the erection of the north frame?" });
    expect(r.checks.find((c) => c.key === "not_means_methods")?.pass).toBe(false);
  });

  it("requires a proposed resolution for Substitution and Design Clarification types", () => {
    const sub = buildRfiPreflight({ ...validRFI, rfi_type: "Substitution" });
    expect(sub.blockers.map((b) => b.key)).toContain("proposed");
    expect(sub.passed).toBe(false);

    const withProposed = buildRfiPreflight({ ...validRFI, rfi_type: "Substitution", proposed_solution: "Use A325 in lieu of A490." });
    expect(withProposed.blockers.map((b) => b.key)).not.toContain("proposed");
    expect(withProposed.passed).toBe(true);
  });

  it("does not require a proposed resolution for Coordination", () => {
    const r = buildRfiPreflight(validRFI);
    expect(r.checks.find((c) => c.key === "proposed")?.required).toBe(false);
  });

  it("counts qualitative impact flags (fab/erection/rev/CO), not just cost/schedule", () => {
    // A fabrication-impact flag with no cost/schedule still satisfies the (soft) impact check.
    const fab = buildRfiPreflight({ ...validRFI, cost_impact: false, fab_impact: true });
    expect(fab.checks.find((c) => c.key === "impact")?.pass).toBe(true);
    // A metadata flag (saved-RFI shape) counts too.
    const co = buildRfiPreflight({ ...validRFI, cost_impact: false, metadata: { change_order_likely: true } });
    expect(co.checks.find((c) => c.key === "impact")?.pass).toBe(true);
    // No impact of any kind → the check fails (still soft).
    const none = buildRfiPreflight({ ...validRFI, cost_impact: false });
    expect(none.checks.find((c) => c.key === "impact")?.pass).toBe(false);
  });

  it("exposes the canonical RFI type list", () => {
    expect(RFI_TYPES).toContain("Field Condition");
    expect(RFI_TYPES.length).toBeGreaterThanOrEqual(6);
  });
});
