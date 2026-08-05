import { describe, expect, it } from "vitest";
import { TYPE_CHIPS, PHASE_CHIPS, typeTone, fieldStatusTone } from "../fieldHubControlCenterHelpers";

describe("fieldHubControlCenterHelpers", () => {
  it("chips", () => {
    expect(TYPE_CHIPS).toContain("Inspection");
    expect(PHASE_CHIPS[0]).toBe("All");
    expect(PHASE_CHIPS.length).toBeGreaterThan(1);
  });
  it("typeTone", () => {
    expect(typeTone("Safety")).toBe("danger");
  });
});

describe("fieldStatusTone", () => {
  it("maps closed/open families", () => {
    expect(fieldStatusTone("Complete")).toBe("good");
    expect(fieldStatusTone("Open")).toBe("info");
    expect(fieldStatusTone("Weird")).toBe("neutral");
  });
});

