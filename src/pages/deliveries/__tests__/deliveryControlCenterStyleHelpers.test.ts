import { describe, expect, it } from "vitest";
import {
  viewToggleWrapStyle,
  viewToggleBtnBase,
  viewToggleBtnLast,
  viewToggleActiveStyle,
} from "../deliveryControlCenterStyleHelpers";

describe("deliveryControlCenterStyleHelpers", () => {
  it("view toggle chrome", () => {
    expect(viewToggleWrapStyle.display).toBe("flex");
    expect(viewToggleBtnBase.fontSize).toBe(13);
    expect(viewToggleBtnLast.borderRight).toBe("none");
    expect(viewToggleActiveStyle.background).toBe("var(--cmd-text)");
  });
});
