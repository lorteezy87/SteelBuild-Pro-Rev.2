import { describe, expect, it } from "vitest";
import {
  severityTone,
  mitigationTone,
  BASE_CATEGORIES,
} from "../riskControlCenterHelpers";

describe("risk hub tones", () => {
  it("severity and mitigation", () => {
    expect(severityTone("critical")).toBe("danger");
    expect(severityTone("high")).toBe("warn");
    expect(severityTone("low")).toBe("neutral");
    expect(mitigationTone(null)).toBe("neutral");
    expect(mitigationTone("In Progress")).toBe("warn");
    expect(mitigationTone("Open")).toBe("neutral");
  });
});

describe("BASE_CATEGORIES", () => {
  it("starts with All", () => {
    expect(BASE_CATEGORIES[0]).toBe("All");
  });
});
