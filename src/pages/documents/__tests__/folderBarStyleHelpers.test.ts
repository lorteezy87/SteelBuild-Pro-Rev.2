import { describe, expect, it } from "vitest";
import {
  PILL_BTN,
  PRIMARY_BTN,
  CRUMB_LINK,
  CRUMB_CURRENT,
  CARD_STYLE,
} from "../folderBarStyleHelpers";

describe("folderBarStyleHelpers", () => {
  it("button and crumb chrome", () => {
    expect(PILL_BTN.fontSize).toBe(10);
    expect(PRIMARY_BTN.background).toBe("var(--accent)");
    expect(CRUMB_CURRENT.cursor).toBe("default");
    expect(CARD_STYLE.borderRadius).toBe(8);
    expect(CRUMB_LINK.cursor).toBe("pointer");
  });
});
