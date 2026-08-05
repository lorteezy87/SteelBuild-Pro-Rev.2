
import { describe, expect, it } from "vitest";
import { statusPillTone } from "../processBoardPanelHelpers";

describe("statusPillTone", () => {
  it("maps stage families", () => {
    expect(statusPillTone("Released")).toBe("good");
    expect(statusPillTone("IFC")).toBe("good");
    expect(statusPillTone("OFS")).toBe("warn");
    expect(statusPillTone("BFA")).toBe("warn");
    expect(statusPillTone("IFA")).toBe("info");
    expect(statusPillTone("OFA")).toBe("info");
    expect(statusPillTone("Unknown")).toBe("neutral");
  });
});
