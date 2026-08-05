import { describe, expect, it } from "vitest";
import {
  typeTone, fieldPriorityTone,
} from "../fieldHubControlCenterHelpers";

describe("field hub tones", () => {
  it("type and priority tones", () => {
    expect(typeTone("Safety")).toBe("danger");
    expect(typeTone("Inspection")).toBe("info");
    expect(typeTone("Punchlist")).toBe("warn");
    expect(typeTone("Other")).toBe("neutral");
    expect(fieldPriorityTone("Critical")).toBe("danger");
    expect(fieldPriorityTone("Medium")).toBe("warn");
    expect(fieldPriorityTone("Low")).toBe("neutral");
  });
});
