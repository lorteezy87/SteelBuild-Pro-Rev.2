import { describe, expect, it } from "vitest";
import {
  formatStamp,
  STAMP_META,
  mono,
} from "../signoffStampHelpers";

describe("formatStamp", () => {
  it("formats iso or dash", () => {
    expect(formatStamp(null)).toBe("—");
    expect(formatStamp("2026-01-01T00:00:00Z")).toMatch(/2026|1/);
  });
});

describe("stamp meta chrome", () => {
  it("covers stamp types without icons", () => {
    expect(STAMP_META.rejected.label).toBe("Rejected");
    expect(STAMP_META.approved_for_fabrication.color).toBe("var(--status-success)");
    expect(mono.fontFamily).toBe("var(--font-mono)");
    expect(STAMP_META.void.label).toBe("Void");
  });
});
