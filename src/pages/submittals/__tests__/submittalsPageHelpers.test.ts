import { describe, expect, it } from "vitest";
import {
  buildDrawingSetsById,
  buildRoundsBySubmittal,
  filterRelatedSetRfis,
} from "../submittalsPageHelpers";

describe("submittalsPageHelpers", () => {
  it("builds drawing set id map", () => {
    const map = buildDrawingSetsById([
      { id: "s1", set_name: "A" } as any,
      { id: null } as any,
      { id: "s2", set_name: "B" } as any,
    ]);
    expect([...map.keys()]).toEqual(["s1", "s2"]);
    expect(map.get("s1")?.set_name).toBe("A");
  });

  it("groups and sorts rounds by submittal", () => {
    const map = buildRoundsBySubmittal([
      { id: "r2", submittal_id: "sub1", round_number: 2 },
      { id: "r1", submittal_id: "sub1", round_number: 1 },
      { id: "r3", submittal_id: "sub2", round_number: 1 },
      { id: "orphan", submittal_id: null, round_number: 1 },
    ]);
    expect(map.sub1.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(map.sub2).toHaveLength(1);
    expect(map).not.toHaveProperty("null");
  });

  it("filters related set RFIs excluding manual links", () => {
    const sub = {
      drawing_set_ids: ["ds1", "ds2"],
      linked_rfi_ids: ["rfi-manual"],
    };
    const rfis = [
      { id: "rfi-manual", drawing_set_id: "ds1" },
      { id: "rfi-a", drawing_set_id: "ds1" },
      { id: "rfi-b", drawing_set_id: "ds3" },
      { id: "rfi-c", drawing_set_id: null },
    ];
    expect(filterRelatedSetRfis(sub, rfis).map((r) => r.id)).toEqual(["rfi-a"]);
    expect(filterRelatedSetRfis(null, rfis)).toEqual([]);
    expect(filterRelatedSetRfis({ drawing_set_ids: [] }, rfis)).toEqual([]);
  });
});


import { findRowById, buildSpinOffInitial, toggleSelectionId } from "../submittalsPageHelpers";

describe("submittal selection helpers", () => {
  it("finds rows and builds spin-off seed", () => {
    expect(findRowById([{ id: "a" }, { id: "b" }], "b")?.id).toBe("b");
    expect(findRowById([{ id: "a" }], null)).toBeNull();
    expect(buildSpinOffInitial({ discipline: "Structural", drawing_set_ids: ["s1"] })).toEqual({
      discipline: "Structural",
      drawing_set_ids: ["s1"],
    });
    expect(buildSpinOffInitial(null)).toEqual({ drawing_set_ids: [] });
    expect([...toggleSelectionId(new Set(["a"]), "b")].sort()).toEqual(["a", "b"]);
  });
});

import {
  isSplitEligibleStatus,
  isSubmittalDetailOverdue,
  riskTierChipColor,
} from "../submittalsPageHelpers";

describe("submittal detail pure helpers", () => {
  it("split eligibility", () => {
    expect(isSplitEligibleStatus("Approved")).toBe(true);
    expect(isSplitEligibleStatus("Draft")).toBe(false);
  });
  it("overdue respects closed statuses", () => {
    const days = (d: string) => (d === "2020-01-01" ? -10 : 5);
    expect(isSubmittalDetailOverdue("Draft", "2020-01-01", days)).toBe(true);
    expect(isSubmittalDetailOverdue("Approved", "2020-01-01", days)).toBe(false);
    expect(isSubmittalDetailOverdue("Draft", null, days)).toBe(false);
  });
  it("risk tier colors", () => {
    expect(riskTierChipColor("critical")).toContain("error");
    expect(riskTierChipColor("normal")).toContain("muted");
  });
});
