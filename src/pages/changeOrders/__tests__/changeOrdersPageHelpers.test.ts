import { describe, expect, it } from "vitest";
import {sourceRfiLabel,
  filterChangeOrders,
  nextSelectedToggle,
  selectAllOrNone, buildChangeOrdersCsvString, changeOrdersCsvFilename} from "../changeOrdersPageHelpers";

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

describe("buildChangeOrdersCsvString", () => {
  it("builds header and quoted title/approved_by", () => {
    const csv = buildChangeOrdersCsvString([
      { co_number: 1, title: 'Say "hi"', status: "Draft", approved_by: 'A "B"' },
    ]);
    expect(csv.split("\n")[0]).toContain("CO #");
    expect(csv).toContain('"Say ""hi"""');
    expect(changeOrdersCsvFilename("My Project")).toBe("change-orders-My-Project.csv");
  });
});

import { buildChangeOrderPrefillFromRfi } from "../changeOrdersPageHelpers";

describe("buildChangeOrderPrefillFromRfi", () => {
  it("builds title, amount, and schedule from RFI", () => {
    const prefill = buildChangeOrderPrefillFromRfi(
      {
        id: "r1",
        rfi_number: "12",
        title: "Extra steel",
        question: "Need more beams",
        cost_impact_amount: "1500",
        schedule_impact_days: "3",
      },
      "p1",
    );
    expect(prefill.source_rfi_id).toBe("r1");
    expect(prefill.project_id).toBe("p1");
    expect(prefill.title).toBe("RFI 12: Extra steel");
    expect(prefill.description).toBe("Need more beams");
    expect(prefill.reason_code).toBe("Design Change");
    expect(prefill.co_amount).toBe(1500);
    expect(prefill.schedule_impact_days).toBe(3);
  });

  it("falls back when rfi_number missing", () => {
    const prefill = buildChangeOrderPrefillFromRfi({ id: "r2", subject: "hold" }, null);
    expect(prefill.title).toBe("RFI: hold");
  });
});
