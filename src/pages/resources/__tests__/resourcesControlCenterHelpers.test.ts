import { describe, expect, it } from "vitest";
import {
  availabilityTone,
  TYPE_FILTERS,
} from "../resourcesControlCenterHelpers";

describe("availabilityTone", () => {
  it("maps availability labels", () => {
    expect(availabilityTone("Over-Allocated")).toBe("danger");
    expect(availabilityTone("Allocated")).toBe("warn");
    expect(availabilityTone("Committed")).toBe("warn");
    expect(availabilityTone("Available")).toBe("good");
    expect(availabilityTone("Partially Available")).toBe("info");
    expect(availabilityTone("Other")).toBe("neutral");
  });
});

describe("TYPE_FILTERS", () => {
  it("includes Equipment", () => {
    expect(TYPE_FILTERS).toContain("Equipment");
  });
});

