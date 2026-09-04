import { describe, it, expect } from "vitest";
import { buildResponseRows, mergeResponseRows, responseSyncKey } from "../SheetResponseGrid";

const drawings = [
  { id: "d1", sheet_number: "S-1", title: "Plan", discipline: "Structural", drawing_set_id: "set-1" },
  { id: "d2", sheet_number: "S-2", title: "Sections", discipline: "Structural", drawing_set_id: "set-1" },
];

describe("buildResponseRows", () => {
  it("seeds a default row per sheet and carries drawing_set_id from the drawing", () => {
    const rows = buildResponseRows(drawings, []);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: undefined, drawing_id: "d1", drawing_set_id: "set-1", response_status: "No Exception", reviewer_comment: "" });
  });

  it("hydrates rows from existing responses (id, status, comment, set id)", () => {
    const rows = buildResponseRows(drawings, [
      { id: "r2", drawing_id: "d2", drawing_set_id: "set-9", response_status: "Rejected", reviewer_comment: "fix" },
    ]);
    expect(rows[1]).toMatchObject({ id: "r2", drawing_set_id: "set-9", response_status: "Rejected", reviewer_comment: "fix" });
    expect(rows[0].id).toBeUndefined();
  });
});

describe("mergeResponseRows", () => {
  it("adopts a later-arriving saved response for a row that had no id yet", () => {
    const prev = buildResponseRows(drawings, []);
    prev[1] = { ...prev[1], response_status: "See Comments" }; // unsaved edit, then server row arrives
    const fresh = buildResponseRows(drawings, [{ id: "r2", drawing_id: "d2", response_status: "Rejected", reviewer_comment: "fix" }]);
    const merged = mergeResponseRows(prev, fresh);
    expect(merged[1]).toMatchObject({ id: "r2", response_status: "Rejected", reviewer_comment: "fix" });
  });

  it("keeps in-progress edits on rows that were already hydrated", () => {
    const existing = [{ id: "r1", drawing_id: "d1", response_status: "No Exception", reviewer_comment: "" }];
    const prev = buildResponseRows(drawings, existing).map((r) => (r.drawing_id === "d1" ? { ...r, response_status: "Rejected", reviewer_comment: "typed" } : r));
    const merged = mergeResponseRows(prev, buildResponseRows(drawings, existing));
    expect(merged[0]).toMatchObject({ id: "r1", response_status: "Rejected", reviewer_comment: "typed" });
  });

  it("drops rows for sheets that are no longer present and adds new ones", () => {
    const prev = buildResponseRows(drawings, []);
    const merged = mergeResponseRows(prev, buildResponseRows([drawings[1], { id: "d3", sheet_number: "S-3" }], []));
    expect(merged.map((r) => r.drawing_id)).toEqual(["d2", "d3"]);
  });
});

describe("responseSyncKey", () => {
  it("is stable across fresh-but-equal arrays and changes when responses arrive", () => {
    const a = responseSyncKey([...drawings], []);
    const b = responseSyncKey(drawings.map((d) => ({ ...d })), []);
    expect(a).toBe(b);
    expect(responseSyncKey(drawings, [{ id: "r1", drawing_id: "d1", response_status: "Rejected" }])).not.toBe(a);
  });
});
