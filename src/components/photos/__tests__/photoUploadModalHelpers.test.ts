import { describe, expect, it } from "vitest";
import {
  cancelButtonStyle,
  uploadButtonStyle,
  inputStyle,
  compactInputStyle,
} from "../photoUploadModalHelpers";

describe("photoUploadModalHelpers", () => {
  it("action button styles", () => {
    expect(cancelButtonStyle().cursor).toBe("pointer");
    expect(cancelButtonStyle(true).opacity).toBe(0.5);
    expect(uploadButtonStyle().background).toBe("var(--accent)");
  });
  it("input styles", () => {
    expect(inputStyle.fontSize).toBe(11);
    expect(compactInputStyle.fontSize).toBe(10);
    expect(compactInputStyle.padding).toBe("5px 7px");
  });
});
