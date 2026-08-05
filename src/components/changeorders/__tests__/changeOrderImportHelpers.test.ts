import { describe, expect, it } from "vitest";
import { statusColor, formatMoney } from "../changeOrderImportHelpers";

describe("statusColor / formatMoney", () => {
  it("maps statuses", () => {
    expect(statusColor("Approved")).toContain("success");
    expect(statusColor("Under Review")).toContain("warning");
  });
  it("formats money", () => {
    expect(formatMoney(1200)).toMatch(/\$1,200/);
    expect(formatMoney(null)).toBe("—");
  });
});
