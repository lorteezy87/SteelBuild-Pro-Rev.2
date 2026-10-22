import { beforeEach, describe, expect, it, vi } from "vitest";

const { filterAll, filter } = vi.hoisted(() => ({ filterAll: vi.fn(), filter: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({
  entities: { ScheduleBaselineTask: { filterAll, filter }, ScheduleBaseline: { filter: vi.fn() } },
}));

import { fetchBaselineMap } from "../scheduleBaselines";

beforeEach(() => { filterAll.mockReset(); filter.mockReset(); });

describe("fetchBaselineMap", () => {
  it("reads every snapshot row, sorted on a column the table has", async () => {
    filterAll.mockResolvedValue([{ task_id: "t1", baseline_start: "2026-01-01" }, { task_id: "t2" }]);
    const map = await fetchBaselineMap("b1");
    expect(filterAll).toHaveBeenCalledWith({ baseline_id: "b1" }, "task_id");
    expect(filter).not.toHaveBeenCalled();
    expect(Object.keys(map)).toEqual(["t1", "t2"]);
  });

  it("does not read without a baseline", async () => {
    expect(await fetchBaselineMap(null)).toEqual({});
    expect(filterAll).not.toHaveBeenCalled();
  });
});
