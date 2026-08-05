import { describe, expect, it } from "vitest";
import { sectionLabelStyle } from "../dailyLogsListStyleHelpers";

describe("dailyLogsListStyleHelpers", () => {
  it("section label", () => {
    expect(sectionLabelStyle.fontSize).toBe("9px");
    expect(sectionLabelStyle.fontWeight).toBe(700);
  });
});
