import { describe, it, expect } from "vitest";
import { computeDetailingReadiness, computeSequenceReadiness } from "@/lib/detailingReadiness";

const SUB_RELEASED = { status: "Released for Fabrication" }; // → Released

describe("computeDetailingReadiness", () => {
  it("a fresh package with no submittal is Not Started and not fab/erection ready", () => {
    const r = computeDetailingReadiness({ pkg: {}, submittals: [], sheets: [{ stage: "Not Started" }] });
    expect(r.effectiveState).toBe("Not Started");
    expect(r.fabricationReady).toBe(false);
    expect(r.erectionReady).toBe(false);
    expect(r.rfiBlocked).toBe(false);
  });

  it("a released package with no blockers is fabrication-ready", () => {
    const r = computeDetailingReadiness({ pkg: {}, submittals: [SUB_RELEASED], sheets: [] });
    expect(r.effectiveState).toBe("Released");
    expect(r.fabricationReady).toBe(true);
    expect(r.erectionReady).toBe(false); // not yet released for erection
  });

  it("an open linked RFI blocks fabrication readiness", () => {
    const pkg = { linked_rfi_ids: ["rfi-1"] };
    const open = new Set(["rfi-1"]);
    const r = computeDetailingReadiness({ pkg, submittals: [SUB_RELEASED], sheets: [], openRfiIds: open });
    expect(r.rfiBlocked).toBe(true);
    expect(r.fabricationReady).toBe(false);
  });

  it("a linked RFI that is NOT open does not block", () => {
    const pkg = { linked_rfi_ids: ["rfi-1"] };
    const r = computeDetailingReadiness({ pkg, submittals: [SUB_RELEASED], sheets: [], openRfiIds: new Set(["rfi-99"]) });
    expect(r.rfiBlocked).toBe(false);
    expect(r.fabricationReady).toBe(true);
  });

  it("a partial supersede flags revisionImpacted (and blocks fab readiness)", () => {
    const r = computeDetailingReadiness({
      pkg: {}, submittals: [SUB_RELEASED],
      sheets: [{ is_superseded: true }, { is_superseded: false }],
    });
    expect(r.revisionImpacted).toBe(true);
    expect(r.fullySuperseded).toBe(false);
    expect(r.fabricationReady).toBe(false);
  });

  it("surfaces the manual flags + priority sequence + backward dates from the WP", () => {
    const r = computeDetailingReadiness({
      pkg: { material_impacted: true, long_lead_impact: true },
      submittals: [],
      sheets: [],
      workPackage: { scheduled_start_date: "2026-06-10", sequence_number: "SEQ-1" },
      today: "2026-01-01",
    });
    expect(r.materialImpacted).toBe(true);
    expect(r.longLeadImpact).toBe(true);
    expect(r.prioritySequence).toBe(true);
    expect(r.sequenceNumber).toBe("SEQ-1");
    expect(r.backwardDates.detailingStart).toBe("2026-04-28"); // worked example
    expect(r.scheduleRisk.atRisk).toBe(false); // today (Jan) is well before any milestone
  });

  it("derives sequenceNumber from drawing_sets.area_sequence when there is no work package", () => {
    const r = computeDetailingReadiness({
      pkg: { area_sequence: "A-3" },
      submittals: [],
      sheets: [],
    });
    expect(r.sequenceNumber).toBe("A-3");
    expect(r.area).toBe("A-3");
    expect(r.prioritySequence).toBe(true);
  });

  it("flags schedule risk when milestones are overdue and the package is behind", () => {
    const r = computeDetailingReadiness({
      pkg: {}, submittals: [], sheets: [{ stage: "Not Started" }],
      workPackage: { scheduled_start_date: "2026-06-10" },
      today: "2026-06-01", // past detailing start, submit, approval, fab release milestones
    });
    expect(r.scheduleRisk.atRisk).toBe(true);
    expect(r.scheduleRisk.severity).toBe("critical");
  });
});

describe("computeSequenceReadiness", () => {
  const entries = [
    { sequenceNumber: "1", effectiveState: "Released for Erection", fabricationReady: true, erectionReady: true, atRisk: false },
    { sequenceNumber: "1", effectiveState: "Not Started", fabricationReady: false, erectionReady: false, atRisk: true },
    { sequenceNumber: "2", effectiveState: "Released", fabricationReady: true, erectionReady: false, atRisk: false },
    { sequenceNumber: null, effectiveState: "IFA", fabricationReady: false, erectionReady: false, atRisk: false },
  ];

  it("groups by sequence, rolls up readiness, and sorts Unsequenced last", () => {
    const rows = computeSequenceReadiness(entries);
    expect(rows.map((r) => r.sequence)).toEqual(["1", "2", "Unsequenced"]);

    const s1 = rows[0];
    expect(s1.packageCount).toBe(2);
    expect(s1.detailingPct).toBe(50);   // (100% + 0%) / 2
    expect(s1.fabReadyCount).toBe(1);
    expect(s1.erectionReadyCount).toBe(1);
    expect(s1.atRiskCount).toBe(1);

    expect(rows[1].detailingPct).toBe(82);   // "Released" = index 9 of 11
    expect(rows[2].detailingPct).toBe(36);   // "IFA" = index 4 of 11
  });

  it("returns [] for no entries", () => {
    expect(computeSequenceReadiness([])).toEqual([]);
  });
});
