import { describe, it, expect } from "vitest";
import { buildRevisionSummary } from "../revisionSummary";

const TODAY = "2026-06-16";

// One set, two sheets. S1 (d1) is fabricated; a rev-2 change on it is downstream.
function makeArgs(over = {}) {
  return {
    today: TODAY,
    set: {
      setId: "set1",
      name: "Main Steel",
      parent: { id: "set1", set_name: "Main Steel", linked_work_package_ids: ["wp1"], material_impacted: false, long_lead_impact: false },
      sheets: [
        { id: "d1", sheet_number: "S1", drawing_set_id: "set1", fabrication_finish_date: "2026-05-01", linked_rfi_ids: null },
        { id: "d2", sheet_number: "S2", drawing_set_id: "set1", linked_rfi_ids: null },
      ],
    },
    revisions: [
      { id: "r1b", drawing_id: "d1", is_current: true, supersedes_revision_id: "r1a", version_number: 2 },
      { id: "r1a", drawing_id: "d1", is_current: false, version_number: 1 },
      { id: "r2", drawing_id: "d2", is_current: true, version_number: 1 }, // not a change
    ],
    rfis: [],
    drawingSets: [{ id: "set1", set_name: "Main Steel", linked_work_package_ids: ["wp1"] }],
    workPackages: [{ id: "wp1", wp_number: "WP-104", sequence_number: "2" }],
    modelElements: [],
    ...over,
  };
}

describe("buildRevisionSummary", () => {
  it("flags a fabricated sheet's revision as high-risk, likely-RFI, medium impact", () => {
    const s = buildRevisionSummary(makeArgs());
    expect(s.sheetsChanged).toBe(1);
    expect(s.changedSheets[0].sheetNumber).toBe("S1");
    expect(s.changedSheets[0].downstream).toBe("fabricated");
    expect(s.highRiskCount).toBe(1);
    expect(s.highRisk[0].reason).toBe("already fabricated");
    expect(s.affectedWorkPackages).toEqual(["WP-104"]);
    expect(s.likelyRfi.needed).toBe(true);
    expect(s.likelyRfi.sheets).toEqual(["S1"]);
    expect(s.impact.level).toBe("medium");
    expect(s.impact.note).toContain("already downstream");
  });

  it("does not flag likely-RFI when the high-risk sheet already has an open RFI", () => {
    const args = makeArgs();
    args.set.sheets[0].linked_rfi_ids = "RFI-001";
    args.rfis = [{ rfi_number: "RFI-001", status: "Open", is_deleted: false }];
    const s = buildRevisionSummary(args);
    expect(s.highRiskCount).toBe(1); // still high-risk (fabricated)
    expect(s.likelyRfi.needed).toBe(false); // but already has an open RFI
    expect(s.openRfiCount).toBe(1);
  });

  it("rates an in-field change as high impact", () => {
    const args = makeArgs();
    args.set.sheets[0].ready_for_install_date = "2026-05-01"; // in field
    const s = buildRevisionSummary(args);
    expect(s.changedSheets[0].downstream).toBe("in the field");
    expect(s.impact.level).toBe("high");
  });

  it("returns an empty digest when nothing changed (all rev 1)", () => {
    const args = makeArgs({
      revisions: [
        { id: "r1", drawing_id: "d1", is_current: true, version_number: 1 },
        { id: "r2", drawing_id: "d2", is_current: true, version_number: 1 },
      ],
    });
    const s = buildRevisionSummary(args);
    expect(s.sheetsChanged).toBe(0);
    expect(s.highRiskCount).toBe(0);
    expect(s.likelyRfi.needed).toBe(false);
    expect(s.impact.level).toBe("none");
    expect(s.impact.note).toContain("No material changes");
  });

  it("rates an upstream-only change low, but a material/long-lead flag bumps it and makes it high-risk", () => {
    const base = makeArgs({
      revisions: [
        { id: "r2b", drawing_id: "d2", is_current: true, supersedes_revision_id: "r2a", version_number: 2 },
        { id: "r2a", drawing_id: "d2", is_current: false, version_number: 1 },
      ],
    });
    const low = buildRevisionSummary(base);
    expect(low.sheetsChanged).toBe(1);
    expect(low.changedSheets[0].sheetNumber).toBe("S2");
    expect(low.changedSheets[0].downstream).toBeNull();
    expect(low.impact.level).toBe("low");
    expect(low.highRiskCount).toBe(0);

    base.set.parent.long_lead_impact = true;
    const flagged = buildRevisionSummary(base);
    expect(flagged.impact.level).toBe("medium"); // low bumped one step
    expect(flagged.highRiskCount).toBe(1); // flag makes the change high-risk
    expect(flagged.highRisk[0].reason).toBe("long-lead impact");
  });
});
