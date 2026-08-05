import { describe, expect, it } from "vitest";
import { SCHEDULE_HUB_TAB_DEFS } from "../scheduleHubPageHelpers";

describe("SCHEDULE_HUB_TAB_DEFS", () => {
  it("includes schedule and calendar", () => {
    expect(SCHEDULE_HUB_TAB_DEFS.map((t) => t.key)).toEqual(["schedule", "lookahead", "calendar"]);
  });
});
