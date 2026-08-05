import { describe, expect, it } from "vitest";
import { fmtMoney, fmtFull, sovStatusTone } from "../format";

describe("fmtMoney / fmtFull / sovStatusTone", () => {
  it("compacts large money", () => {
    expect(fmtMoney(1_500_000)).toBe("$1.5M");
    expect(fmtMoney(12_000)).toBe("$12K");
    expect(fmtMoney(42)).toBe("$42");
  });
  it("formats full currency without cents", () => {
    expect(fmtFull(1500)).toBe("$1,500");
  });
  it("maps SOV status tones", () => {
    expect(sovStatusTone("Paid")).toBe("good");
    expect(sovStatusTone("Certified")).toBe("good");
    expect(sovStatusTone("Submitted")).toBe("warn");
    expect(sovStatusTone("Draft")).toBe("neutral");
    expect(sovStatusTone(null)).toBe("neutral");
  });
});
