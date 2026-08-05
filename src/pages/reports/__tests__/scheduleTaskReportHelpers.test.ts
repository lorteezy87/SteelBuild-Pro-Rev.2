import { describe, expect, it } from "vitest";
import {
  buildScheduleReportRows,
  filterScheduleReportRows,
} from "../scheduleReportHelpers";
import {
  buildCompletedTaskRows,
  filterCompletedTaskRows,
} from "../tasksCompletedHelpers";
import {
  countTasksByStatus,
  buildStatusPhaseMatrix,
  phaseTotalsFromMatrix,
  buildStatusPhaseTableRows,
  TASK_STATUS_KEYS,
} from "../tasksStatusHelpers";

describe("schedule/task report helpers", () => {
  it("schedule report rows + filter", () => {
    const map = new Map([["p1", { name: "Alpha", project_number: "A1" }]]);
    const rows = buildScheduleReportRows(
      [{ id: "t1", project_id: "p1", task_name: "Cut", phase: "Fab", status: "Open", wbs_code: "1.1", assigned_to: "Sam", task_type: "Task" }],
      map,
    );
    expect(rows[0].projectName).toBe("Alpha");
    expect(filterScheduleReportRows(rows, { search: "cut" })).toHaveLength(1);
    expect(filterScheduleReportRows(rows, { phaseFilter: "Detailing" })).toHaveLength(0);
  });

  it("completed tasks window + search", () => {
    const map = new Map([["p1", { name: "Alpha" }]]);
    const now = new Date("2026-08-05T12:00:00Z");
    const rows = buildCompletedTaskRows(
      [
        { id: "1", project_id: "p1", status: "Complete", task_name: "Done", end_date: "2026-08-04" },
        { id: "2", project_id: "p1", status: "Complete", task_name: "Old", end_date: "2026-01-01" },
        { id: "3", project_id: "p1", status: "Open", task_name: "Nope", end_date: "2026-08-04" },
      ],
      map,
      30,
      now,
    );
    expect(rows.map((r) => r.id)).toEqual(["1"]);
    expect(filterCompletedTaskRows(rows, "done")).toHaveLength(1);
  });

  it("status rollups", () => {
    const tasks = [
      { status: "Complete", phase: "Detailing" },
      { status: "In Progress", phase: "Detailing" },
      { status: "Complete", phase: "Fabrication" },
    ];
    const totals = countTasksByStatus(tasks);
    expect(totals.Complete).toBe(2);
    const matrix = buildStatusPhaseMatrix(tasks, ["Detailing", "Fabrication"]);
    expect(matrix.Detailing.Complete).toBe(1);
    const phaseTotals = phaseTotalsFromMatrix(matrix, ["Detailing", "Fabrication"]);
    expect(phaseTotals.Detailing).toBe(2);
    const table = buildStatusPhaseTableRows(
      ["Detailing", "Fabrication"],
      matrix,
      phaseTotals,
      TASK_STATUS_KEYS,
    );
    expect(table[0].total).toBe(2);
  });
});
