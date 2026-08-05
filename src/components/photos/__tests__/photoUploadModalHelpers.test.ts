import { describe, expect, it } from "vitest";
import {
  cancelButtonStyle,
  uploadButtonStyle,
  inputStyle,
  compactInputStyle,
  PHOTO_CATEGORIES,
  MAX_PHOTO_DIMENSION,
  PHOTO_COMPRESS_QUALITY,
  MAX_PHOTO_FILES,
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

describe("photo upload constants", () => {
  it("categories and limits", () => {
    expect(PHOTO_CATEGORIES).toContain("Safety");
    expect(MAX_PHOTO_DIMENSION).toBe(2400);
    expect(PHOTO_COMPRESS_QUALITY).toBe(0.86);
    expect(MAX_PHOTO_FILES).toBe(25);
  });
});

