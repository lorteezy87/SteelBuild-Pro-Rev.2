import { describe, expect, it } from "vitest";
import {
  DELIVERY_STATUS_DOT,
  DETAILING_STAGES,
  STAGE_DISPLAY,
  tintColor,
} from "../ganttTaskRowsHelpers";

describe("ganttTaskRowsHelpers", () => {
  it("delivery status dots", () => {
    expect(DELIVERY_STATUS_DOT.Delivered).toBeTruthy();
    expect(DELIVERY_STATUS_DOT["In Transit"]).toBeTruthy();
  });
  it("detailing stages order", () => {
    expect(DETAILING_STAGES[0]).toBe("IFA");
    expect(DETAILING_STAGES).toContain("Released");
  });
  it("stage display defaults empty", () => {
    expect(Object.keys(STAGE_DISPLAY)).toHaveLength(0);
  });
  it("tintColor uses color-mix", () => {
    expect(tintColor("#fff", 10)).toContain("color-mix");
    expect(tintColor("#fff", 10)).toContain("10%");
  });
});
