import { describe, expect, it } from "vitest";
import { formatPhotoDate, formatPhotoGroupKey } from "../photoGalleryFormatHelpers";

describe("photo format helpers", () => {
  it("formats date and group key", () => {
    expect(formatPhotoDate("2026-01-15")).toMatch(/2026|Jan/);
    expect(formatPhotoGroupKey("2026-01-15")).toMatch(/January|2026/);
    expect(formatPhotoDate(null)).toBe("—");
  });
});
