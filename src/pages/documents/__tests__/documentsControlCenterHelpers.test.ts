import { describe, expect, it } from "vitest";
import { statusToneForDoc, KNOWN_CATEGORIES } from "../documentsControlCenterHelpers";

describe("documentsControlCenterHelpers", () => {
  it("status tones", () => {
    expect(statusToneForDoc("Approved")).toBe("good");
  });
  it("known categories", () => {
    expect(KNOWN_CATEGORIES).toContain("Structural");
    expect(KNOWN_CATEGORIES[0]).toBe("All");
  });
});
