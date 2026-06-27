import { describe, it, expect } from "vitest";
import { normalizeSN } from "../drawingViewerUtils";

describe("normalizeSN", () => {
  it("handles nullish and non-string input by returning empty string", () => {
    expect(normalizeSN(null)).toBe("");
    expect(normalizeSN(undefined)).toBe("");
    expect(normalizeSN("")).toBe("");
  });

  it("uppercases and strips spaces / dashes / underscores / dots", () => {
    expect(normalizeSN("s-201")).toBe("S201");
    expect(normalizeSN("S 201")).toBe("S201");
    expect(normalizeSN("S_201")).toBe("S201");
    expect(normalizeSN("S.2.01")).toBe("S201");
    expect(normalizeSN(" S - 2 0 1 ")).toBe("S201");
  });

  it("collapses callout-style references to the same key", () => {
    // The viewer relies on this collapse so that "S-201", "S201" and
    // "DETAIL 3 / S-201" share a normalised prefix when matched against
    // the project drawing list.
    const a = normalizeSN("S-201");
    const b = normalizeSN("S201");
    const c = normalizeSN("s 201");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("coerces numeric input to a string before normalising", () => {
    // Some legacy callouts come in as numbers (sheet 201 with no prefix).
    expect(normalizeSN(201)).toBe("201");
  });
});
