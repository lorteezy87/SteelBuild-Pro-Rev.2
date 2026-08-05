import { describe, expect, it } from "vitest";
import { filterSearchableTasks } from "../searchableTaskPickerHelpers";

describe("filterSearchableTasks", () => {
  const tasks = [
    { id: "1", task_name: "Erect columns", wbs_code: "1.1", phase: "Erection" },
    { id: "2", task_name: "Shop fab", wbs_code: "2.1", phase: "Fabrication" },
  ];
  it("returns first N when empty query", () => {
    expect(filterSearchableTasks(tasks, "", 1)).toHaveLength(1);
  });
  it("matches name/wbs/phase", () => {
    expect(filterSearchableTasks(tasks, "fab").map((t) => t.id)).toEqual(["2"]);
    expect(filterSearchableTasks(tasks, "1.1").map((t) => t.id)).toEqual(["1"]);
  });
});
