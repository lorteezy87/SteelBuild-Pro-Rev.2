import { describe, expect, it } from "vitest";
import {
  asArray,
  asObject,
  emptyManning,
  mergeManning,
  sumManningTotals,
  buildActionItemOptions,
  buildDeliveryOptions,
  buildRfiOptions,
  inputStyle,
  labelStyle,
} from "../dailyLogFormHelpers";

describe("asArray / asObject", () => {
  it("coerces JSON strings", () => {
    expect(asArray('[1,2]')).toEqual([1, 2]);
    expect(asObject('{"a":1}')).toEqual({ a: 1 });
    expect(asArray(null)).toEqual([]);
    expect(asObject(null)).toEqual({});
  });
});

describe("manning", () => {
  it("sums count and man-hours", () => {
    const m = emptyManning();
    m.Ironworkers = { count: 4, hours: 8 };
    m.Welders = { count: 2, hours: 10 };
    const t = sumManningTotals(m);
    expect(t.totalCount).toBe(6);
    expect(t.totalHours).toBe(4 * 8 + 2 * 10);
  });

  it("merges metadata manning", () => {
    const m = mergeManning({ manning: { Ironworkers: { count: 1, hours: 8 } } });
    expect(m.Ironworkers.count).toBe(1);
    expect(m.Welders.count).toBe(0);
  });
});

describe("link options", () => {
  it("builds action/delivery/rfi labels", () => {
    expect(buildActionItemOptions([{ id: "1", title: "Fix bolt" }])[0].label).toBe("Fix bolt");
    expect(buildDeliveryOptions([{ id: "2", delivery_number: "D-1" }])[0].label).toBe("D-1");
    expect(buildRfiOptions([{ id: "3", rfi_number: "RFI-1", title: "Gap" }])[0].sublabel).toBe("Gap");
  });
});


describe("dailyLogForm styles", () => {
  it("input and label chrome", () => {
    expect(inputStyle.fontSize).toBe(12);
    expect(labelStyle.fontSize).toBe("9px");
    expect(labelStyle.textTransform).toBe("uppercase");
  });
});
