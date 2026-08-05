import { describe, expect, it } from "vitest";
import {
  urgencyTone,
  statusTone,
  STATUS_CHIPS,
} from "../fieldTodayControlCenterHelpers";

describe("fieldTodayControlCenterHelpers", () => {
  it("urgency and status tones", () => {
    expect(urgencyTone("overdue")).toBe("danger");
    expect(statusTone("Complete")).toBe("good");
  });
  it("status chips", () => {
    expect(STATUS_CHIPS.map((c) => c.value)).toContain("due-today");
  });
});
