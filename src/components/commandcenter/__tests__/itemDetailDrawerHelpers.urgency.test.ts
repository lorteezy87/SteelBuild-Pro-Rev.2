import { describe, expect, it } from "vitest";
import { URGENCY_COLORS } from "../itemDetailDrawerHelpers";

describe("URGENCY_COLORS", () => {
  it("maps urgency tones", () => {
    expect(URGENCY_COLORS.overdue).toContain("error");
    expect(URGENCY_COLORS["due-soon"]).toContain("warning");
    expect(URGENCY_COLORS.normal).toContain("border");
  });
});
