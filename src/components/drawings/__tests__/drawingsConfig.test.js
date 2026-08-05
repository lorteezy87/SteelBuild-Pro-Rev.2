import { describe, it, expect } from "vitest";
import { stageUpdatePatch, SORTABLE_FIELDS } from "../drawingsConfig";

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

// SORTABLE_FIELDS are the register-table header comparators (F20). These lock
// the type-aware ordering: natural (numeric-aware) sheet numbers, stage by the
// canonical STAGE_ORDER rather than alphabetical, numeric revisions, and the
// undated-due-date "9999" sentinel that sorts undated sheets last ascending.
describe("SORTABLE_FIELDS comparators", () => {
  it("sorts sheet_number naturally (numeric-aware, so S-2 precedes S-10)", () => {
    const cmp = SORTABLE_FIELDS.sheet_number.cmp;
    expect(cmp({ sheet_number: "S-2" }, { sheet_number: "S-10" })).toBeLessThan(0);
    expect(cmp({ sheet_number: "S-10" }, { sheet_number: "S-2" })).toBeGreaterThan(0);
  });

  it("orders stage by the canonical STAGE_ORDER, not alphabetically", () => {
    const cmp = SORTABLE_FIELDS.stage.cmp;
    expect(cmp({ stage: "IFA" }, { stage: "Released" })).toBeLessThan(0);
    expect(cmp({ stage: "Released" }, { stage: "Not Started" })).toBeGreaterThan(0);
  });

  it("sorts revision_number numerically", () => {
    const cmp = SORTABLE_FIELDS.revision_number.cmp;
    expect(cmp({ revision_number: "2" }, { revision_number: "10" })).toBeLessThan(0);
    expect(cmp({ revision_number: 3 }, { revision_number: 3 })).toBe(0);
  });

  it("treats a missing due_date as far-future (9999) so undated sheets sort last ascending", () => {
    const cmp = SORTABLE_FIELDS.due_date.cmp;
    expect(cmp({ due_date: "2026-01-01" }, {})).toBeLessThan(0);
  });
});
