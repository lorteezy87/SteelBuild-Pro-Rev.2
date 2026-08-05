import { describe, expect, it } from "vitest";
import {
  iStyle,
  labelStyle,
  darkSelectButtonStyle,
  darkSelectMenuStyle,
  darkSelectOptionStyle,
  attachmentDropStyle,
  uploadButtonStyle,
  attachmentRowStyle,
  attachmentActionStyle,
} from "../rfiFormModalStyleHelpers";

describe("rfiFormModalStyleHelpers", () => {
  it("iStyle and labelStyle are stable form chrome", () => {
    expect(iStyle.fontSize).toBe(12);
    expect(iStyle.boxSizing).toBe("border-box");
    expect(labelStyle.fontSize).toBe(9);
    expect(labelStyle.textTransform).toBe("uppercase");
  });

  it("darkSelectButtonStyle extends iStyle", () => {
    expect(darkSelectButtonStyle.minHeight).toBe(37);
    expect(darkSelectButtonStyle.display).toBe("flex");
    expect(darkSelectButtonStyle.fontSize).toBe(iStyle.fontSize);
  });

  it("darkSelectMenuStyle positions above the page chrome", () => {
    expect(darkSelectMenuStyle.position).toBe("absolute");
    expect(darkSelectMenuStyle.zIndex).toBe(4000);
    expect(darkSelectMenuStyle.maxHeight).toBe(220);
  });

  it("darkSelectOptionStyle toggles active accent", () => {
    expect(darkSelectOptionStyle(true).background).toBe("var(--accent-muted)");
    expect(darkSelectOptionStyle(true).fontWeight).toBe(800);
    expect(darkSelectOptionStyle(false).background).toBe("transparent");
    expect(darkSelectOptionStyle(false).fontWeight).toBe(600);
  });

  it("attachment styles keep dropzone and action chrome", () => {
    expect(attachmentDropStyle.display).toBe("flex");
    expect(uploadButtonStyle.textTransform).toBe("uppercase");
    expect(attachmentRowStyle.display).toBe("grid");
    expect(attachmentActionStyle.fontSize).toBe(8);
  });
});
