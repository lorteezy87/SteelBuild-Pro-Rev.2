import { describe, it, expect } from "vitest";
import {
  rowNeedsProvisioning,
  registerRowToDrawing,
  rowsNeedingProvisioning,
} from "../registerProvision";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";

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

describe("registerRowToDrawing", () => {
  it("maps a register row onto the ensureCurrentRevision drawing shape", () => {
    const drawing = registerRowToDrawing(
      row({ drawing_id: "dwg-9", project_id: "proj-9", current_revision: "B", sheet_number: "S200", sheet_title: "Roof Plan" }),
    );
    expect(drawing).toEqual({
      id: "dwg-9",
      project_id: "proj-9",
      revision: "B",
      sheet_number: "S200",
      sheet_title: "Roof Plan",
      file_url: null,
      pdf_page: null,
    });
  });

  it("returns null when project_id is missing (skip rather than throw in the provisioner)", () => {
    expect(registerRowToDrawing(row({ project_id: null }))).toBeNull();
  });

  it("returns null when drawing_id is missing", () => {
    // drawing_id is non-nullable in the type, but guard against bad runtime data.
    expect(registerRowToDrawing(row({ drawing_id: "" as unknown as string }))).toBeNull();
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
