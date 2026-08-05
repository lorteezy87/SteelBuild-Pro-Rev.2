import { describe, expect, it } from "vitest";
import {
  viewToggleWrapStyle,
  viewToggleBtnBase,
  viewToggleBtnLast,
  viewToggleActiveStyle,
  SCHEDULE_CHIPS,
  RISK_CHIPS,
  VIEW_OPTIONS,
} from "../deliveryControlCenterStyleHelpers";

describe("deliveryControlCenterStyleHelpers", () => {
  it("view toggle chrome", () => {
    expect(viewToggleWrapStyle.display).toBe("flex");
    expect(viewToggleBtnBase.fontSize).toBe(13);
    expect(viewToggleBtnLast.borderRight).toBe("none");
    expect(viewToggleActiveStyle.background).toBe("var(--cmd-text)");
  });
});

describe("delivery filter chips", () => {
  it("schedule / risk / view options", () => {
    expect(SCHEDULE_CHIPS.some((c) => c.id === "late")).toBe(true);
    expect(RISK_CHIPS.some((c) => c.id === "high")).toBe(true);
    expect(VIEW_OPTIONS.map((v) => v.id)).toEqual([
      "register",
      "dispatch",
      "schedule",
    ]);
  });
});

