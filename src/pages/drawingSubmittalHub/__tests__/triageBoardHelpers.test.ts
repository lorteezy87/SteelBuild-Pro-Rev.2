import { describe, expect, it } from "vitest";
import {
  ELEMENT_BUCKET_ORDER,
  DRILLDOWN_ROW_CAP,
  SCHEDULE_ROWS,
} from "../triageBoardHelpers";

describe("triageBoardHelpers", () => {
  it("bucket order and schedule rows", () => {
    expect(ELEMENT_BUCKET_ORDER[0]).toBe("rfi_blocked");
    expect(DRILLDOWN_ROW_CAP).toBe(100);
    expect(SCHEDULE_ROWS.some(([k]) => k === "fabReleaseRequiredBy")).toBe(true);
  });
});
