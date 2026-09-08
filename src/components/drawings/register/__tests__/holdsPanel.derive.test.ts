import { describe, expect, it } from "vitest";
import { filterHoldsByScope, holdableSheets } from "@/components/drawings/register/HoldsPanel";
import type { DrawingRegisterRow } from "@/hooks/useDrawingRegister";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";

function row(overrides: Partial<DrawingRegisterRow>): DrawingRegisterRow {
  return {
    drawing_id: "d1",
    project_id: "p1",
    sheet_number: "S-101",
    sheet_title: "Framing plan",
    discipline: "Structural",
    drawing_set_name: "Set 1",
    stage: "IFA",
    current_revision_id: "r1",
    current_revision: "A",
    current_status: "reviewed",
    current_issued_at: null,
    open_impact_count: 0,
    pending_review_count: 0,
    rfi_count: 0,
    work_package_count: 0,
    last_activity: null,
    active_hold_id: null,
    active_hold_reason: null,
    active_hold_placed_at: null,
    ...overrides,
  };
}

function hold(overrides: Partial<DrawingHoldRow>): DrawingHoldRow {
  return {
    id: "h1",
    project_id: "p1",
    drawing_id: "d1",
    reason: "Blocked",
    prior_release_status: null,
    placed_by_id: null,
    placed_by_name: null,
    placed_at: "2026-09-08T00:00:00Z",
    is_active: true,
    released_by_id: null,
    released_by_name: null,
    released_at: null,
    release_notes: null,
    created_at: "2026-09-08T00:00:00Z",
    ...overrides,
  };
}

describe("holdableSheets", () => {
  it("excludes sheets that already carry an active hold", () => {
    const free = row({ drawing_id: "free", sheet_number: "S-2" });
    const held = row({ drawing_id: "held", sheet_number: "S-1", active_hold_id: "h9" });
    const ids = holdableSheets([held, free]).map((s) => s.drawingId);
    expect(ids).toEqual(["free"]);
  });

  it("sorts sheet numbers naturally, not lexicographically", () => {
    const rows = [
      row({ drawing_id: "a", sheet_number: "S-101" }),
      row({ drawing_id: "b", sheet_number: "S-2" }),
      row({ drawing_id: "c", sheet_number: "S-10" }),
    ];
    expect(holdableSheets(rows).map((s) => s.sheetNumber)).toEqual(["S-2", "S-10", "S-101"]);
  });

  it("carries the current revision + status needed for the on_hold sync", () => {
    const [sheet] = holdableSheets([row({ current_revision_id: "rev-9", current_status: "released_for_shop" })]);
    expect(sheet.currentRevisionId).toBe("rev-9");
    expect(sheet.currentStatus).toBe("released_for_shop");
  });
});

describe("filterHoldsByScope", () => {
  const active = hold({ id: "a", is_active: true });
  const released = hold({ id: "r", is_active: false });

  it("active returns only active holds", () => {
    expect(filterHoldsByScope([active, released], "active").map((h) => h.id)).toEqual(["a"]);
  });
  it("released returns only released holds", () => {
    expect(filterHoldsByScope([active, released], "released").map((h) => h.id)).toEqual(["r"]);
  });
  it("all returns everything untouched", () => {
    expect(filterHoldsByScope([active, released], "all")).toHaveLength(2);
  });
});
