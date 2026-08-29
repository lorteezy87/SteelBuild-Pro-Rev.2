import { describe, expect, it } from "vitest";
import { computeCpmFloat } from "../cpmFloat";

function task(partial: Record<string, any>) {
  return {
    status: "Not Started",
    percent_complete: 0,
    ...partial,
  };
}

describe("computeCpmFloat", () => {
  it("returns empty map for empty input", () => {
    expect(computeCpmFloat([]).size).toBe(0);
  });

  it("marks a lone dated leaf as critical (zero float vs project finish)", () => {
    const t = task({ id: "a", task_name: "Fab beams", start_date: "2026-06-01", end_date: "2026-06-10" });
    const row = computeCpmFloat([t]).get("a");
    expect(row?.totalFloat).toBe(0);
    expect(row?.critical).toBe(true);
  });

  it("computes float on a 3-task FS chain", () => {
    const pred = task({
      id: "p",
      task_name: "Detail",
      start_date: "2026-06-01",
      end_date: "2026-06-05",
    });
    const mid = task({
      id: "m",
      task_name: "Fab",
      start_date: "2026-06-10",
      end_date: "2026-06-20",
      dependencies: [{ id: "p", type: "FS", lag_days: 1 }],
    });
    const last = task({
      id: "z",
      task_name: "Erect",
      start_date: "2026-07-01",
      end_date: "2026-07-10",
      dependencies: [{ id: "m", type: "FS", lag_days: 1 }],
    });
    const map = computeCpmFloat([pred, mid, last]);
    expect(map.get("z")?.critical).toBe(true);
    expect((map.get("p")?.totalFloat ?? 0) >= 0).toBe(true);
  });

  it("summaries inherit min float / any-critical", () => {
    const parent = task({ id: "parent", task_name: "Area A", is_summary: true, _hasChildren: true });
    const child = task({
      id: "c",
      parent_task_id: "parent",
      task_name: "Leaf",
      start_date: "2026-06-01",
      end_date: "2026-06-02",
    });
    const map = computeCpmFloat([parent, child]);
    expect(map.get("parent")?.critical).toBe(true);
    expect(map.get("parent")?.totalFloat).toBe(0);
  });
});
