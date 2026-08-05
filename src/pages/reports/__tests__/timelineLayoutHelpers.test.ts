import { describe, expect, it } from "vitest";
import {
  LANE_HEIGHT,
  BAR_HEIGHT,
  HEADER_HEIGHT,
  LEFT_GUTTER,
  RIGHT_GUTTER,
} from "../timelineHelpers";

describe("timeline layout sizes", () => {
  it("exports stable layout tokens", () => {
    expect(LANE_HEIGHT).toBe(36);
    expect(BAR_HEIGHT).toBe(18);
    expect(HEADER_HEIGHT).toBe(32);
    expect(LEFT_GUTTER).toBe(120);
    expect(RIGHT_GUTTER).toBe(16);
  });
});
