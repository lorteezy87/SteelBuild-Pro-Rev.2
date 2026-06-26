import { describe, it, expect } from "vitest";
import { stageUpdatePatch } from "../drawingsConfig";

// stageUpdatePatch is the shared patch-builder for the two DIRECT (legacy)
// sheet-stage mutations on the Drawings page (the bulk stage edit and the
// AdvanceStageDialog legacy fallback). §20-21: a manual stage change away from
// "Released" must also CLEAR the deprecated set_approval_status / set_approved_date
// columns, or a stale "approved" silently re-derives the sheet as Released on the
// next refetch and the manual change appears to revert.
describe("stageUpdatePatch", () => {
  it("clears the deprecated legacy approval columns when moving AWAY from Released", () => {
    for (const stage of ["Not Started", "IFA", "OFA", "BFA", "OFS", "IFC"]) {
      expect(stageUpdatePatch(stage)).toEqual({
        stage,
        set_approval_status: null,
        set_approved_date: null,
      });
    }
  });

  it("does NOT touch the legacy approval columns when the new stage IS Released", () => {
    // Moving TO Released leaves set_approval_status alone — the dedicated
    // Set-Approval flow (useDrawings.approveSetMut) owns the "approved" pills.
    const patch = stageUpdatePatch("Released");
    expect(patch).toEqual({ stage: "Released" });
    expect("set_approval_status" in patch).toBe(false);
    expect("set_approved_date" in patch).toBe(false);
  });
});
