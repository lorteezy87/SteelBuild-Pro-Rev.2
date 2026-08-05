import { describe, it, expect } from "vitest";
import { convert, CONVERSIONS } from "../unitConversions";

describe("convert — linear conversions", () => {
  it("converts 1 in → mm", () => {
    expect(convert(1, "in", "mm")).toBeCloseTo(25.4, 6);
  });

  it("converts 25.4 mm → in", () => {
    expect(convert(25.4, "mm", "in")).toBeCloseTo(1, 6);
  });

  it("converts 1 ft → m", () => {
    expect(convert(1, "ft", "m")).toBeCloseTo(0.3048, 6);
  });

  it("converts 1 lb → kg", () => {
    expect(convert(1, "lb", "kg")).toBeCloseTo(0.45359237, 6);
  });

  it("converts 1 ton → tonne", () => {
    expect(convert(1, "ton", "tonne")).toBeCloseTo(0.90718474, 6);
  });

  it("converts 1 lb/ft → kg/m", () => {
    expect(convert(1, "lb/ft", "kg/m")).toBeCloseTo(1.48816394, 6);
  });

  it("converts 1 ksi → MPa", () => {
    expect(convert(1, "ksi", "MPa")).toBeCloseTo(6.89475729, 6);
  });
});

describe("convert — temperature (affine)", () => {
  it("converts 32 degF → 0 degC", () => {
    expect(convert(32, "degF", "degC")).toBeCloseTo(0, 6);
  });

  it("converts 212 degF → 100 degC", () => {
    expect(convert(212, "degF", "degC")).toBeCloseTo(100, 6);
  });

  it("converts 0 degC → 32 degF", () => {
    expect(convert(0, "degC", "degF")).toBeCloseTo(32, 6);
  });
});

describe("convert — null cases", () => {
  it("returns null for incompatible units (in → kg)", () => {
    expect(convert(1, "in", "kg")).toBeNull();
  });

  it("returns null for non-finite value", () => {
    expect(convert(NaN, "in", "mm")).toBeNull();
    expect(convert(Infinity, "in", "mm")).toBeNull();
    expect(convert(-Infinity, "in", "mm")).toBeNull();
  });

  it("returns value unchanged when from === to", () => {
    expect(convert(42, "mm", "mm")).toBeCloseTo(42, 6);
  });
});

describe("CONVERSIONS catalogue", () => {
  it("has more than 0 entries", () => {
    expect(CONVERSIONS.length).toBeGreaterThan(0);
  });

  it("includes a length category", () => {
    const lengthCat = CONVERSIONS.find((c) => c.id === "length");
    expect(lengthCat).toBeDefined();
  });

  it("length category units include mm", () => {
    const lengthCat = CONVERSIONS.find((c) => c.id === "length");
    expect(lengthCat.units).toContain("mm");
  });

  it("includes all expected categories", () => {
    const ids = CONVERSIONS.map((c) => c.id);
    expect(ids).toContain("length");
    expect(ids).toContain("weight");
    expect(ids).toContain("lindensity");
    expect(ids).toContain("stress");
    expect(ids).toContain("temp");
  });
});
