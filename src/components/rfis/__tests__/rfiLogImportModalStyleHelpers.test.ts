import { describe, expect, it } from "vitest";
import {
  AI,
  btnPrimary,
  btnGhost,
  projectSelectButtonStyle,
  projectSelectMenuStyle,
  projectSelectOptionStyle,
} from "../rfiLogImportModalStyleHelpers";

describe("rfiLogImportModalStyleHelpers", () => {
  it("button chrome", () => {
    expect(btnPrimary.background).toBe(AI);
    expect(btnGhost.background).toBe("transparent");
  });
  it("project select styles", () => {
    expect(projectSelectButtonStyle.minHeight).toBe(36);
    expect(projectSelectMenuStyle.zIndex).toBe(4000);
    expect(projectSelectOptionStyle(true).fontWeight).toBe(800);
    expect(projectSelectOptionStyle(false).fontWeight).toBe(600);
  });
});
