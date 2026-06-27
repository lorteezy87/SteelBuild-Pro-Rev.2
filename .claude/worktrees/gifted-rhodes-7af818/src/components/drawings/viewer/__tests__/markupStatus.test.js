/**
 * Tests for the markup-status cycle constants exported from
 * AnnotationLayer. The cycle is the single piece of behavior new
 * callers depend on, so we lock it down here.
 */

import { describe, it, expect } from "vitest";
import {
  MARKUP_STATUS_ORDER,
  MARKUP_STATUS_COLOR,
} from "../AnnotationLayer.jsx";

describe("MARKUP_STATUS_ORDER", () => {
  it("orders the four states the spec requires", () => {
    expect(MARKUP_STATUS_ORDER).toEqual([
      "open",
      "addressed",
      "rejected",
      "clarification",
    ]);
  });
});

describe("MARKUP_STATUS_COLOR", () => {
  it("defines a color for every state", () => {
    for (const k of MARKUP_STATUS_ORDER) {
      expect(MARKUP_STATUS_COLOR[k]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("uses semantically distinct colors", () => {
    const colors = MARKUP_STATUS_ORDER.map((k) => MARKUP_STATUS_COLOR[k]);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
