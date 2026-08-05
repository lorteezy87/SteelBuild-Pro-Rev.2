import { describe, expect, it } from "vitest";
import { RESOURCE_HUB_TAB_DEFS } from "../resourceHubPageHelpers";

describe("RESOURCE_HUB_TAB_DEFS", () => {
  it("includes register and schedule", () => {
    expect(RESOURCE_HUB_TAB_DEFS.map((t) => t.key)).toEqual(["register", "schedule"]);
  });
});
