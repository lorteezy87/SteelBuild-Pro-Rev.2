import { describe, expect, it } from "vitest";
import {
  buildSheetResponseInitialRows,
  RESPONSE_OPTIONS,
  RESPONSE_COLORS,
  thStyle,
  tdStyle,
} from "../sheetResponseGridHelpers";

describe("buildSheetResponseInitialRows", () => {
  it("maps drawings with existing responses", () => {
    const drawings = [
      { id: "d1", sheet_number: "S-01", title: "Plan", discipline: "Structural" },
      { id: "d2", drawing_number: "A-02", drawing_title: "Elev", discipline: "Arch" },
    ];
    const responses = [
      { id: "r1", drawing_id: "d1", response_status: "Revise & Resubmit", reviewer_comment: "Fix notes" },
    ];
    const rows = buildSheetResponseInitialRows(drawings, responses);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "r1",
      drawing_id: "d1",
      sheet_number: "S-01",
      title: "Plan",
      response_status: "Revise & Resubmit",
      reviewer_comment: "Fix notes",
    });
    expect(rows[1]).toMatchObject({
      id: undefined,
      drawing_id: "d2",
      sheet_number: "A-02",
      title: "Elev",
      response_status: "No Exception",
      reviewer_comment: "",
    });
  });

  it("handles null inputs", () => {
    expect(buildSheetResponseInitialRows(null, null)).toEqual([]);
  });
});

describe("sheet response chrome", () => {
  it("options and colors", () => {
    expect(RESPONSE_OPTIONS).toContain("No Exception");
    expect(RESPONSE_COLORS.Rejected.color).toBe("var(--status-error)");
    expect(thStyle.position).toBe("sticky");
    expect(tdStyle.verticalAlign).toBe("middle");
  });
});
