import { describe, it, expect } from "vitest";
import { dropZoneFor } from "../useTaskRowDnD";

describe("dropZoneFor", () => {
  const rect = { top: 100, height: 40 }; // <108 before, 108..132 nest, >132 after
  it("returns 'before' near the top edge", () => {
    expect(dropZoneFor(rect, 104)).toBe("before");
  });
  it("returns 'nest' in the middle", () => {
    expect(dropZoneFor(rect, 120)).toBe("nest");
  });
  it("returns 'after' near the bottom edge", () => {
    expect(dropZoneFor(rect, 136)).toBe("after");
  });
});
