import { describe, expect, it } from "vitest";
import { getScheduleTaskRowKey } from "../ScheduleTaskList";

describe("getScheduleTaskRowKey", () => {
  it("uses real task ids when available", () => {
    expect(getScheduleTaskRowKey({ id: "task-1", task_name: "Detailing" }, 0, "Detailing")).toBe("task-1");
  });

  it("falls back to phase, WBS, name, and row index when imported rows are missing ids", () => {
    const first = getScheduleTaskRowKey({ id: "", wbs_code: "1.1", task_name: "TBD" }, 0, "Detailing");
    const second = getScheduleTaskRowKey({ id: "", wbs_code: "1.1", task_name: "TBD" }, 1, "Detailing");

    expect(first).toBe("Detailing:1.1:TBD:0");
    expect(second).toBe("Detailing:1.1:TBD:1");
    expect(first).not.toBe(second);
  });
});
