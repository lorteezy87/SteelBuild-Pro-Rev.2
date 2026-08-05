import { describe, expect, it } from "vitest";
import {
  statusColor,
  formatMoney,
  monoStyle,
  displayStyle,
  AI_ACCENT,
} from "../changeOrderImportHelpers";

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

describe("import chrome atoms", () => {
  it("mono/display/AI", () => {
    expect(monoStyle.fontFamily).toContain("mono");
    expect(displayStyle.fontFamily).toContain("Space Grotesk");
    expect(AI_ACCENT).toContain("ai-accent");
  });
});

