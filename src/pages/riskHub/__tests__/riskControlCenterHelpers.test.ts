import { describe, expect, it } from "vitest";
import {
  severityTone, mitigationTone,
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
