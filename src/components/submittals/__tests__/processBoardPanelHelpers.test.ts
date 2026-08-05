
import { describe, expect, it } from "vitest";
import {
  statusPillTone,
  cardTone,
  riskPillTone,
} from "../processBoardPanelHelpers";

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

describe("cardTone / riskPillTone", () => {
  it("maps risk and due state to pill tones", () => {
    expect(cardTone({ risk: { tier: "critical" }, due: {} })).toBe("danger");
    expect(cardTone({ risk: {}, due: { overdue: true } })).toBe("danger");
    expect(cardTone({ risk: { tier: "urgent" }, due: {}, needsAction: false })).toBe("review");
    expect(cardTone({ risk: { tier: "attention" }, due: {} })).toBe("warn");
    expect(cardTone({ risk: {}, due: {} })).toBe("neutral");
    expect(riskPillTone("critical")).toBe("danger");
    expect(riskPillTone("urgent")).toBe("review");
    expect(riskPillTone("attention")).toBe("warn");
    expect(riskPillTone(undefined)).toBe("neutral");
  });
});
