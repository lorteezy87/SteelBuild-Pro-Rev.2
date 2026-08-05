import { describe, expect, it } from "vitest";
import {
  sourceRfiLabel,
  filterChangeOrders,
  nextSelectedToggle,
  selectAllOrNone,
} from "../changeOrdersPageHelpers";

describe("changeOrdersPageHelpers", () => {
  it("builds source RFI banner label", () => {
    expect(sourceRfiLabel(null, [])).toBe("");
    expect(sourceRfiLabel("r1", [{ id: "r1", rfi_number: "RFI-12" }])).toBe("RFI RFI-12");
    expect(sourceRfiLabel("r1", [{ id: "r1" }])).toBe("the source RFI");
    expect(sourceRfiLabel("missing", [{ id: "r1", rfi_number: "X" }])).toBe("");
  });

  it("filters by status and search fields", () => {
    const cos = [
      { id: "1", status: "Draft", co_number: "CO-1", title: "Beams", description: "extra", reason_code: "scope" },
      { id: "2", status: "Approved", co_number: "CO-2", title: "Columns", description: "steel", reason_code: "design" },
    ];
    expect(filterChangeOrders(cos, "Approved", "").map((c) => c.id)).toEqual(["2"]);
    expect(filterChangeOrders(cos, "all", "scope").map((c) => c.id)).toEqual(["1"]);
    expect(filterChangeOrders(cos, "all", "columns").map((c) => c.id)).toEqual(["2"]);
  });

  it("toggles and select-all selection sets", () => {
    expect([...nextSelectedToggle(new Set(["a"]), "b")].sort()).toEqual(["a", "b"]);
    expect([...nextSelectedToggle(new Set(["a"]), "a")]).toEqual([]);
    expect([...selectAllOrNone(true, ["1", "2"])].sort()).toEqual(["1", "2"]);
    expect([...selectAllOrNone(false, ["1", "2"])]).toEqual([]);
  });
});
