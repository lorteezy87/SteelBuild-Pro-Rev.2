import { describe, expect, it } from "vitest";
import {
  bucketForAlertType,
  formatBadge,
  groupAlertBucketCounts,
} from "../bellDropdownHelpers";

describe("bucketForAlertType", () => {
  it("classifies common types", () => {
    expect(bucketForAlertType("RFI Overdue")).toBe("rfi");
    expect(bucketForAlertType("change_order")).toBe("co");
    expect(bucketForAlertType("drawing_revision")).toBe("dwg");
    expect(bucketForAlertType("delivery_late")).toBe("del");
    expect(bucketForAlertType("misc")).toBe("other");
  });
});

describe("formatBadge / group counts", () => {
  it("compacts large counts", () => {
    expect(formatBadge(5)).toBe("5");
    expect(formatBadge(25)).toBe("20+");
    expect(formatBadge(120)).toBe("100+");
    expect(formatBadge(600)).toBe("500+");
  });
  it("aggregates buckets", () => {
    const g = groupAlertBucketCounts([
      { alert_type: "RFI" },
      { alert_type: "RFI" },
      { alert_type: "delivery" },
    ]);
    expect(g.rfi).toBe(2);
    expect(g.del).toBe(1);
  });
});
