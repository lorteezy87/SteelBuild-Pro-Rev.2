import { describe, expect, it } from "vitest";
import {
  activityTone, alertPriorityTone,
} from "../dashboardControlCenterHelpers";

describe("dashboard control center tones", () => {
  it("activity and alert priority tones", () => {
    expect(activityTone("approved")).toBe("good");
    expect(activityTone("waiting")).toBe("warn");
    expect(activityTone("open")).toBe("danger");
    expect(activityTone("progress")).toBe("info");
    expect(activityTone("x")).toBe("neutral");
    expect(alertPriorityTone("high")).toBe("danger");
    expect(alertPriorityTone("medium")).toBe("warn");
    expect(alertPriorityTone("low")).toBe("neutral");
  });
});
