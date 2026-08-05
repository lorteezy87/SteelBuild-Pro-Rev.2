import { describe, expect, it } from "vitest";
import { DOC_CONTROL_VIEWS } from "../docControlPanelHelpers";
import { REVIEW_ROLES, DECIDE_OPTIONS } from "../reviewQueuePanelHelpers";
import {
  IMPACT_TYPES,
  IMPACT_PRIORITIES,
  IMPACT_STATUS_ACCENT,
} from "../impactBoardPanelHelpers";

describe("doc control pure catalogs", () => {
  it("views and review roles", () => {
    expect(DOC_CONTROL_VIEWS.map((v) => v.key)).toEqual([
      "register",
      "reviews",
      "impacts",
      "transmittals",
    ]);
    expect(REVIEW_ROLES).toContain("detailer");
    expect(DECIDE_OPTIONS).toContain("approved");
  });

  it("impact types priorities accents", () => {
    expect(IMPACT_TYPES[0]).toBe("fabrication");
    expect(IMPACT_PRIORITIES).toEqual(["low", "medium", "high", "critical"]);
    expect(IMPACT_STATUS_ACCENT.open).toContain("warn");
  });
});
