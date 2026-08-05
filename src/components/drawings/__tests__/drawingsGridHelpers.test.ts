import { describe, expect, it } from "vitest";
import {
  buildGroups,
  UNGROUPED_KEY,
  EXPAND_LS_KEY,
} from "../drawingsGridHelpers";

describe("buildGroups", () => {
  it("groups by set id and ungrouped", () => {
    const groups = buildGroups(
      [
        { id: "d1", drawing_set_id: "s1", sheet_number: "S2" },
        { id: "d2", drawing_set_id: "s1", sheet_number: "S1" },
        { id: "d3", sheet_number: "X1" },
      ],
      [{ id: "s1", set_name: "Steel" }],
    );
    const named = groups.find((g) => g.setId === "s1");
    const un = groups.find((g) => g.key === UNGROUPED_KEY);
    expect(named?.sheets.map((s: any) => s.sheet_number)).toEqual(["S1", "S2"]);
    expect(un?.sheets).toHaveLength(1);
  });
});

describe("EXPAND_LS_KEY", () => {
  it("names expanded sets key", () => {
    expect(EXPAND_LS_KEY).toContain("expanded-sets");
  });
});
