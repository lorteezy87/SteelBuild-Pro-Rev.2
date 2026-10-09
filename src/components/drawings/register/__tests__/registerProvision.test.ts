import { describe, it, expect, vi } from "vitest";
import {
  rowNeedsProvisioning,
  rowsNeedingProvisioning,
} from "../registerProvision";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

function row(over: Partial<DrawingRegisterRow> = {}): DrawingRegisterRow {
  return {
    drawing_id: "dwg-1",
    project_id: "proj-1",
    sheet_number: "S101",
    sheet_title: "First Floor Framing",
    discipline: "S",
    drawing_set_name: "Main Steel - IFC",
    stage: "IFC",
    current_revision_id: null,
    current_revision: "A",
    current_status: null,
    current_issued_at: null,
    open_impact_count: 0,
    pending_review_count: 0,
    rfi_count: 0,
    work_package_count: 0,
    last_activity: null,
    ...over,
  };
}

describe("rowNeedsProvisioning", () => {
  it("is true when the row has no current revision (the common untracked case)", () => {
    expect(rowNeedsProvisioning(row({ current_revision_id: null }))).toBe(true);
  });

  it("is false once a current revision exists", () => {
    expect(rowNeedsProvisioning(row({ current_revision_id: "rev-1" }))).toBe(false);
  });
});

describe("rowsNeedingProvisioning", () => {
  it("keeps only rows without a current revision", () => {
    const rows = [
      row({ drawing_id: "a", current_revision_id: null }),
      row({ drawing_id: "b", current_revision_id: "rev-b" }),
      row({ drawing_id: "c", current_revision_id: null }),
    ];
    expect(rowsNeedingProvisioning(rows).map((r) => r.drawing_id)).toEqual(["a", "c"]);
  });
});
